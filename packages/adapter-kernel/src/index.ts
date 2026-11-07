import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { KernelPort, PedidoKernel, RespuestaKernel } from "@furnus/app";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export interface OpcionesKernelHttp {
  url?: string;
  /** Si el kernel no responde, lo levanta como subproceso. */
  autoIniciar?: boolean;
  python?: string;
}

function pythonDelKernel(): string {
  if (process.env.FURNUS_PYTHON) return process.env.FURNUS_PYTHON;
  const venv =
    process.platform === "win32"
      ? join(RAIZ, "services", "kernel", ".venv", "Scripts", "python.exe")
      : join(RAIZ, "services", "kernel", ".venv", "bin", "python");
  return existsSync(venv) ? venv : "python";
}

export class KernelHttp implements KernelPort {
  private url: string;
  private hijo: ChildProcess | null = null;
  private iniciando: Promise<void> | null = null;

  constructor(private opciones: OpcionesKernelHttp = {}) {
    const puerto = process.env.FURNUS_KERNEL_PORT ?? "4020";
    this.url = opciones.url ?? `http://127.0.0.1:${puerto}`;
  }

  async estaVivo(): Promise<boolean> {
    try {
      const r = await fetch(`${this.url}/salud`, { signal: AbortSignal.timeout(1500) });
      return r.ok;
    } catch {
      return false;
    }
  }

  private async asegurar(): Promise<void> {
    if (await this.estaVivo()) return;
    if (!this.opciones.autoIniciar) throw new Error(`El kernel no responde en ${this.url}.`);
    this.iniciando ??= this.levantar().finally(() => {
      this.iniciando = null;
    });
    await this.iniciando;
  }

  private async levantar(): Promise<void> {
    const puerto = new URL(this.url).port;
    this.hijo = spawn(this.opciones.python ?? pythonDelKernel(), ["-m", "furnus_kernel"], {
      cwd: join(RAIZ, "services", "kernel"),
      stdio: "ignore",
      windowsHide: true,
      env: { ...process.env, FURNUS_KERNEL_PORT: puerto, PYTHONIOENCODING: "utf-8" },
    });
    this.hijo.on("error", () => undefined);
    for (let i = 0; i < 60; i++) {
      if (await this.estaVivo()) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`El kernel no arrancó en ${this.url} después de 30 s.`);
  }

  async ejecutar(pedido: PedidoKernel): Promise<RespuestaKernel> {
    await this.asegurar();
    const respuesta = await fetch(`${this.url}/ejecutar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        script: pedido.script,
        parametros: pedido.parametros,
        salidas: pedido.salidas,
        unidad: pedido.unidad,
        vistas: pedido.vistas,
        directorio_salida: pedido.directorioSalida,
      }),
    });
    if (!respuesta.ok) throw new Error(`El kernel respondió ${respuesta.status}.`);
    const crudo = (await respuesta.json()) as Partial<RespuestaKernel>;
    return {
      ok: crudo.ok ?? false,
      malla: crudo.malla ?? null,
      step: crudo.step ?? null,
      stl: crudo.stl ?? null,
      render: crudo.render ?? null,
      medidas: crudo.medidas ?? null,
      valida: crudo.valida ?? false,
      motivos: crudo.motivos ?? [],
      parametros: crudo.parametros ?? [],
      error: crudo.error ?? null,
    };
  }

  detener(): void {
    this.hijo?.kill();
    this.hijo = null;
  }
}
