import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Entorno } from "./entorno.js";
import { init } from "./init.js";
import { archivoConfigCode, candidatosDesktop } from "./rutas.js";
import type { Runtime } from "./runtime.js";
import { salidaEnMemoria } from "./salida.js";

// Todo apunta a un directorio temporal: ningún test lee ni escribe la config real de nadie.
let casa: string;
const entorno = (plataforma: NodeJS.Platform, extra: NodeJS.ProcessEnv = {}): Entorno => ({
  plataforma,
  casa,
  // PATH vacío: así no se "encuentra" el claude real de la máquina que corre los tests.
  env: { PATH: "", ...(plataforma === "win32" ? { APPDATA: join(casa, "AppData", "Roaming"), LOCALAPPDATA: join(casa, "AppData", "Local") } : {}), ...extra },
});
const runtime = (): Runtime => ({
  modo: "repo",
  raiz: join(casa, "repo"),
  nodo: "/ruta/absoluta/node",
  argsMcp: ["--import", "file:///ruta/tsx.mjs", "/ruta/mcp/main.ts"],
  argsApi: [],
  kernelDir: join(casa, "repo", "services", "kernel"),
  visorDir: null,
});
const escribir = (archivo: string, contenido: string) => {
  mkdirSync(dirname(archivo), { recursive: true });
  writeFileSync(archivo, contenido, "utf8");
};
const leer = (archivo: string) => JSON.parse(readFileSync(archivo, "utf8")) as { mcpServers?: Record<string, { command: string; args: string[] }>; [k: string]: unknown };
const respaldos = (archivo: string) => readdirSync(dirname(archivo)).filter((f) => f.includes(".furnus-backup-"));

beforeEach(() => {
  casa = mkdtempSync(join(tmpdir(), "furnus-cli-test-"));
});
afterEach(() => rmSync(casa, { recursive: true, force: true }));

describe.each(["win32", "darwin", "linux"] as const)("init en %s", (plataforma) => {
  it("registra en Desktop y en Code, con copia de seguridad y sin pisar otros servidores", () => {
    const e = entorno(plataforma);
    const desktop = candidatosDesktop(e)[0]!;
    const code = archivoConfigCode(e);
    const origDesktop = JSON.stringify({ globalShortcut: "x", mcpServers: { filesystem: { command: "npx", args: ["fs"] } } }, null, 2);
    const origCode = JSON.stringify({ numStartups: 3, projects: { a: 1 }, mcpServers: { amplitude: { type: "http", url: "https://x" } } }, null, 2);
    escribir(desktop, origDesktop);
    escribir(code, origCode);

    const s = salidaEnMemoria();
    const r = init(e, runtime(), s, { ahora: () => new Date("2026-11-08T12:00:00Z") });

    expect(r.informes.map((i) => [i.cliente, i.estado])).toEqual([["desktop", "creado"], ["code", "creado"]]);
    const d = leer(desktop);
    expect(d.globalShortcut).toBe("x");
    expect(Object.keys(d.mcpServers!)).toEqual(["filesystem", "furnus"]);
    expect(d.mcpServers!.furnus).toMatchObject({ command: "/ruta/absoluta/node", args: runtime().argsMcp });
    const c = leer(code);
    expect(c.numStartups).toBe(3);
    expect(Object.keys(c.mcpServers!)).toEqual(["amplitude", "furnus"]);

    // La copia es idéntica al original.
    const [bd] = respaldos(desktop);
    const [bc] = respaldos(code);
    expect(readFileSync(join(dirname(desktop), bd!), "utf8")).toBe(origDesktop);
    expect(readFileSync(join(dirname(code), bc!), "utf8")).toBe(origCode);
    expect(bd).toContain("20261108120000");

    const texto = s.texto();
    expect(texto).toContain("copia de seguridad");
    expect(texto).toContain("filesystem"); // avisa que no tocó los otros
    expect(texto).toContain("Reiniciá Claude Desktop");
  });

  it("si ya está registrado no escribe ni hace otra copia", () => {
    const e = entorno(plataforma);
    const desktop = candidatosDesktop(e)[0]!;
    escribir(desktop, "{}");
    init(e, runtime(), salidaEnMemoria(), { solo: "desktop" });
    const antes = readFileSync(desktop, "utf8");
    const cantidad = respaldos(desktop).length;

    const r = init(e, runtime(), salidaEnMemoria(), { solo: "desktop", ahora: () => new Date("2030-01-01T00:00:00Z") });
    expect(r.informes[0]?.estado).toBe("sin_cambios");
    expect(readFileSync(desktop, "utf8")).toBe(antes);
    expect(respaldos(desktop)).toHaveLength(cantidad);
  });
});

describe("init", () => {
  it("--simular no escribe nada", () => {
    const e = entorno("linux");
    const desktop = candidatosDesktop(e)[0]!;
    escribir(desktop, "{}");
    const r = init(e, runtime(), salidaEnMemoria(), { simular: true });
    expect(r.informes[0]?.estado).toBe("creado");
    expect(readFileSync(desktop, "utf8")).toBe("{}");
    expect(respaldos(desktop)).toHaveLength(0);
  });

  it("con un JSON roto no toca el archivo ni hace copia, y avisa", () => {
    const e = entorno("darwin");
    const desktop = candidatosDesktop(e)[0]!;
    escribir(desktop, '{ "mcpServers": { roto');
    const s = salidaEnMemoria();
    const r = init(e, runtime(), s);
    expect(r.informes[0]?.estado).toBe("error");
    expect(readFileSync(desktop, "utf8")).toBe('{ "mcpServers": { roto');
    expect(respaldos(desktop)).toHaveLength(0);
    expect(s.texto()).toContain("No toqué nada");
  });

  it("crea la config si el cliente está instalado pero todavía no tiene archivo", () => {
    const e = entorno("linux");
    const desktop = candidatosDesktop(e)[0]!;
    mkdirSync(dirname(desktop), { recursive: true }); // la carpeta Claude existe, el archivo no
    const r = init(e, runtime(), salidaEnMemoria());
    expect(r.informes[0]).toMatchObject({ cliente: "desktop", estado: "creado" });
    expect(leer(desktop).mcpServers?.furnus).toBeDefined();
    expect(respaldos(desktop)).toHaveLength(0);
  });

  it("no inventa clientes: sin ninguno instalado no crea nada", () => {
    const e = entorno("linux");
    const s = salidaEnMemoria();
    const r = init(e, runtime(), s);
    expect(r.informes).toHaveLength(0);
    expect(r.noEncontrados).toEqual(["desktop", "code"]);
    expect(existsSync(join(casa, ".claude.json"))).toBe(false);
    expect(existsSync(join(casa, ".config"))).toBe(false);
    expect(s.texto()).toContain("No encontré ni Claude Desktop ni Claude Code");
  });

  it("--solo registra únicamente en el cliente pedido", () => {
    const e = entorno("linux");
    const desktop = candidatosDesktop(e)[0]!;
    escribir(desktop, "{}");
    escribir(archivoConfigCode(e), "{}");
    const r = init(e, runtime(), salidaEnMemoria(), { solo: "code" });
    expect(r.informes.map((i) => i.cliente)).toEqual(["code"]);
    expect(readFileSync(desktop, "utf8")).toBe("{}");
  });

  it("respeta CLAUDE_CONFIG_DIR para Claude Code", () => {
    const otra = join(casa, "otra-config");
    mkdirSync(otra, { recursive: true });
    const e = entorno("linux", { CLAUDE_CONFIG_DIR: otra });
    init(e, runtime(), salidaEnMemoria(), { solo: "code" });
    expect(leer(join(otra, ".claude.json")).mcpServers?.furnus).toBeDefined();
    expect(existsSync(join(casa, ".claude.json"))).toBe(false);
  });

  it("en Windows con la versión de la Microsoft Store escribe donde la lee la app", () => {
    const e = entorno("win32");
    const msix = join(casa, "AppData", "Local", "Packages", "Claude_abc123", "LocalCache", "Roaming", "Claude", "claude_desktop_config.json");
    escribir(msix, "{}");
    const r = init(e, runtime(), salidaEnMemoria(), { solo: "desktop" });
    expect(r.informes.map((i) => i.archivo)).toEqual([msix]);
    expect(leer(msix).mcpServers?.furnus).toBeDefined();
  });

  it("pasa FURNUS_PYTHON al MCP cuando el kernel ya tiene su entorno virtual", () => {
    const e = entorno("linux");
    const venvPy = join(runtime().kernelDir, ".venv", "bin", "python");
    escribir(venvPy, "");
    escribir(candidatosDesktop(e)[0]!, "{}");
    const r = init(e, runtime(), salidaEnMemoria(), { solo: "desktop" });
    expect(r.kernelPendiente).toBe(false);
    expect((leer(candidatosDesktop(e)[0]!).mcpServers!.furnus as { env?: unknown }).env).toEqual({ FURNUS_PYTHON: venvPy });
  });

  it("avisa que falta el kernel cuando no hay Python preparado", () => {
    const e = entorno("linux");
    escribir(candidatosDesktop(e)[0]!, "{}");
    const s = salidaEnMemoria();
    const r = init(e, runtime(), s);
    expect(r.kernelPendiente).toBe(true);
    expect(s.texto()).toContain("furnus doctor --instalar");
  });
});
