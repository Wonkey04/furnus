// Arma el paquete npm de `furnus`.
//   node scripts/construir.mjs            → dist/furnus.mjs (el ejecutable)
//   node scripts/construir.mjs --runtime  → además runtime/ (MCP, API, kernel Python y visor ya construidos)
// `prepack` corre la segunda forma, así `npm pack` / `npm publish` siempre llevan todo. Este script NO publica nada.
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const paquete = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const raiz = resolve(paquete, "..", "..");
const conRuntime = process.argv.includes("--runtime");

// Algunas dependencias (fastify, ws) son CommonJS: dentro de un bundle ESM necesitan `require`.
const shim = `import { createRequire as __furnusRequire } from "node:module"; const require = __furnusRequire(import.meta.url);`;
const comun = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  logLevel: "warning",
  external: ["bufferutil", "utf-8-validate"],
};

await build({
  ...comun,
  entryPoints: [join(paquete, "src", "main.ts")],
  outfile: join(paquete, "dist", "furnus.mjs"),
  banner: { js: `#!/usr/bin/env node\n${shim}` },
});
chmodSync(join(paquete, "dist", "furnus.mjs"), 0o755);
console.log("dist/furnus.mjs listo");

if (conRuntime) {
  const runtime = join(paquete, "runtime");
  rmSync(runtime, { recursive: true, force: true });
  mkdirSync(runtime, { recursive: true });

  await build({ ...comun, entryPoints: [join(raiz, "packages", "mcp-server", "src", "main.ts")], outfile: join(runtime, "mcp.mjs"), banner: { js: shim } });
  await build({ ...comun, entryPoints: [join(raiz, "packages", "api", "src", "main.ts")], outfile: join(runtime, "api.mjs"), banner: { js: shim } });
  console.log("runtime/mcp.mjs y runtime/api.mjs listos");

  // El kernel va como fuentes Python; las dependencias las instala `furnus doctor --instalar`.
  const ignorar = new Set([".venv", "__pycache__", ".pytest_cache", "tests", ".mypy_cache"]);
  cpSync(join(raiz, "services", "kernel"), join(runtime, "kernel"), {
    recursive: true,
    filter: (origen) => !ignorar.has(origen.split(/[\\/]/).pop() ?? "") && !origen.endsWith(".pyc"),
  });
  console.log("runtime/kernel listo");

  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const r = spawnSync(pnpm, ["--filter", "@furnus/viewer", "build"], { cwd: raiz, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) throw new Error("No se pudo construir el visor.");
  const dist = join(raiz, "apps", "viewer", "dist");
  if (!existsSync(join(dist, "index.html"))) throw new Error("El visor no generó dist/index.html.");
  cpSync(dist, join(runtime, "visor"), { recursive: true });
  console.log("runtime/visor listo");
}
