import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentePuerto, Diagnostico, EstadoChat, EventoChat, ItemTranscripto } from "./eventos.js";
import { diagnosticarCli, entornoParaCli, lanzadorReal, resolverCli, type CliEncontrado, type Lanzador, type ProcesoCli } from "./cli.js";
import { MENSAJE_SIN_LOGIN, SERVIDOR_MCP, Traductor } from "./traductor.js";

/** Las tools del MCP de Furnus, con el nombre que les da Claude Code. Un test las compara con las del servidor. */
export const HERRAMIENTAS_PERMITIDAS = ["ejecutar_script", "cambiar_parametros", "medir", "renderizar", "exportar"].map((n) => `mcp__${SERVIDOR_MCP}__${n}`);

/** Lo que Claude Code trae de fábrica y acá no hace falta: shell, edición de archivos y web. */
export const HERRAMIENTAS_PROHIBIDAS = ["Bash", "Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch"];

const TIMEOUT_POR_DEFECTO_MS = 10 * 60_000;
const VIGENCIA_DIAGNOSTICO_MS = 30_000;

export function promptSistema(piezaId: string): string {
  return `Sos el asistente de diseño de Furnus, un CAD paramétrico en la web. La persona te pide una pieza 3D y la ve en un visor junto a este chat; vos la construís con las herramientas del servidor «${SERVIDOR_MCP}».

Estás trabajando sobre UNA pieza (id ${piezaId}). En CADA llamada a una herramienta pasá \`pieza: "${piezaId}"\`. Nunca uses «nueva» ni otro id: este chat no crea ni toca otras piezas.

Cómo trabajar:
- Usá solo las herramientas de Furnus. No leas ni escribas archivos, no uses la terminal ni la web: no hace falta.
- Respondé en español rioplatense (vos), corto y concreto. La persona no necesita ver el script: queda guardado como revisión de la pieza. No lo pegues en el chat.
- Unidades en milímetros, Z hacia arriba.
- Si el pedido no trae medidas, asumí valores típicos, declaralos como param() y al final listá lo que asumiste en una línea corta («Asumí: 1200 × 700 mm, alto 740 mm»). Preguntá solo si la duda cambia la forma del objeto, no sus dimensiones.
- Si piden cambiar un valor de algo que ya existe («poné el espesor en 30»), usá cambiar_parametros; no reescribas el script.
- Después de crear o cambiar la pieza, verificá: mirá medidas y valida en la respuesta, y si la forma importa usá renderizar para ver el resultado antes de decir que está listo.
- Si el script falla, el error trae línea y sugerencia: corregilo y volvé a intentar sin pedirle nada a la persona. Si lo pedido es imposible, decí cuál es el máximo posible y preguntá.
- Exportar el STEP lo hace la persona desde el botón «Exportar» del visor; no llames a exportar salvo que te lo pidan.`;
}

export function mensajeDeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export interface ComandoMcp {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface OpcionesAgente {
  /** Cómo se lanza el servidor MCP de Furnus (el mismo `main.ts` que usa un agente externo). */
  mcp: ComandoMcp;
  /** Se pasa con `--model`. Sin esto el CLI usa el modelo que le corresponda a la cuenta. */
  modelo?: string;
  /** Carpeta de trabajo del CLI; vacía a propósito para que no cargue un `CLAUDE.md` ajeno. */
  directorio?: string;
  entorno?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  /** Para tests. */
  lanzador?: Lanzador;
  resolver?: () => CliEncontrado | null;
  plataforma?: NodeJS.Platform;
}

interface Conversacion {
  transcripto: ItemTranscripto[];
  sessionId: string | null;
  ocupado: boolean;
  cancelado: boolean;
  proceso: ProcesoCli | null;
}

export class AgenteCli implements AgentePuerto {
  private conversaciones = new Map<string, Conversacion>();
  private modeloVisto: string | null = null;
  private diagnosticoListo: { en: number; valor: Diagnostico } | null = null;
  private lanzador: Lanzador;

  constructor(private opciones: OpcionesAgente) {
    this.lanzador = opciones.lanzador ?? lanzadorReal;
  }

  get modelo(): string | null {
    return this.opciones.modelo ?? this.modeloVisto;
  }

  private get entorno(): NodeJS.ProcessEnv {
    return this.opciones.entorno ?? process.env;
  }

  private get directorio(): string {
    return this.opciones.directorio ?? join(homedir(), ".furnus", "chat");
  }

  private resolver(): CliEncontrado | null {
    return this.opciones.resolver ? this.opciones.resolver() : resolverCli(this.entorno, this.opciones.plataforma);
  }

  /** Solo se recuerda el «listo»: si falta algo, cada consulta vuelve a mirar (la persona lo está arreglando). */
  async diagnostico(): Promise<Diagnostico> {
    const memo = this.diagnosticoListo;
    if (memo && Date.now() - memo.en < VIGENCIA_DIAGNOSTICO_MS) return memo.valor;
    mkdirSync(this.directorio, { recursive: true });
    const valor = await diagnosticarCli({
      lanzador: this.lanzador,
      resolver: () => this.resolver(),
      env: this.entorno,
      cwd: this.directorio,
      plataforma: this.opciones.plataforma,
    });
    this.diagnosticoListo = valor.estado === "listo" ? { en: Date.now(), valor } : null;
    return valor;
  }

  private conversacion(piezaId: string): Conversacion {
    let c = this.conversaciones.get(piezaId);
    if (!c) {
      c = { transcripto: [], sessionId: null, ocupado: false, cancelado: false, proceso: null };
      this.conversaciones.set(piezaId, c);
    }
    return c;
  }

  estado(piezaId: string): EstadoChat {
    const c = this.conversacion(piezaId);
    return { ocupado: c.ocupado, transcripto: structuredClone(c.transcripto) };
  }

  cancelar(piezaId: string): void {
    const c = this.conversaciones.get(piezaId);
    if (!c?.ocupado) return;
    c.cancelado = true;
    c.proceso?.matar();
  }

  /** Archivos que lee el CLI: el MCP de Furnus y el prompt de la pieza. */
  private prepararArchivos(piezaId: string): { mcp: string; prompt: string } {
    mkdirSync(this.directorio, { recursive: true });
    const { command, args, env } = this.opciones.mcp;
    const mcp = join(this.directorio, "mcp.json");
    const prompt = join(this.directorio, `prompt-${piezaId}.md`);
    const propias = Object.fromEntries(Object.entries(this.entorno).filter(([k, v]) => k.startsWith("FURNUS_") && v !== undefined)) as Record<string, string>;
    writeFileSync(mcp, JSON.stringify({ mcpServers: { [SERVIDOR_MCP]: { command, args, env: { ...propias, ...env } } } }, null, 2));
    writeFileSync(prompt, promptSistema(piezaId));
    return { mcp, prompt };
  }

  private argumentos(archivos: { mcp: string; prompt: string }, sessionId: string | null): string[] {
    return [
      "-p",
      "--output-format", "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--mcp-config", archivos.mcp,
      "--strict-mcp-config",
      "--permission-mode", "dontAsk",
      "--allowedTools", HERRAMIENTAS_PERMITIDAS.join(","),
      "--disallowedTools", HERRAMIENTAS_PROHIBIDAS.join(","),
      "--append-system-prompt-file", archivos.prompt,
      ...(this.opciones.modelo ? ["--model", this.opciones.modelo] : []),
      ...(sessionId ? ["--resume", sessionId] : []),
    ];
  }

  async enviar(piezaId: string, texto: string, emitir: (e: EventoChat) => void): Promise<void> {
    const c = this.conversacion(piezaId);
    if (c.ocupado) throw new Error("OCUPADO");
    c.ocupado = true;
    c.cancelado = false;

    const decir = (e: EventoChat) => {
      try {
        emitir(e);
      } catch {
        /* un visor que se cae no frena al agente */
      }
    };

    let diag: Diagnostico;
    try {
      diag = await this.diagnostico();
    } catch (e) {
      c.ocupado = false;
      throw e;
    }
    const cli = diag.estado === "listo" ? this.resolver() : null;
    if (!cli) {
      c.ocupado = false;
      throw new Error(diag.estado === "sin_login" ? "SIN_LOGIN" : "SIN_CLI");
    }

    c.transcripto.push({ tipo: "usuario", texto });
    decir({ tipo: "inicio", texto });
    const traductor = new Traductor(decir, c.transcripto);
    const falla = (mensaje: string) => {
      c.transcripto.push({ tipo: "error", mensaje });
      decir({ tipo: "error", mensaje });
    };

    let vencio = false;
    let reloj: ReturnType<typeof setTimeout> | undefined;
    try {
      if (c.cancelado) return;
      const proceso = this.lanzador(cli.ruta, this.argumentos(this.prepararArchivos(piezaId), c.sessionId), {
        cwd: this.directorio,
        env: entornoParaCli(this.entorno),
        shell: cli.shell,
      });
      c.proceso = proceso;
      reloj = setTimeout(() => {
        vencio = true;
        proceso.matar();
      }, this.opciones.timeoutMs ?? TIMEOUT_POR_DEFECTO_MS);
      proceso.escribir(texto);
      proceso.cerrarEntrada();

      for await (const linea of proceso.lineas) traductor.procesar(linea);
      const { codigo, error } = await proceso.salida;

      if (traductor.modelo) this.modeloVisto = traductor.modelo;
      const r = traductor.resultado;
      if (c.cancelado) {
        traductor.interrumpir();
      } else if (error?.code === "ENOENT") {
        this.diagnosticoListo = null;
        falla("No se encuentra «claude». Instalá Claude Code y volvé a probar.");
      } else if (vencio) {
        traductor.interrumpir();
        falla(`Claude Code tardó más de ${Math.round((this.opciones.timeoutMs ?? TIMEOUT_POR_DEFECTO_MS) / 60_000)} minutos y se cortó. Probá con un pedido más chico.`);
      } else if (traductor.sinLogin) {
        this.diagnosticoListo = null;
        traductor.interrumpir();
        falla(MENSAJE_SIN_LOGIN);
      } else if (r?.esError) {
        traductor.interrumpir();
        if (/no conversation found/i.test(r.texto)) c.sessionId = null;
        falla(`Claude Code terminó con un error: ${r.texto.trim().slice(0, 300) || r.subtipo || "sin detalle"}`);
      } else if (!r) {
        traductor.interrumpir();
        const cola = proceso.stderr().trim().split(/\r?\n/).slice(-3).join(" ").slice(0, 300);
        falla(`Claude Code terminó sin responder (código ${codigo ?? "?"}).${cola ? ` ${cola}` : ""}`);
      } else if (traductor.sessionId) {
        c.sessionId = traductor.sessionId;
      }
    } catch (e) {
      traductor.interrumpir();
      if (!c.cancelado) falla(mensajeDeError(e));
    } finally {
      clearTimeout(reloj);
      const cancelado = c.cancelado;
      c.ocupado = false;
      c.cancelado = false;
      c.proceso = null;
      decir({ tipo: "fin", ...(cancelado ? { cancelado: true } : {}) });
    }
  }
}
