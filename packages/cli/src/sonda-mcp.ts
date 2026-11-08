import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export interface ResultadoSonda {
  ok: boolean;
  herramientas: string[];
  servidor?: string;
  error?: string;
}

export interface PedidoSonda {
  comando: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

export type SondaMcp = (p: PedidoSonda) => Promise<ResultadoSonda>;

/**
 * Habla con el servidor MCP como lo haría un cliente: `initialize` y `tools/list` por stdio (JSON por línea).
 * No ejecuta ninguna herramienta: no toca piezas ni arranca el kernel.
 */
export const sondearMcp: SondaMcp = (p) =>
  new Promise((resolver) => {
    const hijo = spawn(p.comando, p.args, { env: p.env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stderr = "";
    let terminado = false;
    let servidor: string | undefined;
    const fin = (r: ResultadoSonda) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(reloj);
      hijo.stdin?.destroy();
      hijo.kill();
      resolver(r);
    };
    const reloj = setTimeout(
      () => fin({ ok: false, herramientas: [], error: `no respondió en ${(p.timeoutMs ?? 20000) / 1000} s${stderr ? `: ${stderr.trim().slice(-300)}` : ""}` }),
      p.timeoutMs ?? 20000,
    );
    hijo.stderr?.setEncoding("utf8");
    hijo.stderr?.on("data", (d: string) => (stderr = (stderr + d).slice(-2000)));
    hijo.stdin?.on("error", () => undefined);
    hijo.once("error", (e) => fin({ ok: false, herramientas: [], error: e.message }));
    hijo.once("close", (codigo) => fin({ ok: false, herramientas: [], error: `el proceso terminó (código ${codigo})${stderr ? `: ${stderr.trim().slice(-300)}` : ""}` }));

    const enviar = (o: unknown) => hijo.stdin?.write(JSON.stringify(o) + "\n");
    createInterface({ input: hijo.stdout! }).on("line", (linea) => {
      let m: { id?: number; result?: { serverInfo?: { name?: string }; tools?: { name: string }[] }; error?: { message?: string } };
      try {
        m = JSON.parse(linea);
      } catch {
        return; // una línea que no es JSON-RPC (log) no cuenta
      }
      if (m.error) return fin({ ok: false, herramientas: [], error: m.error.message ?? "error del servidor" });
      if (m.id === 1) {
        servidor = m.result?.serverInfo?.name;
        enviar({ jsonrpc: "2.0", method: "notifications/initialized" });
        enviar({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
      } else if (m.id === 2) {
        fin({ ok: true, herramientas: (m.result?.tools ?? []).map((t) => t.name), servidor });
      }
    });
    enviar({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "furnus-doctor", version: "0.1.0" } },
    });
  });
