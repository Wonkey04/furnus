import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Dependencias } from "@furnus/app";
import { crearServidorMcp } from "@furnus/mcp-server";
import type { AgentePuerto, EstadoChat, EventoChat, ItemTranscripto } from "./eventos.js";

type Mensaje = Anthropic.Beta.BetaMessageParam;
type Herramienta = Anthropic.Beta.BetaTool;
type BloqueResultado = Anthropic.Beta.BetaToolResultBlockParam;

export const MODELO_POR_DEFECTO = "claude-opus-5-5";
const MAX_VUELTAS = 24;

export function promptSistema(piezaId: string): string {
  return `Sos el asistente de diseño de Furnus, un CAD paramétrico en la web. La persona te pide una pieza 3D y la ve en un visor junto a este chat; vos la construís con las herramientas.

Estás trabajando sobre UNA pieza (id ${piezaId}). Todas las herramientas ya apuntan a ella: no hace falta pasar el id.

Cómo trabajar:
- Respondé en español rioplatense (vos), corto y concreto. La persona no necesita ver el script: queda guardado como revisión de la pieza. No lo pegues en el chat.
- Unidades en milímetros, Z hacia arriba.
- Si el pedido no trae medidas, asumí valores típicos, declaralos como param() y al final listá lo que asumiste en una línea corta («Asumí: 1200 × 700 mm, alto 740 mm»). Preguntá solo si la duda cambia la forma del objeto, no sus dimensiones.
- Si piden cambiar un valor de algo que ya existe («poné el espesor en 30»), usá cambiar_parametros; no reescribas el script.
- Después de crear o cambiar la pieza, verificá: mirá medidas y valida en la respuesta, y si la forma importa usá renderizar para ver el resultado antes de decir que está listo.
- Si el script falla, el error trae línea y sugerencia: corregilo y volvé a intentar sin pedirle nada a la persona. Si lo pedido es imposible, decí cuál es el máximo posible y preguntá.
- Exportar el STEP lo hace la persona desde el botón «Exportar» del visor; no llames a exportar salvo que te lo pidan.`;
}

/** Quita `pieza` del esquema: el agente no la elige, la fija el chat. */
function paraElModelo(t: { name: string; description?: string; inputSchema: unknown }): Herramienta {
  const esquema = structuredClone(t.inputSchema) as { properties?: Record<string, unknown>; required?: string[] } & Record<string, unknown>;
  if (esquema.properties) delete esquema.properties.pieza;
  if (Array.isArray(esquema.required)) esquema.required = esquema.required.filter((r) => r !== "pieza");
  return { name: t.name, description: t.description ?? "", input_schema: esquema as Herramienta["input_schema"] };
}

type ContenidoMcp = { type: string; text?: string; data?: string; mimeType?: string }[];

function aBloquesDeResultado(contenido: ContenidoMcp): BloqueResultado["content"] {
  const bloques: Exclude<BloqueResultado["content"], string | undefined> = [];
  for (const c of contenido) {
    if (c.type === "text" && c.text !== undefined) bloques.push({ type: "text", text: c.text });
    else if (c.type === "image" && c.data) {
      bloques.push({
        type: "image",
        source: { type: "base64", media_type: (c.mimeType ?? "image/png") as "image/png", data: c.data },
      });
    }
  }
  return bloques.length ? bloques : [{ type: "text", text: "(sin contenido)" }];
}

/** Una línea para el visor: qué pasó con la herramienta, sin volcar el JSON entero. */
export function resumirResultado(contenido: ContenidoMcp, esError: boolean): string {
  const imagenes = contenido.filter((c) => c.type === "image").length;
  const texto = contenido.find((c) => c.type === "text")?.text ?? "";
  try {
    const j = JSON.parse(texto) as {
      ok?: boolean;
      revision?: number | null;
      error?: { mensaje?: string; sugerencia?: string | null } | null;
      aviso?: string;
      valida?: boolean;
      medidas?: { caja?: number[] } | null;
      consulta?: string;
      valor?: number;
      unidad?: string;
    };
    if (j.error?.mensaje) return j.error.mensaje;
    if (imagenes) return `${imagenes} ${imagenes === 1 ? "imagen" : "imágenes"}`;
    if (j.revision) {
      const caja = j.medidas?.caja ? ` · ${j.medidas.caja.map((m) => Number(m.toFixed(1))).join(" × ")} mm` : "";
      return `revisión ${j.revision}${caja}${j.valida === false ? " · geometría inválida" : ""}`;
    }
    if (j.consulta) return `${j.consulta}: ${j.valor} ${j.unidad ?? ""}`.trim();
  } catch {
    /* no era JSON */
  }
  return esError ? texto.slice(0, 160) : imagenes ? `${imagenes} imágenes` : "listo";
}

export function mensajeDeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "La clave de la API de Anthropic no es válida. Revisá ANTHROPIC_API_KEY en .env.";
  if (e instanceof Anthropic.RateLimitError) return "Se llegó al límite de uso de la API de Anthropic. Probá de nuevo en un rato.";
  if (e instanceof Anthropic.APIConnectionError) return "No se pudo conectar con la API de Anthropic. Revisá tu conexión.";
  if (e instanceof Anthropic.APIError) return `La API de Anthropic respondió con un error (${e.status ?? "sin código"}): ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

interface Conversacion {
  historial: Mensaje[];
  transcripto: ItemTranscripto[];
  ocupado: boolean;
  control: AbortController | null;
}

export interface OpcionesAgente {
  deps: Dependencias;
  apiKey?: string;
  modelo?: string;
  /** Para tests: reemplaza al cliente de Anthropic. */
  cliente?: Pick<Anthropic, "beta">;
}

export class Agente implements AgentePuerto {
  readonly modelo: string;
  private cliente: Pick<Anthropic, "beta"> | null;
  private conversaciones = new Map<string, Conversacion>();
  private mcp: Promise<{ cliente: Client; herramientas: Herramienta[] }> | null = null;

  constructor(private opciones: OpcionesAgente) {
    this.modelo = opciones.modelo || MODELO_POR_DEFECTO;
    this.cliente = opciones.cliente ?? (opciones.apiKey ? new Anthropic({ apiKey: opciones.apiKey }) : null);
  }

  get disponible(): boolean {
    return this.cliente !== null;
  }

  private conversacion(piezaId: string): Conversacion {
    let c = this.conversaciones.get(piezaId);
    if (!c) {
      c = { historial: [], transcripto: [], ocupado: false, control: null };
      this.conversaciones.set(piezaId, c);
    }
    return c;
  }

  estado(piezaId: string): EstadoChat {
    const c = this.conversacion(piezaId);
    return { ocupado: c.ocupado, transcripto: structuredClone(c.transcripto) };
  }

  cancelar(piezaId: string): void {
    this.conversaciones.get(piezaId)?.control?.abort();
  }

  /** Las mismas tools que ve un agente externo, conectadas en memoria al servidor MCP. */
  private conectarMcp() {
    this.mcp ??= (async () => {
      const servidor = crearServidorMcp(this.opciones.deps);
      const [a, b] = InMemoryTransport.createLinkedPair();
      const cliente = new Client({ name: "furnus-chat", version: "0.1.0" });
      await Promise.all([servidor.connect(a), cliente.connect(b)]);
      const { tools } = await cliente.listTools();
      return { cliente, herramientas: tools.map(paraElModelo) };
    })();
    return this.mcp;
  }

  async enviar(piezaId: string, texto: string, emitir: (e: EventoChat) => void): Promise<void> {
    if (!this.cliente) throw new Error("SIN_CLAVE");
    const c = this.conversacion(piezaId);
    if (c.ocupado) throw new Error("OCUPADO");
    c.ocupado = true;
    const control = (c.control = new AbortController());

    const decir = (e: EventoChat) => {
      try {
        emitir(e);
      } catch {
        /* un visor que se cae no frena al agente */
      }
    };
    c.historial.push({ role: "user", content: texto });
    c.transcripto.push({ tipo: "usuario", texto });
    decir({ tipo: "inicio", texto });

    let cancelado = false;
    try {
      const { cliente: mcp, herramientas } = await this.conectarMcp();
      for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
        const stream = this.cliente.beta.messages.stream(
          {
            model: this.modelo,
            max_tokens: 16000,
            system: promptSistema(piezaId),
            tools: herramientas,
            messages: c.historial,
            output_config: { effort: "medium" },
            // Si un clasificador de seguridad rechaza el pedido, la API lo reintenta con otro modelo.
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
          },
          { signal: control.signal },
        );
        stream.on("text", (delta) => decir({ tipo: "texto", delta }));
        const final = await stream.finalMessage();
        c.historial.push({ role: "assistant", content: final.content as Anthropic.Beta.BetaContentBlockParam[] });

        const dicho = final.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim();
        if (dicho) c.transcripto.push({ tipo: "asistente", texto: dicho });

        if (final.stop_reason === "refusal") {
          this.fallo(c, decir, "El modelo no pudo atender ese pedido. Probá con otras palabras.");
          break;
        }
        if (final.stop_reason === "max_tokens") {
          this.fallo(c, decir, "La respuesta se cortó por largo. Pedile que siga en partes más chicas.");
          break;
        }
        const usos = final.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
        if (final.stop_reason !== "tool_use" || usos.length === 0) break;

        for (const u of usos) {
          const item: ItemTranscripto = { tipo: "herramienta", id: u.id, nombre: u.name, estado: "ejecutando" };
          c.transcripto.push(item);
          decir({ tipo: "herramienta", id: u.id, nombre: u.name, estado: "ejecutando" });
        }
        // Todos los resultados vuelven juntos en un solo mensaje del usuario.
        const resultados: BloqueResultado[] = await Promise.all(
          usos.map(async (u) => {
            const entrada = { ...(u.input as Record<string, unknown>), pieza: piezaId };
            let bloque: BloqueResultado;
            let resumen: string;
            let esError: boolean;
            try {
              const r = (await mcp.callTool({ name: u.name, arguments: entrada })) as { content: ContenidoMcp; isError?: boolean };
              esError = r.isError === true;
              resumen = resumirResultado(r.content, esError);
              bloque = { type: "tool_result", tool_use_id: u.id, content: aBloquesDeResultado(r.content), is_error: esError || undefined };
            } catch (e) {
              esError = true;
              resumen = e instanceof Error ? e.message : String(e);
              bloque = { type: "tool_result", tool_use_id: u.id, content: resumen, is_error: true };
            }
            const estado = esError ? "error" : "ok";
            const item = c.transcripto.find((i) => i.tipo === "herramienta" && i.id === u.id);
            if (item && item.tipo === "herramienta") Object.assign(item, { estado, resumen });
            decir({ tipo: "herramienta", id: u.id, nombre: u.name, estado, resumen });
            return bloque;
          }),
        );
        c.historial.push({ role: "user", content: resultados });
        if (vuelta === MAX_VUELTAS - 1) this.fallo(c, decir, "Se cortó después de demasiados pasos seguidos. Decile qué falta y sigue.");
      }
    } catch (e) {
      cancelado = control.signal.aborted;
      if (!cancelado) this.fallo(c, decir, mensajeDeError(e));
      this.repararHistorial(c);
    } finally {
      c.ocupado = false;
      c.control = null;
      decir({ tipo: "fin", ...(cancelado ? { cancelado: true } : {}) });
    }
  }

  private fallo(c: Conversacion, decir: (e: EventoChat) => void, mensaje: string): void {
    c.transcripto.push({ tipo: "error", mensaje });
    decir({ tipo: "error", mensaje });
  }

  /** Si se cortó con tools pendientes, la API exige un tool_result por cada tool_use: se los cierra como error. */
  private repararHistorial(c: Conversacion): void {
    const ultimo = c.historial.at(-1);
    if (ultimo?.role !== "assistant" || !Array.isArray(ultimo.content)) return;
    const pendientes = ultimo.content.filter((b) => b.type === "tool_use");
    if (pendientes.length === 0) return;
    c.historial.push({
      role: "user",
      content: pendientes.map((b) => ({
        type: "tool_result" as const,
        tool_use_id: (b as { id: string }).id,
        content: "La conversación se interrumpió antes de ejecutar esta herramienta.",
        is_error: true,
      })),
    });
    for (const i of c.transcripto) if (i.tipo === "herramienta" && i.estado === "ejecutando") Object.assign(i, { estado: "error", resumen: "interrumpida" });
  }
}
