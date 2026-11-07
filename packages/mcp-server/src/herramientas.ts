import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CrearPieza,
  EjecutarScript,
  Exportar,
  ListarPiezas,
  MedirPieza,
  type Dependencias,
} from "@furnus/app";
import { ErrorDeDominio } from "@furnus/core";

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

Qué devuelve (después de CADA ejecución): ok, error (tipo, mensaje, línea y traceback legible si el script falló), medidas (caja X×Y×Z, volumen, área), valida y motivos (si la geometría es un sólido válido), parametros declarados y revision. Si ok es false, la pieza anterior sigue vigente: leé el error, corregí el script y volvé a llamar. Si valida es false, arreglá la geometría antes de exportar (por ejemplo, sólidos separados).

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
        const destino = await resolverPieza(id, nombre);
        const r = await new EjecutarScript(deps).ejecutar({ piezaId: destino.id, script, parametros, origen: "agente" });
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
        const destino = await resolverPieza(id);
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
        const destino = await resolverPieza(id);
        const r = await new Exportar(deps).ejecutar({ piezaId: destino.id, formato, unidad });
        return texto({ ok: true, ...r });
      } catch (e) {
        return errorLegible(e);
      }
    },
  );

  return servidor;
}
