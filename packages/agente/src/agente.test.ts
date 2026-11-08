import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CASOS_CONTRATO, EventosEnMemoria, KernelFalso, RelojFijo, RepositorioEnMemoria } from "@furnus/app";
import { crearServidorMcp } from "@furnus/mcp-server";
import { AgenteCli, HERRAMIENTAS_PERMITIDAS, HERRAMIENTAS_PROHIBIDAS, promptSistema, type OpcionesAgente } from "./agente.js";
import { ayudaClaudeCode, diagnosticarCli, entornoParaCli, resolverCli, type Lanzador } from "./cli.js";
import type { EventoChat } from "./eventos.js";
import { resumirResultado } from "./traductor.js";

// ---------- un `claude` falso: cada llamada devuelve el guion que le toque ----------

interface Guion {
  lineas?: string[];
  codigo?: number;
  stderr?: string;
  /** Se queda esperando hasta que lo maten, como un turno largo. */
  bloquear?: boolean;
  error?: NodeJS.ErrnoException;
}
interface Llamada {
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
  stdin: string;
}

function lanzadorFalso(responder: (args: string[], llamada: Llamada) => Guion) {
  const llamadas: Llamada[] = [];
  const lanzador: Lanzador = (_bin, args, op) => {
    const llamada: Llamada = { args, env: op.env, cwd: op.cwd, stdin: "" };
    llamadas.push(llamada);
    const g = responder(args, llamada);
    let matar!: () => void;
    const parar = new Promise<void>((r) => (matar = r));
    async function* lineas() {
      for (const l of g.lineas ?? []) yield l;
      if (g.bloquear) await parar;
    }
    return {
      lineas: lineas(),
      stderr: () => g.stderr ?? "",
      escribir: (t) => void (llamada.stdin += t),
      cerrarEntrada: () => undefined,
      matar,
      salida: Promise.resolve({ codigo: g.error ? null : g.bloquear ? 143 : (g.codigo ?? 0), error: g.error }),
    };
  };
  return { lanzador, llamadas, turnos: () => llamadas.filter((l) => l.args[0] === "-p") };
}

const j = (o: unknown) => JSON.stringify(o);
const init = (extra: Record<string, unknown> = {}) =>
  j({ type: "system", subtype: "init", session_id: "s1", model: "claude-opus-5-5", mcp_servers: [{ name: "furnus", status: "connected" }], ...extra });
const delta = (text: string) => j({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } } });
const asistente = (...content: unknown[]) => j({ type: "assistant", message: { role: "assistant", model: "claude-opus-5-5", content }, session_id: "s1" });
const texto = (t: string) => ({ type: "text", text: t });
const usarTool = (id: string, name: string, input: Record<string, unknown> = {}) => ({ type: "tool_use", id, name: `mcp__furnus__${name}`, input });
const resultadoTool = (id: string, contenido: unknown, is_error = false) =>
  j({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: contenido, ...(is_error ? { is_error } : {}) }] } });
const final = (extra: Record<string, unknown> = {}) => j({ type: "result", subtype: "success", is_error: false, result: "", session_id: "s1", ...extra });

/** Responde bien a `--version` y `auth status`; el turno (`-p`) lo decide `turno`. */
function claudeFalso(turno: (llamada: Llamada, n: number) => Guion, auth = { codigo: 0, salida: j({ authMethod: "claude.ai" }) }) {
  let n = 0;
  return lanzadorFalso((args, llamada) => {
    if (args[0] === "--version") return { lineas: ["2.1.300 (Claude Code)"] };
    if (args[0] === "auth") return { lineas: [auth.salida], codigo: auth.codigo };
    return turno(llamada, n++);
  });
}

// ---------- preparación ----------

let carpeta: string;
let eventos: EventoChat[];
const emitir = (e: EventoChat) => void eventos.push(e);
const PIEZA = "pieza-abc";

beforeEach(() => {
  carpeta = mkdtempSync(join(tmpdir(), "furnus-chat-"));
  eventos = [];
});
afterEach(() => rmSync(carpeta, { recursive: true, force: true }));

function crear(lanzador: Lanzador, extra: Partial<OpcionesAgente> = {}) {
  return new AgenteCli({
    mcp: { command: "node", args: ["mcp.js"], env: { FURNUS_API_PORT: "4010" } },
    directorio: carpeta,
    lanzador,
    resolver: () => ({ ruta: "claude", shell: false }),
    entorno: { PATH: "", ANTHROPIC_API_KEY: "sk-ant-no-deberia-llegar", ANTHROPIC_AUTH_TOKEN: "tok", FURNUS_HOME: "C:/datos", OTRA: "1" },
    ...extra,
  });
}

const dicho = () => eventos.filter((e) => e.tipo === "texto").map((e) => (e as { delta: string }).delta).join("");

// ---------- tests ----------

describe("AgenteCli: un turno", () => {
  it("lanza `claude -p` en streaming, con el MCP de Furnus y permisos mínimos", async () => {
    const { lanzador, turnos } = claudeFalso(() => ({ lineas: [init(), delta("Hola, "), delta("¿qué armamos?"), asistente(texto("Hola, ¿qué armamos?")), final()] }));
    const agente = crear(lanzador);
    await agente.enviar(PIEZA, "hola", emitir);

    expect(eventos.map((e) => e.tipo)).toEqual(["inicio", "texto", "texto", "fin"]);
    expect(dicho()).toBe("Hola, ¿qué armamos?"); // el mensaje completo no duplica lo ya streameado
    expect(agente.estado(PIEZA)).toEqual({
      ocupado: false,
      transcripto: [
        { tipo: "usuario", texto: "hola" },
        { tipo: "asistente", texto: "Hola, ¿qué armamos?" },
      ],
    });
    expect(agente.modelo).toBe("claude-opus-5-5"); // el que informó `system/init`

    const t = turnos()[0]!;
    expect(t.stdin).toBe("hola");
    expect(t.args).toEqual(expect.arrayContaining(["-p", "--verbose", "--include-partial-messages", "--strict-mcp-config", "--output-format", "stream-json"]));
    expect(t.args[t.args.indexOf("--permission-mode") + 1]).toBe("dontAsk");
    expect(t.args[t.args.indexOf("--allowedTools") + 1]).toBe(HERRAMIENTAS_PERMITIDAS.join(","));
    expect(t.args[t.args.indexOf("--disallowedTools") + 1]).toBe(HERRAMIENTAS_PROHIBIDAS.join(","));
    expect(t.args).not.toContain("--model"); // sin FURNUS_MODELO manda el CLI
    expect(t.args).not.toContain("--resume"); // primer mensaje

    const mcp = JSON.parse(readFileSync(t.args[t.args.indexOf("--mcp-config") + 1]!, "utf8"));
    expect(mcp.mcpServers.furnus).toMatchObject({ command: "node", args: ["mcp.js"], env: { FURNUS_API_PORT: "4010", FURNUS_HOME: "C:/datos" } });
    expect(mcp.mcpServers.furnus.env).not.toHaveProperty("OTRA");
    const prompt = readFileSync(t.args[t.args.indexOf("--append-system-prompt-file") + 1]!, "utf8");
    expect(prompt).toContain(`pieza: "${PIEZA}"`);
    expect(t.cwd).toBe(carpeta);
  });

  it("nunca le pasa al CLI una clave de API: usa la suscripción", async () => {
    const { lanzador, llamadas } = claudeFalso(() => ({ lineas: [init(), final()] }));
    await crear(lanzador).enviar(PIEZA, "hola", emitir);
    expect(llamadas.length).toBeGreaterThan(1); // --version, auth status y el turno
    for (const l of llamadas) {
      expect(l.env).not.toHaveProperty("ANTHROPIC_API_KEY");
      expect(l.env).not.toHaveProperty("ANTHROPIC_AUTH_TOKEN");
      expect(l.env.OTRA).toBe("1");
    }
    expect(entornoParaCli({ CLAUDE_CODE_USE_BEDROCK: "1", CLAUDE_CODE_USE_VERTEX: "1", CLAUDE_CODE_USE_FOUNDRY: "1", X: "y" })).toEqual({ X: "y" });
  });

  it("pasa FURNUS_MODELO con --model y retoma la sesión en el segundo mensaje", async () => {
    const { lanzador, turnos } = claudeFalso(() => ({ lineas: [init({ session_id: "sesion-9" }), final({ session_id: "sesion-9" })] }));
    const agente = crear(lanzador, { modelo: "claude-sonnet-5-5" });
    await agente.enviar(PIEZA, "uno", emitir);
    await agente.enviar(PIEZA, "dos", emitir);
    const [a, b] = turnos();
    expect(a!.args[a!.args.indexOf("--model") + 1]).toBe("claude-sonnet-5-5");
    expect(a!.args).not.toContain("--resume");
    expect(b!.args[b!.args.indexOf("--resume") + 1]).toBe("sesion-9");
    expect(agente.modelo).toBe("claude-sonnet-5-5");
  });

  it("muestra las tools en curso y cuando terminan, sin el prefijo del MCP", async () => {
    const { lanzador } = claudeFalso(() => ({
      lineas: [
        init(),
        asistente(texto("Armo la caja."), usarTool("t1", "ejecutar_script", { script: "..." })),
        resultadoTool("t1", [{ type: "text", text: JSON.stringify({ ok: true, revision: 1, valida: true, medidas: { caja: [60, 40, 24] } }) }]),
        asistente(usarTool("t2", "renderizar")),
        resultadoTool("t2", [{ type: "text", text: "{}" }, { type: "image", source: {} }]),
        delta("Lista."),
        asistente(texto("Lista: 60 × 40 × 24 mm.")),
        final(),
      ],
    }));
    const agente = crear(lanzador);
    await agente.enviar(PIEZA, "hacé una caja", emitir);

    const tools = eventos.filter((e) => e.tipo === "herramienta") as Extract<EventoChat, { tipo: "herramienta" }>[];
    expect(tools.map((e) => `${e.nombre}:${e.estado}`)).toEqual(["ejecutar_script:ejecutando", "ejecutar_script:ok", "renderizar:ejecutando", "renderizar:ok"]);
    expect(tools[1]!.resumen).toBe("revisión 1 · 60 × 40 × 24 mm");
    expect(tools[3]!.resumen).toBe("1 imagen");
    expect(agente.estado(PIEZA).transcripto.map((i) => i.tipo)).toEqual(["usuario", "asistente", "herramienta", "herramienta", "asistente"]);
  });

  it("si una tool falla muestra el error del kernel", async () => {
    const { lanzador } = claudeFalso(() => ({
      lineas: [
        init(),
        asistente(usarTool("t1", "ejecutar_script")),
        resultadoTool("t1", JSON.stringify({ ok: false, error: { mensaje: "«largo» tiene que estar entre 10 y 200 mm" } }), true),
        asistente(texto("Uso 100.")),
        final(),
      ],
    }));
    const agente = crear(lanzador);
    await agente.enviar(PIEZA, "caja enorme", emitir);
    const fallida = eventos.find((e) => e.tipo === "herramienta" && e.estado === "error") as { resumen: string };
    expect(fallida.resumen).toContain("entre 10 y 200");
    expect(eventos.some((e) => e.tipo === "error")).toBe(false); // la tool falló, el turno no
  });

  it("sin deltas (CLI sin parciales) el texto sale del mensaje completo", async () => {
    const { lanzador } = claudeFalso(() => ({ lineas: [init(), asistente(texto("Todo junto.")), final()] }));
    await crear(lanzador).enviar(PIEZA, "hola", emitir);
    expect(dicho()).toBe("Todo junto.");
  });

  it("ignora líneas que no conoce y los mensajes de subagentes", async () => {
    const { lanzador } = claudeFalso(() => ({
      lineas: ["no es json", j({ type: "algo_nuevo" }), j({ type: "assistant", parent_tool_use_id: "x", message: { content: [texto("de un subagente")] } }), init(), final()],
    }));
    await crear(lanzador).enviar(PIEZA, "hola", emitir);
    expect(eventos.map((e) => e.tipo)).toEqual(["inicio", "fin"]);
  });
});

describe("AgenteCli: cuando algo sale mal", () => {
  it("no acepta un segundo mensaje mientras trabaja y se puede cancelar", async () => {
    const { lanzador } = claudeFalso((_l, n) => (n === 0 ? { lineas: [init()], bloquear: true } : { lineas: [init(), final()] }));
    const agente = crear(lanzador);
    const primero = agente.enviar(PIEZA, "uno", emitir);
    await new Promise((r) => setTimeout(r, 20));
    expect(agente.estado(PIEZA).ocupado).toBe(true);
    await expect(agente.enviar(PIEZA, "dos", emitir)).rejects.toThrow("OCUPADO");

    agente.cancelar(PIEZA);
    await primero;
    expect(agente.estado(PIEZA).ocupado).toBe(false);
    expect(eventos.at(-1)).toEqual({ tipo: "fin", cancelado: true });
    expect(eventos.some((e) => e.tipo === "error")).toBe(false);

    await agente.enviar(PIEZA, "tres", emitir); // y después sigue andando
    expect(eventos.at(-1)).toEqual({ tipo: "fin" });
  });

  it("una tool que quedó en curso al cancelar se marca interrumpida", async () => {
    const { lanzador } = claudeFalso(() => ({ lineas: [init(), asistente(usarTool("t1", "ejecutar_script"))], bloquear: true }));
    const agente = crear(lanzador);
    const p = agente.enviar(PIEZA, "uno", emitir);
    await new Promise((r) => setTimeout(r, 20));
    agente.cancelar(PIEZA);
    await p;
    expect(agente.estado(PIEZA).transcripto.at(-1)).toMatchObject({ tipo: "herramienta", estado: "error", resumen: "interrumpida" });
  });

  it("sin Claude Code instalado no lanza nada y avisa SIN_CLI", async () => {
    const { lanzador, llamadas } = claudeFalso(() => ({}));
    const agente = crear(lanzador, { resolver: () => null });
    await expect(agente.enviar(PIEZA, "hola", emitir)).rejects.toThrow("SIN_CLI");
    expect(llamadas).toHaveLength(0);
    expect(agente.estado(PIEZA).ocupado).toBe(false);
    expect(eventos).toEqual([]);
  });

  it("sin sesión iniciada avisa SIN_LOGIN y no lanza el turno", async () => {
    const { lanzador, turnos } = claudeFalso(() => ({}), { codigo: 1, salida: j({ authMethod: "none" }) });
    await expect(crear(lanzador).enviar(PIEZA, "hola", emitir)).rejects.toThrow("SIN_LOGIN");
    expect(turnos()).toHaveLength(0);
  });

  it("si el CLI pierde la sesión a mitad de camino, cuenta cómo iniciarla", async () => {
    const { lanzador } = claudeFalso(() => ({
      lineas: [init(), j({ type: "system", subtype: "api_retry", error: "authentication_failed", attempt: 1 }), final({ is_error: true, subtype: "error_during_execution", result: "Invalid API key · Please run /login" })],
      codigo: 1,
    }));
    await crear(lanzador).enviar(PIEZA, "hola", emitir);
    const e = eventos.find((x) => x.tipo === "error") as { mensaje: string };
    expect(e.mensaje).toContain("claude auth login");
  });

  it("un resultado con error se muestra y no se guarda la sesión", async () => {
    const { lanzador, turnos } = claudeFalso((_l, n) => (n === 0 ? { lineas: [init(), final({ is_error: true, subtype: "error_max_turns", result: "Se pasó de los pasos" })], codigo: 1 } : { lineas: [init(), final()] }));
    const agente = crear(lanzador);
    await agente.enviar(PIEZA, "uno", emitir);
    expect((eventos.find((x) => x.tipo === "error") as { mensaje: string }).mensaje).toContain("Se pasó de los pasos");
    await agente.enviar(PIEZA, "dos", emitir);
    expect(turnos()[1]!.args).not.toContain("--resume");
  });

  it("si el proceso muere sin resultado, informa el código y lo que dijo por stderr", async () => {
    const { lanzador } = claudeFalso(() => ({ lineas: [init()], codigo: 2, stderr: "Error: algo se rompió" }));
    await crear(lanzador).enviar(PIEZA, "hola", emitir);
    const e = eventos.find((x) => x.tipo === "error") as { mensaje: string };
    expect(e.mensaje).toContain("código 2");
    expect(e.mensaje).toContain("algo se rompió");
    expect(eventos.at(-1)).toEqual({ tipo: "fin" });
  });

  it("si el MCP de Furnus no conecta lo avisa", async () => {
    const { lanzador } = claudeFalso(() => ({ lineas: [init({ mcp_servers: [{ name: "furnus", status: "failed" }] }), final()] }));
    await crear(lanzador).enviar(PIEZA, "hola", emitir);
    expect((eventos.find((x) => x.tipo === "error") as { mensaje: string }).mensaje).toContain("herramientas de Furnus");
  });

  it("corta un turno que tarda demasiado", async () => {
    const { lanzador } = claudeFalso(() => ({ lineas: [init()], bloquear: true }));
    const agente = crear(lanzador, { timeoutMs: 30 });
    await agente.enviar(PIEZA, "hola", emitir);
    expect((eventos.find((x) => x.tipo === "error") as { mensaje: string }).mensaje).toContain("tardó más de");
    expect(agente.estado(PIEZA).ocupado).toBe(false);
  });
});

describe("diagnóstico del motor", () => {
  const base = (lanzador: Lanzador, resolver = () => ({ ruta: "claude", shell: false })) => ({ lanzador, resolver, env: {}, cwd: carpeta });

  it("sin `claude` en el equipo: sin_cli y los comandos para instalarlo", async () => {
    const { lanzador } = claudeFalso(() => ({}));
    const d = await diagnosticarCli({ ...base(lanzador, () => null as never), plataforma: "win32" });
    expect(d.estado).toBe("sin_cli");
    expect(d.ayuda!.instalar[0]).toEqual({ etiqueta: "PowerShell", comando: "irm https://claude.ai/install.ps1 | iex" });
    expect(d.ayuda!.login).toBe("claude auth login");
  });

  it("si al lanzarlo da ENOENT también es sin_cli", async () => {
    const lanzador = lanzadorFalso(() => ({ error: Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" }) })).lanzador;
    expect((await diagnosticarCli(base(lanzador))).estado).toBe("sin_cli");
  });

  it("instalado pero sin sesión: sin_login", async () => {
    const { lanzador } = claudeFalso(() => ({}), { codigo: 1, salida: j({ authMethod: "none" }) });
    const d = await diagnosticarCli(base(lanzador));
    expect(d).toMatchObject({ estado: "sin_login", version: "2.1.300 (Claude Code)" });
    expect(d.ayuda!.login).toBe("claude auth login");
  });

  it("con sesión: listo y sin ayuda", async () => {
    const { lanzador } = claudeFalso(() => ({}));
    expect(await diagnosticarCli(base(lanzador))).toEqual({ estado: "listo", version: "2.1.300 (Claude Code)" });
  });

  it("un CLI viejo que no responde JSON a `auth status` se da por listo (si falta algo, sale al usarlo)", async () => {
    const { lanzador } = claudeFalso(() => ({}), { codigo: 0, salida: "Logged in as alguien" });
    expect((await diagnosticarCli(base(lanzador))).estado).toBe("listo");
  });

  it("el agente recuerda el «listo» pero vuelve a mirar mientras falte algo", async () => {
    let auth = { codigo: 1, salida: j({ authMethod: "none" }) };
    const falso = lanzadorFalso((args) => (args[0] === "--version" ? { lineas: ["2.1.300"] } : { lineas: [auth.salida], codigo: auth.codigo }));
    const agente = crear(falso.lanzador);
    expect((await agente.diagnostico()).estado).toBe("sin_login");
    auth = { codigo: 0, salida: j({ authMethod: "claude.ai" }) };
    expect((await agente.diagnostico()).estado).toBe("listo");
    const antes = falso.llamadas.length;
    await agente.diagnostico();
    expect(falso.llamadas.length).toBe(antes); // ya recordado
  });

  it("resolverCli busca en FURNUS_CLAUDE_BIN, el PATH y la carpeta del instalador nativo", () => {
    const hay = (...rutas: string[]) => (r: string) => rutas.includes(r.replace(/\\/g, "/"));
    expect(resolverCli({ PATH: ["/usr/bin", "/opt/bin"].join(delimiter) }, "linux", hay("/opt/bin/claude"), "/home/m")).toEqual({ ruta: expect.stringContaining("claude"), shell: false });
    expect(resolverCli({ PATH: "" }, "linux", hay("/home/m/.local/bin/claude"), "/home/m")).not.toBeNull();
    expect(resolverCli({ PATH: "/usr/bin" }, "linux", hay(), "/home/m")).toBeNull();
    expect(resolverCli({ FURNUS_CLAUDE_BIN: "/x/claude", PATH: "" }, "linux", hay("/x/claude"), "/h")).toEqual({ ruta: "/x/claude", shell: false });
    expect(resolverCli({ FURNUS_CLAUDE_BIN: "/no/existe", PATH: "/usr/bin" }, "linux", hay("/usr/bin/claude"), "/h")).toBeNull();
  });

  it("en Windows prefiere el .exe y usa shell solo para un .cmd de npm", () => {
    const hay = (...rutas: string[]) => (r: string) => rutas.includes(r.replace(/\\/g, "/"));
    expect(resolverCli({ PATH: "C:/bin" }, "win32", hay("C:/bin/claude.exe", "C:/bin/claude.cmd"), "C:/u")?.shell).toBe(false);
    expect(resolverCli({ PATH: "C:/bin" }, "win32", hay("C:/bin/claude.cmd"), "C:/u")?.shell).toBe(true);
  });

  it("la ayuda cambia según el sistema", () => {
    expect(ayudaClaudeCode("darwin").instalar.map((i) => i.etiqueta)).toEqual(["macOS", "Homebrew", "npm (Node 22 o más)"]);
    expect(ayudaClaudeCode("linux").instalar[0]!.comando).toBe("curl -fsSL https://claude.ai/install.sh | bash");
    expect(ayudaClaudeCode("win32").instalar.map((i) => i.etiqueta)).toEqual(["PowerShell", "WinGet", "npm (Node 22 o más)"]);
  });
});

describe("las tools del MCP", () => {
  it("la lista de tools permitidas al CLI coincide con las que publica el servidor MCP", async () => {
    const deps = { kernel: KernelFalso.desdeCasos(CASOS_CONTRATO), repositorio: new RepositorioEnMemoria(), eventos: new EventosEnMemoria(), reloj: new RelojFijo() };
    const servidor = crearServidorMcp(deps);
    const [a, b] = InMemoryTransport.createLinkedPair();
    const cliente = new Client({ name: "prueba", version: "0.0.0" });
    await Promise.all([servidor.connect(a), cliente.connect(b)]);
    const { tools } = await cliente.listTools();
    expect(HERRAMIENTAS_PERMITIDAS.slice().sort()).toEqual(tools.map((t) => `mcp__furnus__${t.name}`).sort());
    // `pieza` sigue en el esquema: no se toca el MCP, el prompt es el que fija la pieza
    for (const t of tools) expect(t.inputSchema.properties).toHaveProperty("pieza");
  });
});

describe("ayudas", () => {
  it("resumirResultado muestra una línea útil en vez del JSON", () => {
    expect(resumirResultado([{ type: "text", text: JSON.stringify({ ok: false, error: { mensaje: "Radio máximo 4,9 mm" } }) }], true)).toBe("Radio máximo 4,9 mm");
    expect(resumirResultado([{ type: "text", text: "{}" }, { type: "image" }, { type: "image" }], false)).toBe("2 imágenes");
    expect(resumirResultado([{ type: "text", text: JSON.stringify({ consulta: "volumen", valor: 10, unidad: "mm³" }) }], false)).toBe("volumen: 10 mm³");
  });

  it("el prompt fija la pieza, prohíbe «nueva» y pide listar las suposiciones", () => {
    const p = promptSistema("abc123");
    expect(p).toContain('pieza: "abc123"');
    expect(p).toContain("Nunca uses «nueva»");
    expect(p).toContain("listá lo que asumiste");
  });
});
