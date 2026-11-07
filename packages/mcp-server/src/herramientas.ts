import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CambiarParametros,
  CrearPieza,
  EjecutarScript,
  Exportar,
  ListarPiezas,
  MedirPieza,
  type Dependencias,
} from "@furnus/app";
import { ErrorDeDominio } from "@furnus/core";
import type { EventoPieza } from "@furnus/app";

export const EJEMPLO_SCRIPT = `from furnus import param, sel, validar
from build123d import *

largo   = param("largo", 60, min=10, max=200, unidad="mm")
ancho   = param("ancho", 40, min=10, max=200, unidad="mm")
espesor = param("espesor", 3, min=1, max=20, unidad="mm")

with BuildPart() as pieza:
    Box(largo, ancho, 24)
    fillet(sel.aristas(pieza, "superiores"), radius=2)

resultado = pieza.part   # el sandbox lee esta variable
validar(resultado)`;

export const DESCRIPCION_EJECUTAR = `Ejecuta un script de build123d (Python) en el sandbox de Furnus y devuelve el resultado. Es la herramienta principal: la pieza ES lo que resulta de correr el script, así que para cambiar la pieza mandá el script completo de nuevo.

Reglas del script:
- Unidades en milímetros. Z hacia arriba.
- Todo valor que una persona querría ajustar se declara con param(nombre, valor, min=, max=, unidad=). El visor arma el panel de parámetros con eso.
- El script tiene que terminar dejando la pieza en la variable «resultado» (un Part de build123d, un solo sólido) y llamar validar(resultado).
- Solo se pueden importar: build123d, math y furnus. No hay archivos, red, os ni subprocess.
- Selectores semánticos en vez de índices: sel.aristas(pieza, "superiores" | "inferiores" | "verticales"), sel.caras(pieza, "superior" | "inferior" | "frontal" | "trasera" | "izquierda" | "derecha"), sel.agujeros(pieza).

Cuando el pedido no trae medidas («hacé una mesa»):
- Asumí valores típicos y razonables, sin preguntar, y declarálos todos como param() para que la persona los ajuste.
- Al final de tu respuesta listá las suposiciones («Asumí: largo 1200 mm, alto 740 mm…») para que la persona las corrija.
- Preguntá solo si la ambigüedad cambia la FORMA del objeto (¿con cajones o sin?), no sus dimensiones.
- Si el pedido es imposible (un filete que no entra, una pared más gruesa que la pieza), no inventes: decí cuál es el máximo posible y preguntá si lo querés así.

Para ajustar solo un valor de una pieza que ya existe, usá cambiar_parametros: no hace falta mandar el script de nuevo.

Qué devuelve (después de CADA ejecución): ok, error (tipo, mensaje, línea, traceback legible y sugerencia con el límite o el nombre correcto si el script falló), medidas (caja X×Y×Z, volumen, área), valida y motivos (si la geometría es un sólido válido), parametros declarados y revision. Si ok es false, la pieza anterior sigue vigente: leé el error, corregí el script y volvé a llamar. Si valida es false, arreglá la geometría antes de exportar (por ejemplo, sólidos separados).

Ejemplo:

${EJEMPLO_SCRIPT}`;

type Contenido = { content: { type: "text"; text: string }[]; isError?: boolean };

function texto(valor: unknown, esError = false): Contenido {
  return { content: [{ type: "text", text: typeof valor === "string" ? valor : JSON.stringify(valor, null, 2) }], isError: esError || undefined };
}

function errorLegible(e: unknown): Contenido {
  if (e instanceof ErrorDeDominio) return texto({ ok: false, error: { codigo: e.codigo, mensaje: e.message } }, true);
  return texto({ ok: false, error: { codigo: "ERROR_INTERNO", mensaje: e instanceof Error ? e.message : String(e) } }, true);
}

export function crearServidorMcp(deps: Dependencias): McpServer {
  const servidor = new McpServer({ name: "furnus", version: "0.1.0" });

  /** Sin id usa la pieza editada más recientemente (o crea una); «nueva» crea otra. */
  async function resolverPieza(id?: string, nombre?: string): Promise<{ id: string; nombre: string }> {
    if (id && id !== "nueva") return { id, nombre: (await deps.repositorio.obtener(id))?.nombre ?? id };
    if (!id) {
      const ultima = (await new ListarPiezas(deps).ejecutar())[0];
      if (ultima) return { id: ultima.id, nombre: ultima.nombre };
    }
    const nueva = await new CrearPieza(deps).ejecutar({ nombre });
    return { id: nueva.id, nombre: nueva.nombre };
  }

  /** Para medir, exportar y cambiar parámetros: nunca crea una pieza (no hay nada que medir en una vacía). */
  async function resolverExistente(id?: string): Promise<{ id: string; nombre: string }> {
    if (id === "nueva") throw new ErrorDeDominio("PIEZA_NO_ENCONTRADA", "«nueva» solo sirve con ejecutar_script.");
    const pieza = id
      ? await deps.repositorio.obtener(id)
      : ((await new ListarPiezas(deps).ejecutar()).find((p) => p.revisiones.length > 0) ?? null);
    if (!pieza) {
      throw new ErrorDeDominio(
        "PIEZA_NO_ENCONTRADA",
        id ? `No existe la pieza «${id}».` : "Todavía no hay ninguna pieza. Creá una con ejecutar_script.",
      );
    }
    return { id: pieza.id, nombre: pieza.nombre };
  }

  /**
   * Una pieza nueva solo existe si su primera ejecución sale bien: hasta entonces los eventos se
   * retienen, y si falla se borra, para no dejar piezas huérfanas sin revisión válida.
   */
  async function ejecutarEnPiezaNueva(script: string, parametros: Record<string, number> | undefined, nombre?: string) {
    const retenidos: EventoPieza[] = [];
    const diferidas: Dependencias = { ...deps, eventos: { publicar: (e) => void retenidos.push(e) } };
    const nueva = await new CrearPieza(diferidas).ejecutar({ nombre });
    try {
      const r = await new EjecutarScript(diferidas).ejecutar({ piezaId: nueva.id, script, parametros, origen: "agente" });
      if (!r.ok) {
        await deps.repositorio.borrar(nueva.id);
        return { destino: { id: nueva.id, nombre: nueva.nombre }, r, descartada: true };
      }
      for (const e of retenidos) await deps.eventos.publicar(e);
      return { destino: { id: nueva.id, nombre: nueva.nombre }, r, descartada: false };
    } catch (e) {
      await deps.repositorio.borrar(nueva.id);
      throw e;
    }
  }

  const pieza = z
    .string()
    .optional()
    .describe("Id de la pieza. Si lo omitís se usa la última pieza editada (o se crea una). «nueva» crea otra pieza.");

  servidor.registerTool(
    "ejecutar_script",
    {
      description: DESCRIPCION_EJECUTAR,
      inputSchema: {
        script: z.string().describe("Script completo de build123d. Reemplaza al anterior."),
        parametros: z.record(z.number()).optional().describe("Valores para los param() declarados, por nombre. Opcional."),
        pieza,
        nombre: z.string().optional().describe("Nombre de la pieza, solo si se crea una nueva."),
      },
    },
    async ({ script, parametros, pieza: id, nombre }) => {
      try {
        if (id === "nueva") {
          const { destino, r, descartada } = await ejecutarEnPiezaNueva(script, parametros, nombre);
          const aviso = descartada
            ? { aviso: "La pieza nueva no se guardó porque el script falló. Corregilo y mandalo de nuevo con pieza: «nueva»." }
            : {};
          return texto({ pieza: descartada ? null : destino, ...r, ...aviso }, !r.ok);
        }
        const destino = await resolverPieza(id, nombre);
        const r = await new EjecutarScript(deps).ejecutar({ piezaId: destino.id, script, parametros, origen: "agente" });
        return texto({ pieza: destino, ...r }, !r.ok);
      } catch (e) {
        return errorLegible(e);
      }
    },
  );

  servidor.registerTool(
    "cambiar_parametros",
    {
      description: `Cambia el valor de uno o más parámetros (los declarados con param()) de una pieza que ya existe, sin reescribir el script. Crea una revisión nueva con el mismo script y los valores nuevos. Ejemplo: «poné el espesor en 30» → { pieza: "<id>", valores: { espesor: 30 } }.
Pasá siempre el id de la pieza (lo devuelve ejecutar_script). Los valores tienen que estar dentro del rango min/max declarado; si no, el error dice cuál es el rango. Devuelve lo mismo que ejecutar_script: medidas, validez y parámetros vigentes. Si hace falta cambiar la forma de la pieza y no solo un valor, usá ejecutar_script.`,
      inputSchema: {
        pieza: z.string().describe("Id de la pieza (el que devolvió ejecutar_script)."),
        valores: z.record(z.number()).describe("Nombre del parámetro → valor nuevo, por ejemplo { espesor: 30 }."),
      },
    },
    async ({ pieza: id, valores }) => {
      try {
        const destino = await resolverExistente(id);
        const r = await new CambiarParametros(deps).ejecutar({ piezaId: destino.id, valores, origen: "agente" });
        return texto({ pieza: destino, ...r }, !r.ok);
      } catch (e) {
        return errorLegible(e);
      }
    },
  );

  servidor.registerTool(
    "medir",
    {
      description:
        "Devuelve una medida de la pieza actual, con unidad. Consultas disponibles: «caja» (X, Y, Z en mm), «volumen» (mm³) y «area» (mm²). Distancias entre selectores y espesor mínimo llegan en una fase posterior.",
      inputSchema: { consulta: z.enum(["caja", "volumen", "area"]), pieza },
    },
    async ({ consulta, pieza: id }) => {
      try {
        const destino = await resolverExistente(id);
        return texto(await new MedirPieza(deps).ejecutar({ piezaId: destino.id, consulta }));
      } catch (e) {
        return errorLegible(e);
      }
    },
  );

  servidor.registerTool(
    "renderizar",
    {
      description:
        "Captura de la pieza desde varias vistas (iso, frente, arriba, derecha). TODAVÍA NO DISPONIBLE: llega en la fase 02. Por ahora confiá en medidas y valida de ejecutar_script.",
      inputSchema: { vistas: z.array(z.enum(["iso", "frente", "arriba", "derecha"])).optional(), pieza },
    },
    async () =>
      texto(
        { ok: false, error: { codigo: "NO_DISPONIBLE", mensaje: "Las capturas todavía no existen (fase 02). Usá las medidas y la validez que devuelve ejecutar_script." } },
        true,
      ),
  );

  servidor.registerTool(
    "exportar",
    {
      description:
        "Exporta la pieza actual a un archivo y devuelve su ruta. Solo funciona si la geometría es válida. Por ahora solo STEP («step»); STL y 3MF llegan en la fase 02. Unidad: «mm» o «in».",
      inputSchema: {
        formato: z.enum(["step", "stl", "3mf"]).default("step"),
        unidad: z.enum(["mm", "in"]).default("mm"),
        pieza,
      },
    },
    async ({ formato, unidad, pieza: id }) => {
      try {
        const destino = await resolverExistente(id);
        const r = await new Exportar(deps).ejecutar({ piezaId: destino.id, formato, unidad });
        return texto({ ok: true, ...r });
      } catch (e) {
        return errorLegible(e);
      }
    },
  );

  return servidor;
}
