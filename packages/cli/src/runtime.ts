import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { EntradaMcp } from "./mcp-config.js";

/**
 * Dónde está el código de Furnus que hay que lanzar.
 *  - «repo»: un checkout del monorepo (se corre con tsx sobre los fuentes).
 *  - «empaquetado»: el paquete npm trae `runtime/` con la API, el MCP, el kernel Python y el visor ya construidos.
 */
export interface Runtime {
  modo: "repo" | "empaquetado";
  raiz: string;
  nodo: string;
  /** Argumentos de node para el servidor MCP. */
  argsMcp: string[];
  /** Argumentos de node para la API. */
  argsApi: string[];
  kernelDir: string;
  /** Solo en modo empaquetado: carpeta del visor construido, que la API sirve. */
  visorDir: string | null;
}

export class RuntimeNoEncontrado extends Error {}

function esRaizRepo(dir: string): boolean {
  return existsSync(join(dir, "pnpm-workspace.yaml")) && existsSync(join(dir, "packages", "mcp-server", "src", "main.ts"));
}

export function resolverRuntime(opciones: { dirModulo?: string; env?: NodeJS.ProcessEnv; nodo?: string } = {}): Runtime {
  const env = opciones.env ?? process.env;
  const nodo = opciones.nodo ?? process.execPath;
  const dirModulo = opciones.dirModulo ?? dirname(fileURLToPath(import.meta.url));

  if (env.FURNUS_ROOT) {
    const raiz = resolve(env.FURNUS_ROOT);
    if (!esRaizRepo(raiz)) throw new RuntimeNoEncontrado(`FURNUS_ROOT apunta a «${raiz}», que no es un checkout de Furnus.`);
    return runtimeRepo(raiz, nodo);
  }
  // Empaquetado: dist/furnus.mjs vive junto a runtime/.
  const empaquetado = resolve(dirModulo, "..", "runtime");
  if (existsSync(join(empaquetado, "mcp.mjs"))) {
    return {
      modo: "empaquetado",
      raiz: empaquetado,
      nodo,
      argsMcp: [join(empaquetado, "mcp.mjs")],
      argsApi: [join(empaquetado, "api.mjs")],
      kernelDir: join(empaquetado, "kernel"),
      visorDir: existsSync(join(empaquetado, "visor")) ? join(empaquetado, "visor") : null,
    };
  }
  // Repo: se sube desde este archivo hasta encontrar la raíz del monorepo.
  let dir = dirModulo;
  for (let i = 0; i < 6; i++) {
    if (esRaizRepo(dir)) return runtimeRepo(dir, nodo);
    dir = dirname(dir);
  }
  throw new RuntimeNoEncontrado("No encuentro el código de Furnus (ni runtime/ empaquetado ni un checkout). Definí FURNUS_ROOT con la carpeta del repositorio.");
}

function runtimeRepo(raiz: string, nodo: string): Runtime {
  const tsx = join(raiz, "node_modules", "tsx", "dist", "esm", "index.mjs");
  if (!existsSync(tsx)) throw new RuntimeNoEncontrado(`Falta tsx en ${raiz}. Corré «pnpm install» en esa carpeta.`);
  const importar = ["--import", pathToFileURL(tsx).href];
  return {
    modo: "repo",
    raiz,
    nodo,
    argsMcp: [...importar, join(raiz, "packages", "mcp-server", "src", "main.ts")],
    argsApi: [...importar, join(raiz, "packages", "api", "src", "main.ts")],
    kernelDir: join(raiz, "services", "kernel"),
    visorDir: null,
  };
}

/** Python del venv: el del repo o el que crea `doctor --instalar`. */
export function pythonDeVenv(venvDir: string, plataforma: NodeJS.Platform): string {
  return plataforma === "win32" ? join(venvDir, "Scripts", "python.exe") : join(venvDir, "bin", "python");
}

export function venvDelKernel(r: Runtime, casa: string): string {
  return r.modo === "repo" ? join(r.kernelDir, ".venv") : join(casa, ".furnus", "venv");
}

/** La entrada que se escribe en las configs. Todo absoluto: la persona no edita nada ni depende del PATH del cliente. */
export function entradaMcp(r: Runtime, python: string | null): EntradaMcp {
  // Sin «type»: Claude Desktop solo documenta command/args/env, y Claude Code asume stdio cuando hay command.
  const env: Record<string, string> = {};
  // El paquete publicado lleva el kernel dentro de runtime/: el MCP no puede deducir dónde está.
  if (r.modo === "empaquetado") env.FURNUS_KERNEL_DIR = r.kernelDir;
  if (python) env.FURNUS_PYTHON = python;
  return { command: r.nodo, args: r.argsMcp, ...(Object.keys(env).length ? { env } : {}) };
}
