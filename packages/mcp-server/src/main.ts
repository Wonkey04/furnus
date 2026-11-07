#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { KernelHttp } from "@furnus/adapter-kernel";
import { RepositorioLocal } from "@furnus/adapter-local";
import type { EventoPieza, EventosPort } from "@furnus/app";
import { crearServidorMcp } from "./herramientas.js";

const api = `http://127.0.0.1:${process.env.FURNUS_API_PORT ?? 4010}`;

// Avisa a la API (otro proceso) para que los visores se enteren. Si la API no está, no pasa nada.
class EventosHttp implements EventosPort {
  async publicar(evento: EventoPieza): Promise<void> {
    await post("/interno/eventos", evento);
  }
}

async function post(ruta: string, cuerpo: unknown): Promise<void> {
  try {
    await fetch(api + ruta, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    /* la API puede no estar levantada */
  }
}

const kernel = new KernelHttp({ autoIniciar: true });
const servidor = crearServidorMcp({
  kernel,
  repositorio: new RepositorioLocal(),
  eventos: new EventosHttp(),
  reloj: { ahora: () => new Date().toISOString() },
});

await servidor.connect(new StdioServerTransport());
console.error("[mcp] Furnus MCP listo (stdio)");

// Latido para que la pantalla «Conectar agente» vea que hay un agente.
const latido = () => post("/interno/agente", { cliente: servidor.server.getClientVersion()?.name ?? "Agente MCP" });
void latido();
setInterval(latido, 8000).unref();

process.on("exit", () => kernel.detener());
process.stdin.on("close", () => process.exit(0));
