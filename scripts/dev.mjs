// pnpm dev: levanta la API (que arranca el kernel si hace falta) y el visor.
import { spawn } from "node:child_process";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const procesos = [
  spawn(pnpm, ["--filter", "@furnus/api", "start"], { stdio: "inherit", shell: process.platform === "win32" }),
  spawn(pnpm, ["--filter", "@furnus/viewer", "dev"], { stdio: "inherit", shell: process.platform === "win32" }),
];
const salir = () => procesos.forEach((p) => p.kill());
process.on("SIGINT", salir);
process.on("SIGTERM", salir);
procesos.forEach((p) => p.on("exit", (c) => { salir(); process.exit(c ?? 0); }));
