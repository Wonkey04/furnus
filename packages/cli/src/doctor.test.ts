import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { doctor, HERRAMIENTAS_ESPERADAS, type Chequeo, type ContextoDoctor } from "./doctor.js";
import type { Entorno } from "./entorno.js";
import { init } from "./init.js";
import type { Ejecutar, ResultadoProceso } from "./proceso.js";
import { candidatosDesktop } from "./rutas.js";
import type { Runtime } from "./runtime.js";
import { salidaEnMemoria } from "./salida.js";
import type { SondaMcp } from "./sonda-mcp.js";

let casa: string;
const ok = (stdout: string): ResultadoProceso => ({ codigo: 0, stdout, stderr: "" });
const no = (stderr = "", extra: Partial<ResultadoProceso> = {}): ResultadoProceso => ({ codigo: 1, stdout: "", stderr, ...extra });

const runtime = (): Runtime => ({
  modo: "repo",
  raiz: join(casa, "repo"),
  nodo: "/abs/node",
  argsMcp: ["/abs/mcp.ts"],
  argsApi: [],
  kernelDir: join(casa, "repo", "services", "kernel"),
  visorDir: null,
});
const entorno = (): Entorno => ({ plataforma: "linux", casa, env: { PATH: "" } });

/** Un ejecutor falso: responde según el comando y deja registro de lo que se pidió. */
function falso(reglas: (cmd: string, args: string[]) => ResultadoProceso | undefined) {
  const llamadas: string[] = [];
  const ejecutar: Ejecutar = async (cmd, args) => {
    llamadas.push([cmd, ...args].join(" "));
    return reglas(cmd, args) ?? no("", { noEncontrado: true });
  };
  return { ejecutar, llamadas };
}

const sondaOk: SondaMcp = async () => ({ ok: true, herramientas: HERRAMIENTAS_ESPERADAS });

const contexto = (ejecutar: Ejecutar, extra: Partial<ContextoDoctor> = {}): ContextoDoctor => ({
  entorno: entorno(),
  runtime: runtime(),
  ejecutar,
  sondear: sondaOk,
  versionNode: "22.4.0",
  ...extra,
});
const por = (cs: Chequeo[], id: Chequeo["id"]) => cs.find((c) => c.id === id)!;

const pythonBueno = (cmd: string, args: string[]) => {
  if (cmd !== "python3") return undefined;
  if (args.includes("-c") && args.join(" ").includes("sys.version_info")) return ok("3.12.4\n");
  if (args.join(" ").includes("import build123d")) return ok("0.9.1\n");
  return undefined;
};

beforeEach(() => {
  casa = mkdtempSync(join(tmpdir(), "furnus-doctor-test-"));
});
afterEach(() => rmSync(casa, { recursive: true, force: true }));

describe("doctor", () => {
  it("todo en orden (menos lo opcional)", async () => {
    const { ejecutar } = falso(pythonBueno);
    const s = salidaEnMemoria();
    const r = await doctor(contexto(ejecutar), s);
    expect(r.fallas).toBe(0);
    expect(por(r.chequeos, "node").estado).toBe("ok");
    expect(por(r.chequeos, "python").detalle).toContain("3.12.4");
    expect(por(r.chequeos, "build123d").detalle).toContain("0.9.1");
    expect(por(r.chequeos, "mcp").estado).toBe("ok");
    expect(por(r.chequeos, "claude").estado).toBe("aviso"); // no hay claude: es opcional
    expect(s.texto()).toContain("Todo lo necesario funciona");
  });

  it("Node viejo: falla y dice cómo arreglarlo", async () => {
    const { ejecutar } = falso(pythonBueno);
    const r = await doctor(contexto(ejecutar, { versionNode: "18.19.0" }), salidaEnMemoria());
    const n = por(r.chequeos, "node");
    expect(n.estado).toBe("falla");
    expect(n.arreglo?.join(" ")).toContain("nodejs.org");
    expect(r.fallas).toBe(1);
  });

  it("Python anterior a 3.11: falla y lo explica", async () => {
    const { ejecutar } = falso((cmd, args) => (args.join(" ").includes("sys.version_info") && cmd === "python3" ? ok("3.9.18\n") : undefined));
    const r = await doctor(contexto(ejecutar), salidaEnMemoria());
    const p = por(r.chequeos, "python");
    expect(p.estado).toBe("falla");
    expect(p.detalle).toContain("3.9.18");
    expect(p.arreglo?.join(" ")).toMatch(/3\.12/);
    expect(por(r.chequeos, "build123d").estado).toBe("falla");
  });

  it("sin Python: falla con instrucciones", async () => {
    const { ejecutar } = falso(() => undefined);
    const r = await doctor(contexto(ejecutar), salidaEnMemoria());
    expect(por(r.chequeos, "python").detalle).toContain("No encontré Python");
    expect(por(r.chequeos, "python").arreglo?.length).toBeGreaterThan(0);
  });

  it("build123d ausente: falla y sugiere --instalar", async () => {
    const { ejecutar } = falso((cmd, args) => {
      if (cmd !== "python3") return undefined;
      if (args.join(" ").includes("sys.version_info")) return ok("3.12.4\n");
      if (args.join(" ").includes("import build123d")) return no("ModuleNotFoundError: No module named 'build123d'");
      return undefined;
    });
    const r = await doctor(contexto(ejecutar), salidaEnMemoria());
    const b = por(r.chequeos, "build123d");
    expect(b.estado).toBe("falla");
    expect(b.detalle).toContain("build123d");
    expect(b.arreglo?.join("\n")).toContain("furnus doctor --instalar");
  });

  it("--instalar crea el venv, instala las dependencias y vuelve a comprobar", async () => {
    const venvPy = join(casa, "repo", "services", "kernel", ".venv", "bin", "python");
    mkdirSync(join(casa, "repo", "services", "kernel"), { recursive: true });
    writeFileSync(join(casa, "repo", "services", "kernel", "pyproject.toml"), 'dependencies = ["build123d>=0.9", "numpy"]\n');
    let instalado = false;
    const { ejecutar, llamadas } = falso((cmd, args) => {
      const linea = args.join(" ");
      if (cmd === "python3" && linea.includes("sys.version_info")) return ok("3.12.4\n");
      if (cmd === "python3" && linea.includes("-m venv")) {
        mkdirSync(dirname(venvPy), { recursive: true });
        writeFileSync(venvPy, "");
        return ok("");
      }
      if (cmd === venvPy && linea.includes("sys.version_info")) return ok("3.12.4\n");
      if (cmd === venvPy && linea.includes("-m pip install")) {
        instalado = true;
        return ok("");
      }
      if (linea.includes("import build123d")) return instalado && cmd === venvPy ? ok("0.9.1\n") : no("No module named 'build123d'");
      return undefined;
    });
    const r = await doctor(contexto(ejecutar, { instalar: true }), salidaEnMemoria());
    expect(por(r.chequeos, "build123d").estado).toBe("ok");
    expect(llamadas.some((l) => l.includes("-m venv"))).toBe(true);
    const pip = llamadas.find((l) => l.includes("pip install"))!;
    expect(pip).toContain("build123d>=0.9");
    expect(pip).toContain("numpy");
  });

  it("--instalar con pip roto: devuelve el motivo y sigue fallando", async () => {
    const { ejecutar } = falso((cmd, args) => {
      const linea = args.join(" ");
      if (cmd === "python3" && linea.includes("sys.version_info")) return ok("3.13.0\n");
      if (linea.includes("-m venv")) {
        const py = args[args.length - 1]!;
        mkdirSync(join(py, "bin"), { recursive: true });
        writeFileSync(join(py, "bin", "python"), "");
        return ok("");
      }
      if (linea.includes("pip install")) return no("ERROR: No matching distribution found for cadquery-ocp");
      if (linea.includes("import build123d")) return no("No module named 'build123d'");
      return undefined;
    });
    const r = await doctor(contexto(ejecutar, { instalar: true }), salidaEnMemoria());
    const b = por(r.chequeos, "build123d");
    expect(b.estado).toBe("falla");
    expect(b.detalle).toContain("No matching distribution");
    expect(b.detalle).toContain("Python 3.12");
  });

  it("Claude Code instalado pero sin sesión: aviso con el comando de login", async () => {
    const claude = join(casa, "bin", "claude");
    mkdirSync(dirname(claude), { recursive: true });
    writeFileSync(claude, "");
    const { ejecutar } = falso((cmd, args) => {
      if (cmd === claude && args[0] === "--version") return ok("2.1.0 (Claude Code)\n");
      if (cmd === claude && args[0] === "auth") return { codigo: 1, stdout: '{"loggedIn": false}', stderr: "" };
      return pythonBueno(cmd, args);
    });
    const ctx = contexto(ejecutar);
    ctx.entorno = { ...ctx.entorno, env: { PATH: dirname(claude) } };
    const r = await doctor(ctx, salidaEnMemoria());
    expect(por(r.chequeos, "claude").estado).toBe("ok");
    const login = por(r.chequeos, "login");
    expect(login.estado).toBe("aviso");
    expect(login.arreglo?.join(" ")).toContain("claude auth login");
  });

  it("al CLI de Claude no se le pasan claves de API", async () => {
    const claude = join(casa, "bin", "claude");
    mkdirSync(dirname(claude), { recursive: true });
    writeFileSync(claude, "");
    const entornos: (NodeJS.ProcessEnv | undefined)[] = [];
    const ejecutar: Ejecutar = async (cmd, args, op) => {
      if (cmd === claude) {
        entornos.push(op?.env);
        return args[0] === "auth" ? ok('{"loggedIn": true}') : ok("2.1.0\n");
      }
      return pythonBueno(cmd, args) ?? no("", { noEncontrado: true });
    };
    const ctx = contexto(ejecutar);
    ctx.entorno = { ...ctx.entorno, env: { PATH: dirname(claude), ANTHROPIC_API_KEY: "sk-test-no-real" } };
    await doctor(ctx, salidaEnMemoria());
    expect(entornos.length).toBe(2);
    for (const env of entornos) expect(env?.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("MCP que no responde: falla con el motivo; con herramientas de menos también", async () => {
    const { ejecutar } = falso(pythonBueno);
    const caido: SondaMcp = async () => ({ ok: false, herramientas: [], error: "el proceso terminó (código 1): Cannot find module" });
    const r1 = await doctor(contexto(ejecutar, { sondear: caido }), salidaEnMemoria());
    expect(por(r1.chequeos, "mcp").estado).toBe("falla");
    expect(por(r1.chequeos, "mcp").detalle).toContain("Cannot find module");

    const incompleto: SondaMcp = async () => ({ ok: true, herramientas: ["medir"] });
    const r2 = await doctor(contexto(ejecutar, { sondear: incompleto }), salidaEnMemoria());
    expect(por(r2.chequeos, "mcp").detalle).toContain("ejecutar_script");
  });

  it("la sonda recibe un FURNUS_HOME temporal: el MCP no toca ~/.furnus", async () => {
    const { ejecutar } = falso(pythonBueno);
    let home: string | undefined;
    const sonda: SondaMcp = async (p) => {
      home = p.env?.FURNUS_HOME;
      return { ok: true, herramientas: HERRAMIENTAS_ESPERADAS };
    };
    await doctor(contexto(ejecutar, { sondear: sonda }), salidaEnMemoria());
    expect(home).toBeTruthy();
    expect(home!.startsWith(casa)).toBe(false);
    expect(home).toContain("furnus-doctor-");
  });

  it("informa si está registrado en el cliente y avisa si falta", async () => {
    const { ejecutar } = falso(pythonBueno);
    const desktop = candidatosDesktop(entorno())[0]!;
    mkdirSync(dirname(desktop), { recursive: true });
    writeFileSync(desktop, "{}");
    const antes = await doctor(contexto(ejecutar), salidaEnMemoria());
    expect(por(antes.chequeos, "registro").estado).toBe("aviso");
    expect(por(antes.chequeos, "registro").arreglo?.join(" ")).toContain("furnus init");

    init(entorno(), runtime(), salidaEnMemoria());
    const despues = await doctor(contexto(ejecutar), salidaEnMemoria());
    expect(por(despues.chequeos, "registro").estado).toBe("ok");
  });
});
