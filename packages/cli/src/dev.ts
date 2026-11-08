import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { Entorno } from "./entorno.js";
import { pythonDeVenv, venvDelKernel, type Runtime } from "./runtime.js";
import type { Salida } from "./salida.js";

export interface ProcesoPlan {
  nombre: string;
  comando: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  /** Necesario para `pnpm.cmd` en Windows. */
  shell?: boolean;
}

export interface PlanDev {
  procesos: ProcesoPlan[];
  /** Dónde abrir el visor. */
  url: string;
}

export class DevNoDisponible extends Error {}

/** Qué procesos hay que lanzar. Es una función pura para poder probarla sin levantar nada. */
export function planDev(r: Runtime, e: Entorno): PlanDev {
  const puertoApi = e.env.FURNUS_API_PORT ?? "4010";
  const venv = pythonDeVenv(venvDelKernel(r, e.casa), e.plataforma);
  const base: NodeJS.ProcessEnv = { ...e.env, FURNUS_API_PORT: puertoApi };
  if (!base.FURNUS_PYTHON && existsSync(venv)) base.FURNUS_PYTHON = venv;
  const api: ProcesoPlan = { nombre: "api", comando: r.nodo, args: r.argsApi, cwd: r.raiz, env: base };

  if (r.modo === "repo") {
    const pnpm = e.plataforma === "win32" ? "pnpm.cmd" : "pnpm";
    return {
      procesos: [api, { nombre: "visor", comando: pnpm, args: ["--filter", "@furnus/viewer", "dev"], cwd: r.raiz, env: base, shell: e.plataforma === "win32" }],
      url: "http://localhost:5173",
    };
  }
  if (!r.visorDir) throw new DevNoDisponible("Este paquete no trae el visor construido. Reinstalá Furnus (npm install -g furnus@latest).");
  return { procesos: [{ ...api, env: { ...base, FURNUS_VIEWER_DIR: r.visorDir, FURNUS_KERNEL_DIR: r.kernelDir, FURNUS_MCP_ENTRY: r.argsMcp[0] ?? "" } }], url: `http://127.0.0.1:${puertoApi}` };
}

/** Lanza el plan y espera. Ctrl+C baja todo; si un proceso se cae, se bajan los demás. */
export function dev(r: Runtime, e: Entorno, salida: Salida): Promise<number> {
  const plan = planDev(r, e);
  salida.linea("Furnus dev");
  salida.linea(`  ${plan.procesos.map((p) => p.nombre).join(" + ")}  →  ${plan.url}`);
  salida.linea("  Ctrl+C para cortar.");
  return new Promise((resolver) => {
    // Con shell se arma un solo string (pasar args aparte con shell:true está deprecado en Node).
    const hijos = plan.procesos.map((p) =>
      p.shell
        ? spawn([p.comando, ...p.args].join(" "), { cwd: p.cwd, env: p.env, stdio: "inherit", shell: true, windowsHide: true })
        : spawn(p.comando, p.args, { cwd: p.cwd, env: p.env, stdio: "inherit", windowsHide: true }),
    );
    let cerrando = false;
    const cerrar = (codigo: number) => {
      if (cerrando) return;
      cerrando = true;
      for (const h of hijos) {
        if (h.pid === undefined || h.exitCode !== null) continue;
        // En Windows un shell deja procesos nietos: se baja el árbol entero.
        if (process.platform === "win32") spawn("taskkill", ["/pid", String(h.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        else h.kill("SIGTERM");
      }
      setTimeout(() => resolver(codigo), 300);
    };
    process.once("SIGINT", () => cerrar(0));
    process.once("SIGTERM", () => cerrar(0));
    hijos.forEach((h, i) => {
      h.once("error", (err) => {
        salida.linea(`No pude lanzar ${plan.procesos[i]?.nombre}: ${err.message}`);
        cerrar(1);
      });
      h.once("exit", (c) => cerrar(c ?? 0));
    });
  });
}
