import { beforeEach, describe, expect, it } from "vitest";
import {
  CASOS_CONTRATO,
  CrearPieza,
  EventosEnMemoria,
  KernelFalso,
  RelojFijo,
  RepositorioEnMemoria,
  SCRIPT_CAJA,
  type Dependencias,
} from "@furnus/app";
import { Agente, mensajeDeError, promptSistema, resumirResultado } from "./agente.js";
import type { EventoChat } from "./eventos.js";

type Bloque = Record<string, unknown>;
interface Respuesta {
  content: Bloque[];
  stop_reason: string;
}

/** Imita el stream del SDK: `on("text")` + `finalMessage()`. Con `bloquear` espera a que lo cancelen. */
class StreamFalso {
  private oyentes: ((t: string) => void)[] = [];
  constructor(
    private respuesta: Respuesta,
    private senal?: AbortSignal,
    private bloquear = false,
  ) {}
  on(evento: string, f: (t: string) => void): this {
    if (evento === "text") this.oyentes.push(f);
    return this;
  }
  async finalMessage(): Promise<Respuesta> {
    if (this.bloquear) {
      await new Promise<void>((_, rechazar) => this.senal?.addEventListener("abort", () => rechazar(new Error("abortado"))));
    }
    for (const b of this.respuesta.content) {
      if (b.type !== "text") continue;
      const t = b.text as string;
      for (const parte of [t.slice(0, 3), t.slice(3)]) if (parte) this.oyentes.forEach((f) => f(parte));
    }
    return this.respuesta;
  }
}

function clienteFalso(guion: (Respuesta | "bloquear")[]) {
  const llamadas: { messages: unknown[]; tools: { name: string; input_schema: { properties?: Record<string, unknown>; required?: string[] } }[]; system: string }[] = [];
  const cliente = {
    beta: {
      messages: {
        stream: (params: (typeof llamadas)[number], opciones?: { signal?: AbortSignal }) => {
          llamadas.push(structuredClone(params));
          const paso = guion.shift();
          if (paso === undefined) throw new Error("el guion se terminó");
          return paso === "bloquear"
            ? new StreamFalso({ content: [], stop_reason: "end_turn" }, opciones?.signal, true)
            : new StreamFalso(paso, opciones?.signal);
        },
      },
    },
  };
  return { llamadas, cliente: cliente as never };
}

const texto = (t: string, stop = "end_turn"): Respuesta => ({ content: [{ type: "text", text: t }], stop_reason: stop });
const usar = (id: string, name: string, input: Record<string, unknown>, dicho = ""): Respuesta => ({
  content: [...(dicho ? [{ type: "text", text: dicho }] : []), { type: "tool_use", id, name, input }],
  stop_reason: "tool_use",
});

let deps: Dependencias;
let repo: RepositorioEnMemoria;
let piezaId: string;
let eventos: EventoChat[];
const emitir = (e: EventoChat) => void eventos.push(e);

beforeEach(async () => {
  repo = new RepositorioEnMemoria();
  deps = { kernel: KernelFalso.desdeCasos(CASOS_CONTRATO), repositorio: repo, eventos: new EventosEnMemoria(), reloj: new RelojFijo() };
  piezaId = (await new CrearPieza(deps).ejecutar({ nombre: "Mesa" })).id;
  eventos = [];
});

describe("Agente", () => {
  it("responde con texto en streaming y deja la conversación guardada", async () => {
    const { cliente, llamadas } = clienteFalso([texto("Hola, ¿qué armamos?")]);
    const agente = new Agente({ deps, cliente });
    await agente.enviar(piezaId, "hola", emitir);

    expect(eventos.map((e) => e.tipo)).toEqual(["inicio", "texto", "texto", "fin"]);
    expect(eventos.filter((e) => e.tipo === "texto").map((e) => (e as { delta: string }).delta).join("")).toBe("Hola, ¿qué armamos?");
    expect(agente.estado(piezaId)).toEqual({
      ocupado: false,
      transcripto: [
        { tipo: "usuario", texto: "hola" },
        { tipo: "asistente", texto: "Hola, ¿qué armamos?" },
      ],
    });
    expect(llamadas[0]!.system).toContain(piezaId);
  });

  it("usa las mismas tools que el MCP, sin pedirle al modelo el id de la pieza", async () => {
    const { cliente, llamadas } = clienteFalso([texto("ok")]);
    await new Agente({ deps, cliente }).enviar(piezaId, "hola", emitir);
    const nombres = llamadas[0]!.tools.map((t) => t.name).sort();
    expect(nombres).toEqual(["cambiar_parametros", "ejecutar_script", "exportar", "medir", "renderizar"]);
    for (const t of llamadas[0]!.tools) {
      expect(t.input_schema.properties).not.toHaveProperty("pieza");
      expect(t.input_schema.required ?? []).not.toContain("pieza");
    }
  });

  it("ejecuta las tools, devuelve los resultados al modelo y termina con su respuesta", async () => {
    const { cliente, llamadas } = clienteFalso([
      usar("t1", "ejecutar_script", { script: SCRIPT_CAJA, pieza: "nueva" }, "Armo la caja."),
      texto("Lista: 60 × 40 × 24 mm."),
    ]);
    const agente = new Agente({ deps, cliente });
    await agente.enviar(piezaId, "hacé una caja", emitir);

    // «pieza: nueva» del modelo se ignora: el chat trabaja siempre sobre su pieza
    expect(repo.piezas.size).toBe(1);
    expect((await repo.obtener(piezaId))!.revisiones).toHaveLength(1);

    const herramientas = eventos.filter((e) => e.tipo === "herramienta") as Extract<EventoChat, { tipo: "herramienta" }>[];
    expect(herramientas.map((e) => e.estado)).toEqual(["ejecutando", "ok"]);
    expect(herramientas[1]!.resumen).toBe("revisión 1 · 60 × 40 × 24 mm");

    const segunda = llamadas[1]!.messages as { role: string; content: Bloque[] }[];
    const resultado = segunda.at(-1)!;
    expect(resultado.role).toBe("user");
    expect(resultado.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(resultado.content[0]!.is_error).toBeUndefined();
    expect(segunda.at(-2)!.role).toBe("assistant");

    expect(agente.estado(piezaId).transcripto.map((i) => i.tipo)).toEqual(["usuario", "asistente", "herramienta", "asistente"]);
  });

  it("si una tool falla se lo cuenta al modelo con el error para que lo corrija", async () => {
    const { cliente, llamadas } = clienteFalso([
      usar("t1", "ejecutar_script", { script: SCRIPT_CAJA, parametros: { largo: 500 } }),
      texto("Se pasó del rango, uso 100."),
    ]);
    await new Agente({ deps, cliente }).enviar(piezaId, "caja enorme", emitir);
    const resultado = (llamadas[1]!.messages as { content: Bloque[] }[]).at(-1)!.content[0]!;
    expect(resultado.is_error).toBe(true);
    expect(JSON.stringify(resultado.content)).toContain("entre 10 y 200");
    const fallida = eventos.find((e) => e.tipo === "herramienta" && e.estado === "error") as { resumen: string };
    expect(fallida.resumen).toContain("entre 10 y 200");
    expect((await repo.obtener(piezaId))!.revisiones).toHaveLength(0);
  });

  it("no acepta un segundo mensaje mientras trabaja y se puede cancelar", async () => {
    const { cliente } = clienteFalso(["bloquear", texto("de nuevo")]);
    const agente = new Agente({ deps, cliente });
    const primero = agente.enviar(piezaId, "uno", emitir);
    await new Promise((r) => setTimeout(r, 10));
    expect(agente.estado(piezaId).ocupado).toBe(true);
    await expect(agente.enviar(piezaId, "dos", emitir)).rejects.toThrow("OCUPADO");

    agente.cancelar(piezaId);
    await primero;
    expect(agente.estado(piezaId).ocupado).toBe(false);
    expect(eventos.at(-1)).toEqual({ tipo: "fin", cancelado: true });
    expect(eventos.some((e) => e.tipo === "error")).toBe(false);

    await agente.enviar(piezaId, "tres", emitir); // y después sigue andando
    expect(agente.estado(piezaId).transcripto.at(-1)).toEqual({ tipo: "asistente", texto: "de nuevo" });
  });

  it("sin clave de API no está disponible y no intenta nada", async () => {
    const agente = new Agente({ deps });
    expect(agente.disponible).toBe(false);
    await expect(agente.enviar(piezaId, "hola", emitir)).rejects.toThrow("SIN_CLAVE");
  });

  it("avisa cuando el modelo se niega o se corta por largo", async () => {
    const { cliente } = clienteFalso([texto("", "refusal"), texto("parte", "max_tokens")]);
    const agente = new Agente({ deps, cliente });
    await agente.enviar(piezaId, "a", emitir);
    await agente.enviar(piezaId, "b", emitir);
    const errores = eventos.filter((e) => e.tipo === "error").map((e) => (e as { mensaje: string }).mensaje);
    expect(errores[0]).toContain("no pudo atender");
    expect(errores[1]).toContain("se cortó por largo");
  });
});

describe("ayudas", () => {
  it("resumirResultado muestra una línea útil en vez del JSON", () => {
    expect(resumirResultado([{ type: "text", text: JSON.stringify({ ok: false, error: { mensaje: "Radio máximo 4,9 mm" } }) }], true)).toBe("Radio máximo 4,9 mm");
    expect(resumirResultado([{ type: "text", text: "{}" }, { type: "image" }, { type: "image" }], false)).toBe("2 imágenes");
    expect(resumirResultado([{ type: "text", text: JSON.stringify({ consulta: "volumen", valor: 10, unidad: "mm³" }) }], false)).toBe("volumen: 10 mm³");
  });

  it("mensajeDeError no filtra detalles internos para errores comunes", () => {
    expect(mensajeDeError(new Error("boom"))).toBe("boom");
  });

  it("el prompt fija la pieza y pide listar las suposiciones", () => {
    const p = promptSistema("abc123");
    expect(p).toContain("abc123");
    expect(p).toContain("listá lo que asumiste");
  });
});
