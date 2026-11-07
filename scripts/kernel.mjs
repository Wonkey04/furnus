// Levanta el servicio Python del kernel (o corre sus tests con `pnpm kernel:test`).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(fileURLToPath(import.meta.url), "..", "..");
const dirKernel = join(raiz, "services", "kernel");
const venv = process.platform === "win32"
  ? join(dirKernel, ".venv", "Scripts", "python.exe")
  : join(dirKernel, ".venv", "bin", "python");
const python = process.env.FURNUS_PYTHON ?? (existsSync(venv) ? venv : "python");

const modo = process.argv[2];
const args = modo === "test" ? ["-m", "pytest", "-q"] : ["-m", "furnus_kernel"];
const hijo = spawn(python, args, {
  cwd: dirKernel,
  stdio: "inherit",
  env: { ...process.env, PYTHONIOENCODING: "utf-8" },
});
hijo.on("exit", (codigo) => process.exit(codigo ?? 1));
