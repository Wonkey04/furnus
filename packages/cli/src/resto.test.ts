import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { leerArgs } from "./args.js";
import { DevNoDisponible, planDev } from "./dev.js";
import { HERRAMIENTAS_ESPERADAS } from "./doctor.js";
import type { Entorno } from "./entorno.js";
import { entradaMcp, resolverRuntime, RuntimeNoEncontrado } from "./runtime.js";
import { sondearMcp } from "./sonda-mcp.js";
import { VERSION } from "./version.js";

let tmp: string;
const toque = (...partes: string[]) => {
  const f = join(tmp, ...partes);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, "");
};
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "furnus-cli-resto-"));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("resolverRuntime", () => {
  const repoFalso = () => {
    toque("repo", "pnpm-workspace.yaml");
    toque("repo", "packages", "mcp-server", "src", "main.ts");
    toque("repo", "node_modules", "tsx", "dist", "esm", "index.mjs");
    return join(tmp, "repo");
  };

  it("modo repo por FURNUS_ROOT: rutas absolutas al MCP y a la API", () => {
    const raiz = repoFalso();
    const r = resolverRuntime({ env: { FURNUS_ROOT: raiz }, dirModulo: join(tmp, "x"), nodo: "/abs/node" });
    expect(r.modo).toBe("repo");
    expect(r.argsMcp[0]).toBe("--import");
    expect(r.argsMcp[1]).toMatch(/^file:\/\/\//);
    expect(r.argsMcp.at(-1)).toBe(join(raiz, "packages", "mcp-server", "src", "main.ts"));
    expect(resolve(r.argsApi.at(-1)!)).toBe(r.argsApi.at(-1));
    expect(r.nodo).toBe("/abs/node");
  });

  it("sube desde el módulo hasta encontrar el repo", () => {
    const raiz = repoFalso();
    const r = resolverRuntime({ env: {}, dirModulo: join(raiz, "packages", "cli", "src") });
    expect(r.modo).toBe("repo");
    expect(r.raiz).toBe(raiz);
  });

  it("modo empaquetado: runtime/ junto a dist/", () => {
    toque("pkg", "runtime", "mcp.mjs");
    toque("pkg", "runtime", "api.mjs");
    toque("pkg", "runtime", "visor", "index.html");
    const r = resolverRuntime({ env: {}, dirModulo: join(tmp, "pkg", "dist") });
    expect(r.modo).toBe("empaquetado");
    expect(r.argsMcp).toEqual([join(tmp, "pkg", "runtime", "mcp.mjs")]);
    expect(r.visorDir).toBe(join(tmp, "pkg", "runtime", "visor"));
  });

  it("si no encuentra nada, lo dice con una salida", () => {
    expect(() => resolverRuntime({ env: {}, dirModulo: join(tmp, "nada") })).toThrow(RuntimeNoEncontrado);
    expect(() => resolverRuntime({ env: { FURNUS_ROOT: join(tmp, "nada") } })).toThrow(/FURNUS_ROOT/);
  });

  it("entradaMcp: sin env si no hay Python, con FURNUS_PYTHON si lo hay", () => {
    const raiz = repoFalso();
    const r = resolverRuntime({ env: { FURNUS_ROOT: raiz }, nodo: "/abs/node" });
    expect(entradaMcp(r, null).env).toBeUndefined();
    expect(entradaMcp(r, "/abs/python").env).toEqual({ FURNUS_PYTHON: "/abs/python" });
    expect(entradaMcp(r, null).type).toBeUndefined();
    const empaquetado = { ...r, modo: "empaquetado" as const, kernelDir: "/p/runtime/kernel" };
    expect(entradaMcp(empaquetado, "/abs/python").env).toEqual({ FURNUS_KERNEL_DIR: "/p/runtime/kernel", FURNUS_PYTHON: "/abs/python" });
  });
});

describe("planDev", () => {
  const e: Entorno = { plataforma: "linux", casa: "/home/x", env: {} };
  it("repo: API y visor", () => {
    const r = { modo: "repo" as const, raiz: "/r", nodo: "/n", argsMcp: [], argsApi: ["api.ts"], kernelDir: "/r/services/kernel", visorDir: null };
    const p = planDev(r, e);
    expect(p.procesos.map((x) => x.nombre)).toEqual(["api", "visor"]);
    expect(p.procesos[0]?.env.FURNUS_API_PORT).toBe("4010");
    expect(p.url).toBe("http://localhost:5173");
  });
  it("empaquetado: solo la API, que sirve el visor", () => {
    const r = { modo: "empaquetado" as const, raiz: "/p/runtime", nodo: "/n", argsMcp: [], argsApi: ["api.mjs"], kernelDir: "/p/runtime/kernel", visorDir: "/p/runtime/visor" };
    const p = planDev(r, { ...e, env: { FURNUS_API_PORT: "4999" } });
    expect(p.procesos).toHaveLength(1);
    expect(p.procesos[0]?.env.FURNUS_VIEWER_DIR).toBe("/p/runtime/visor");
    expect(p.procesos[0]?.env.FURNUS_KERNEL_DIR).toBe("/p/runtime/kernel");
    expect(p.url).toBe("http://127.0.0.1:4999");
  });
  it("empaquetado sin visor: error claro", () => {
    const r = { modo: "empaquetado" as const, raiz: "/p", nodo: "/n", argsMcp: [], argsApi: [], kernelDir: "/p/k", visorDir: null };
    expect(() => planDev(r, e)).toThrow(DevNoDisponible);
  });
});

describe("leerArgs", () => {
  it("comando, banderas y --solo en las dos formas", () => {
    expect(leerArgs(["init", "--solo", "code", "--simular"])).toMatchObject({ comando: "init", banderas: new Set(["simular"]), valores: new Map([["solo", "code"]]) });
    expect(leerArgs(["init", "--solo=desktop"]).valores.get("solo")).toBe("desktop");
    expect(leerArgs(["doctor", "--instalar"]).banderas.has("instalar")).toBe(true);
  });
  it("la versión del código coincide con la del package.json", () => {
    const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8")) as { version: string };
    expect(VERSION).toBe(pkg.version);
  });
});

describe("sondearMcp", () => {
  const servidorFalso = (cuerpo: string) => {
    const f = join(tmp, "falso.mjs");
    writeFileSync(f, cuerpo);
    return f;
  };

  it("hace initialize + tools/list con un servidor que habla JSON-RPC por stdio", async () => {
    const f = servidorFalso(`
      import { createInterface } from "node:readline";
      console.log("ruido que no es JSON-RPC");
      createInterface({ input: process.stdin }).on("line", (l) => {
        const m = JSON.parse(l);
        if (m.id === 1) console.log(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "falso" } } }));
        if (m.id === 2) console.log(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: [{ name: "a" }, { name: "b" }] } }));
      });`);
    const r = await sondearMcp({ comando: process.execPath, args: [f], timeoutMs: 10000 });
    expect(r).toEqual({ ok: true, herramientas: ["a", "b"], servidor: "falso" });
  });

  it("si el proceso muere, devuelve el motivo", async () => {
    const f = servidorFalso(`console.error("Cannot find module x"); process.exit(1);`);
    const r = await sondearMcp({ comando: process.execPath, args: [f], timeoutMs: 10000 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Cannot find module x");
  });

  it("si se cuelga, corta por tiempo", async () => {
    const f = servidorFalso(`setInterval(() => {}, 1000);`);
    const r = await sondearMcp({ comando: process.execPath, args: [f], timeoutMs: 800 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("no respondió");
  });

  it("contrato: el MCP real de Furnus expone exactamente las tools esperadas (si estamos en el repo)", async () => {
    let runtime;
    try {
      runtime = resolverRuntime({ env: {} });
    } catch {
      return; // fuera del repo no hay MCP que sondear
    }
    if (runtime.modo !== "repo") return;
    const r = await sondearMcp({
      comando: runtime.nodo,
      args: runtime.argsMcp,
      env: { ...process.env, FURNUS_HOME: join(tmp, "home"), FURNUS_API_PORT: "1" },
      timeoutMs: 40000,
    });
    expect(r.error).toBeUndefined();
    expect([...r.herramientas].sort()).toEqual([...HERRAMIENTAS_ESPERADAS].sort());
    expect(r.servidor).toBe("furnus");
  }, 60000);
});
