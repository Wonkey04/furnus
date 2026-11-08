import type { EventoChat, ItemTranscripto } from "./eventos.js";

export const SERVIDOR_MCP = "furnus";
const PREFIJO_TOOL = `mcp__${SERVIDOR_MCP}__`;

export type ContenidoMcp = { type: string; text?: string }[];

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

export const MENSAJE_SIN_LOGIN = "Claude Code no tiene la sesión iniciada. Abrí una terminal, corré «claude auth login» y probá de nuevo.";

const PATRON_SIN_LOGIN = /not logged in|please run \/login|\/login|invalid api key|authentication[_ ]failed|authentication_error|oauth token has expired|401/i;

type Obj = Record<string, unknown>;
const esObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);

export interface ResultadoFinal {
  esError: boolean;
  texto: string;
  subtipo: string;
}

/**
 * Traduce las líneas de `claude -p --output-format stream-json` a los eventos del chat.
 * Es tolerante: ignora lo que no conoce, para que un campo nuevo del CLI no rompa el panel.
 */
export class Traductor {
  sessionId: string | null = null;
  modelo: string | null = null;
  resultado: ResultadoFinal | null = null;
  /** El CLI avisó que falló la autenticación (evento de reintento o texto del resultado). */
  sinLogin = false;
  private huboDeltas = false;
  private conocidas = new Set<string>();

  constructor(
    private emitir: (e: EventoChat) => void,
    private transcripto: ItemTranscripto[],
  ) {}

  procesar(linea: string): void {
    const t = linea.trim();
    if (!t.startsWith("{")) return;
    let m: unknown;
    try {
      m = JSON.parse(t);
    } catch {
      return;
    }
    if (!esObj(m) || (m.parent_tool_use_id ?? null) !== null) return; // los subagentes no se muestran
    switch (m.type) {
      case "system":
        return this.sistema(m);
      case "stream_event":
        return this.parcial(m);
      case "assistant":
        return this.asistente(m);
      case "user":
        return this.usuario(m);
      case "result":
        return this.final(m);
    }
  }

  private sistema(m: Obj): void {
    if (typeof m.session_id === "string") this.sessionId = m.session_id;
    if (m.subtype === "init") {
      if (typeof m.model === "string") this.modelo = m.model;
      const servidores = Array.isArray(m.mcp_servers) ? m.mcp_servers.filter(esObj) : [];
      const furnus = servidores.find((s) => s.name === SERVIDOR_MCP);
      if (!furnus || (furnus.status !== undefined && furnus.status !== "connected")) {
        this.error("Claude Code no pudo conectar las herramientas de Furnus. Reiniciá «pnpm dev» y probá de nuevo.");
      }
    } else if (m.subtype === "api_retry" && m.error === "authentication_failed") {
      this.sinLogin = true;
    }
  }

  private parcial(m: Obj): void {
    const ev = m.event;
    if (!esObj(ev) || ev.type !== "content_block_delta" || !esObj(ev.delta)) return;
    if (ev.delta.type === "text_delta" && typeof ev.delta.text === "string" && ev.delta.text) {
      this.huboDeltas = true;
      this.emitir({ tipo: "texto", delta: ev.delta.text });
    }
  }

  private asistente(m: Obj): void {
    const mensaje = esObj(m.message) ? m.message : null;
    if (!mensaje) return;
    if (typeof m.session_id === "string") this.sessionId = m.session_id;
    if (typeof mensaje.model === "string" && mensaje.model !== "<synthetic>") this.modelo ??= mensaje.model;
    const bloques = Array.isArray(mensaje.content) ? mensaje.content.filter(esObj) : [];

    const dicho = bloques
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("")
      .trim();
    if (dicho) {
      // Sin `--include-partial-messages` (o con un CLI que no manda deltas) el texto llega recién acá.
      if (!this.huboDeltas) this.emitir({ tipo: "texto", delta: dicho });
      this.transcripto.push({ tipo: "asistente", texto: dicho });
    }
    this.huboDeltas = false;

    for (const b of bloques) {
      if (b.type !== "tool_use" || typeof b.id !== "string" || this.conocidas.has(b.id)) continue;
      this.conocidas.add(b.id);
      const nombre = String(b.name ?? "").replace(PREFIJO_TOOL, "");
      this.transcripto.push({ tipo: "herramienta", id: b.id, nombre, estado: "ejecutando" });
      this.emitir({ tipo: "herramienta", id: b.id, nombre, estado: "ejecutando" });
    }
  }

  private usuario(m: Obj): void {
    const mensaje = esObj(m.message) ? m.message : null;
    const bloques = mensaje && Array.isArray(mensaje.content) ? mensaje.content.filter(esObj) : [];
    for (const b of bloques) {
      if (b.type !== "tool_result" || typeof b.tool_use_id !== "string") continue;
      const id = b.tool_use_id;
      const item = this.transcripto.find((i) => i.tipo === "herramienta" && i.id === id);
      if (!item || item.tipo !== "herramienta") continue;
      const esError = b.is_error === true;
      const contenido: ContenidoMcp =
        typeof b.content === "string"
          ? [{ type: "text", text: b.content }]
          : Array.isArray(b.content)
            ? b.content.filter(esObj).map((c) => ({ type: String(c.type), ...(typeof c.text === "string" ? { text: c.text } : {}) }))
            : [];
      const resumen = resumirResultado(contenido, esError);
      const estado = esError ? "error" : "ok";
      Object.assign(item, { estado, resumen });
      this.emitir({ tipo: "herramienta", id, nombre: item.nombre, estado, resumen });
    }
  }

  private final(m: Obj): void {
    if (typeof m.session_id === "string") this.sessionId = m.session_id;
    const texto = typeof m.result === "string" ? m.result : "";
    const esError = m.is_error === true || (typeof m.subtype === "string" && m.subtype.startsWith("error"));
    this.resultado = { esError, texto, subtipo: typeof m.subtype === "string" ? m.subtype : "" };
    if (esError && PATRON_SIN_LOGIN.test(texto)) this.sinLogin = true;
  }

  /** Cierra a error lo que haya quedado «ejecutando» (el proceso murió antes de devolver el resultado). */
  interrumpir(): void {
    for (const i of this.transcripto) {
      if (i.tipo === "herramienta" && i.estado === "ejecutando") {
        Object.assign(i, { estado: "error", resumen: "interrumpida" });
        this.emitir({ tipo: "herramienta", id: i.id, nombre: i.nombre, estado: "error", resumen: "interrumpida" });
      }
    }
  }

  private error(mensaje: string): void {
    this.transcripto.push({ tipo: "error", mensaje });
    this.emitir({ tipo: "error", mensaje });
  }
}
