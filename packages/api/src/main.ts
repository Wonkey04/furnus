import { RepositorioLocal } from "@furnus/adapter-local";
import { KernelHttp } from "@furnus/adapter-kernel";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Agente } from "@furnus/agente";
import { crearServidor } from "./servidor.js";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
// La clave de Anthropic vive en .env (que no se commitea). Si no existe, el chat queda deshabilitado.
try {
  process.loadEnvFile(resolve(raiz, ".env"));
} catch {
  /* sin .env */
}

const puerto = Number(process.env.FURNUS_API_PORT ?? 4010);
const kernel = new KernelHttp({ autoIniciar: true });
const app = await crearServidor({
  raiz,
  crearAgente: (deps) => new Agente({ deps, apiKey: process.env.ANTHROPIC_API_KEY, modelo: process.env.FURNUS_MODELO }),
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
