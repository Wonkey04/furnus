import { spawn } from "node:child_process";

export interface ResultadoProceso {
  /** `null` si no pudo arrancar o se cortó por tiempo. */
  codigo: number | null;
  stdout: string;
  stderr: string;
  noEncontrado?: boolean;
  tiempoAgotado?: boolean;
}

export interface OpcionesProceso {
  timeoutMs?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Muestra la salida a medida que llega (instalaciones largas). */
  mostrar?: boolean;
}

export type Ejecutar = (comando: string, args: string[], op?: OpcionesProceso) => Promise<ResultadoProceso>;

const comillas = (a: string) => (/[\s"&|<>^()%!]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

export const ejecutarReal: Ejecutar = (comando, args, op = {}) =>
  new Promise((resolver) => {
    // Los .cmd de Windows (npm, claude.cmd) solo corren a través de un shell.
    const shell = process.platform === "win32" && /\.(cmd|bat)$/i.test(comando);
    let hijo;
    try {
      hijo = shell
        ? spawn([comando, ...args].map(comillas).join(" "), { cwd: op.cwd, env: op.env, shell: true, windowsHide: true })
        : spawn(comando, args, { cwd: op.cwd, env: op.env, windowsHide: true });
    } catch (e) {
      resolver({ codigo: null, stdout: "", stderr: String(e), noEncontrado: true });
      return;
    }
    let stdout = "";
    let stderr = "";
    let agotado = false;
    const tope = (s: string, d: string) => (s + d).slice(-200_000);
    hijo.stdout?.setEncoding("utf8");
    hijo.stderr?.setEncoding("utf8");
    hijo.stdout?.on("data", (d: string) => {
      stdout = tope(stdout, d);
      if (op.mostrar) process.stdout.write(d);
    });
    hijo.stderr?.on("data", (d: string) => {
      stderr = tope(stderr, d);
      if (op.mostrar) process.stderr.write(d);
    });
    const reloj = op.timeoutMs
      ? setTimeout(() => {
          agotado = true;
          hijo.kill();
        }, op.timeoutMs)
      : null;
    hijo.once("error", (error: NodeJS.ErrnoException) => {
      if (reloj) clearTimeout(reloj);
      resolver({ codigo: null, stdout, stderr: stderr || error.message, noEncontrado: error.code === "ENOENT" });
    });
    hijo.once("close", (codigo) => {
      if (reloj) clearTimeout(reloj);
      resolver({ codigo: agotado ? null : codigo, stdout, stderr, tiempoAgotado: agotado || undefined });
    });
  });
