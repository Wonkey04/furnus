import { RepositorioLocal } from "@furnus/adapter-local";
import { KernelHttp } from "@furnus/adapter-kernel";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AgenteCli } from "@furnus/agente";
import { crearServidor } from "./servidor.js";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
// .env es opcional (puerto, carpeta de proyectos, modelo del chat). El chat NO usa claves: lanza el Claude Code de la persona.
try {
  process.loadEnvFile(resolve(raiz, ".env"));
} catch {
  /* sin .env */
}

const puerto = Number(process.env.FURNUS_API_PORT ?? 4010);
const kernel = new KernelHttp({ autoIniciar: true });
const app = await crearServidor({
  raiz,
  crearAgente: () =>
    new AgenteCli({
      modelo: process.env.FURNUS_MODELO || undefined,
      // El mismo servidor MCP que usa un agente externo (ver .mcp.json).
      mcp: {
        command: process.execPath,
        args: ["--import", pathToFileURL(resolve(raiz, "node_modules", "tsx", "dist", "esm", "index.mjs")).href, resolve(raiz, "packages", "mcp-server", "src", "main.ts")],
        env: { FURNUS_API_PORT: String(puerto) },
      },
    }),
  deps: { kernel, repositorio: new RepositorioLocal(), reloj: { ahora: () => new Date().toISOString() } },
});
await app.listen({ port: puerto, host: "127.0.0.1" });
console.log(`[api] escuchando en http://127.0.0.1:${puerto}`);

const salir = () => {
  kernel.detener();
  void app.close().then(() => process.exit(0));
};
process.on("SIGINT", salir);
process.on("SIGTERM", salir);
