import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import {
  CambiarParametro,
  ConsultarEstado,
  CrearPieza,
  EjecutarScript,
  Exportar,
  IrARevision,
  ListarPiezas,
  type Dependencias,
  type EventoPieza,
  type EventosPort,
  type FormatoExportacion,
} from "@furnus/app";
import { ErrorDeDominio, type Pieza } from "@furnus/core";
import type { AgentePuerto, EventoChat } from "@furnus/agente";

type Socket = { send(data: string): void; on(ev: string, fn: () => void): void; readyState: number };

/** Hub WebSocket: implementa EventosPort y reenvía a los visores conectados. */
export class HubEventos implements EventosPort {
  private sockets = new Set<Socket>();
  agregar(s: Socket): void {
    this.sockets.add(s);
    s.on("close", () => this.sockets.delete(s));
  }
  publicar(
    evento: EventoPieza | { tipo: "agente"; conectado: boolean; cliente: string | null } | { tipo: "chat"; piezaId: string; evento: EventoChat },
  ): void {
    const texto = JSON.stringify(evento);
    for (const s of this.sockets) if (s.readyState === 1) s.send(texto);
  }
}

const VIGENCIA_AGENTE_MS = 20_000;

export class PresenciaAgente {
  private visto = 0;
  private cliente: string | null = null;
  private ultimoEstado = false;
  constructor(private reloj: () => number = Date.now) {}
  latido(cliente: string): void {
    this.visto = this.reloj();
    this.cliente = cliente;
  }
  get conectado(): boolean {
    return this.visto > 0 && this.reloj() - this.visto < VIGENCIA_AGENTE_MS;
  }
  estado() {
    return { conectado: this.conectado, cliente: this.conectado ? this.cliente : null };
  }
  /** Devuelve el estado nuevo solo si cambió desde la última vez. */
  cambio() {
    const e = this.estado();
    if (e.conectado === this.ultimoEstado) return null;
    this.ultimoEstado = e.conectado;
    return e;
  }
}

const ESTADOS: Record<string, number> = {
  PIEZA_NO_ENCONTRADA: 404,
  KERNEL_NO_DISPONIBLE: 503,
};

function responderError(e: unknown, reply: FastifyReply) {
  if (e instanceof ErrorDeDominio) {
    return reply.code(ESTADOS[e.codigo] ?? 422).send({ error: { codigo: e.codigo, mensaje: e.message } });
  }
  const mensaje = e instanceof Error ? e.message : String(e);
  return reply.code(500).send({ error: { codigo: "ERROR_INTERNO", mensaje } });
}

function resumen(p: Pieza) {
  return {
    id: p.id,
    nombre: p.nombre,
    editadaEn: p.editadaEn,
    operaciones: p.revisiones.length,
    caja: p.resultado?.medidas?.caja ?? null,
    valida: p.resultado?.valida ?? null,
  };
}

export interface OpcionesServidor {
  deps: Omit<Dependencias, "eventos">;
  hub?: HubEventos;
  presencia?: PresenciaAgente;
  /** Carpeta raíz del repo; el visor la usa para armar la configuración MCP. */
  raiz?: string;
  /** Arma el agente del chat con las dependencias ya conectadas al hub de eventos. Sin esto no hay chat. */
  crearAgente?: (deps: Dependencias) => AgentePuerto;
  /** Visor ya construido (paquete publicado): la API lo sirve en «/» para no necesitar un servidor aparte. */
  visorDir?: string;
}

const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ico": "image/x-icon",
};

export async function crearServidor(opciones: OpcionesServidor): Promise<FastifyInstance> {
  const hub = opciones.hub ?? new HubEventos();
  const presencia = opciones.presencia ?? new PresenciaAgente();
  const deps: Dependencias = { ...opciones.deps, eventos: hub };
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: [/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/], methods: ["GET", "POST", "PUT"] });
  await app.register(websocket);

  const agenteChat = opciones.crearAgente?.(deps) ?? null;
  const consultar = new ConsultarEstado(deps);
  const timer = setInterval(() => {
    const c = presencia.cambio();
    if (c) hub.publicar({ tipo: "agente", ...c });
  }, 3000);
  timer.unref();
  app.addHook("onClose", async () => clearInterval(timer));

  app.get("/api/salud", async () => ({ ok: true }));

  app.get("/api/piezas", async () => (await new ListarPiezas(deps).ejecutar()).map(resumen));

  app.post<{ Body: { nombre?: string } }>("/api/piezas", async (req, reply) => {
    try {
      const pieza = await new CrearPieza(deps).ejecutar({ nombre: req.body?.nombre });
      return reply.code(201).send(resumen(pieza));
    } catch (e) {
      return responderError(e, reply);
    }
  });

  app.get<{ Params: { id: string } }>("/api/piezas/:id", async (req, reply) => {
    try {
      const estado = await consultar.ejecutar({ piezaId: req.params.id });
      const r = estado.pieza.resultado;
      return {
        ...estado,
        mallaUrl: r ? `/api/piezas/${estado.pieza.id}/malla?v=${encodeURIComponent(r.ejecutadoEn)}` : null,
      };
    } catch (e) {
      return responderError(e, reply);
    }
  });

  app.get<{ Params: { id: string } }>("/api/piezas/:id/malla", async (req, reply) => {
    try {
      const ruta = join(await deps.repositorio.rutaSalidas(req.params.id), "pieza.glb");
      await stat(ruta);
      return reply.header("content-type", "model/gltf-binary").header("cache-control", "no-store").send(createReadStream(ruta));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        return reply.code(404).send({ error: { codigo: "SIN_MALLA", mensaje: "La pieza todavía no tiene malla." } });
      }
      return responderError(e, reply);
    }
  });

  app.put<{ Params: { id: string }; Body: { nombre: string; valor: number } }>(
    "/api/piezas/:id/parametros",
    async (req, reply) => {
      try {
        const { nombre, valor } = req.body ?? ({} as { nombre: string; valor: number });
        if (typeof nombre !== "string" || typeof valor !== "number") {
          return reply.code(400).send({ error: { codigo: "PEDIDO_INVALIDO", mensaje: "Mandá {nombre, valor} con valor numérico." } });
        }
        return await new CambiarParametro(deps).ejecutar({ piezaId: req.params.id, nombre, valor });
      } catch (e) {
        return responderError(e, reply);
      }
    },
  );

  app.post<{ Params: { id: string }; Body: { destino: "deshacer" | "rehacer" | number } }>(
    "/api/piezas/:id/revision",
    async (req, reply) => {
      try {
        return await new IrARevision(deps).ejecutar({ piezaId: req.params.id, destino: req.body?.destino });
      } catch (e) {
        return responderError(e, reply);
      }
    },
  );

  // Permite a la persona correr un script a mano (misma ruta que el agente, con origen «persona»).
  app.post<{ Params: { id: string }; Body: { script: string } }>("/api/piezas/:id/script", async (req, reply) => {
    try {
      return await new EjecutarScript(deps).ejecutar({ piezaId: req.params.id, script: req.body?.script, origen: "persona" });
    } catch (e) {
      return responderError(e, reply);
    }
  });

  app.post<{ Params: { id: string }; Body: { formato: FormatoExportacion; unidad?: "mm" | "in" } }>(
    "/api/piezas/:id/exportar",
    async (req, reply) => {
      try {
        const salida = await new Exportar(deps).ejecutar({
          piezaId: req.params.id,
          formato: req.body?.formato ?? "step",
          unidad: req.body?.unidad,
        });
        return reply
          .header("content-type", "model/step")
          .header("content-disposition", `attachment; filename="${salida.nombreArchivo}"`)
          .send(createReadStream(salida.ruta));
      } catch (e) {
        return responderError(e, reply);
      }
    },
  );

  // --- Chat con el agente embebido: el pedido vuelve enseguida y el avance viaja por el WebSocket ---
  app.get("/api/chat/estado", async () => {
    if (!agenteChat) return { disponible: false, estado: "sin_motor", modelo: null, ayuda: null };
    const d = await agenteChat.diagnostico();
    return { disponible: d.estado === "listo", estado: d.estado, modelo: agenteChat.modelo, version: d.version ?? null, ayuda: d.ayuda ?? null };
  });

  app.get<{ Params: { id: string } }>("/api/piezas/:id/chat", async (req, reply) => {
    if (!agenteChat) return { ocupado: false, transcripto: [] };
    if (!(await deps.repositorio.obtener(req.params.id))) {
      return reply.code(404).send({ error: { codigo: "PIEZA_NO_ENCONTRADA", mensaje: `No existe la pieza «${req.params.id}».` } });
    }
    return agenteChat.estado(req.params.id);
  });

  app.post<{ Params: { id: string }; Body: { texto?: string } }>("/api/piezas/:id/chat", async (req, reply) => {
    const texto = typeof req.body?.texto === "string" ? req.body.texto.trim() : "";
    if (!texto) return reply.code(400).send({ error: { codigo: "PEDIDO_INVALIDO", mensaje: "Escribí un mensaje." } });
    const motor = agenteChat ? await agenteChat.diagnostico() : null;
    if (!agenteChat || motor?.estado !== "listo") {
      const sinLogin = motor?.estado === "sin_login";
      return reply.code(503).send({
        error: {
          codigo: sinLogin ? "SIN_LOGIN" : "SIN_CLI",
          mensaje: sinLogin
            ? "Claude Code no tiene la sesión iniciada. Corré «claude auth login» en una terminal y probá de nuevo."
            : "El chat usa Claude Code y no se lo encuentra. Instalalo (comando en el panel de chat) y probá de nuevo.",
        },
      });
    }
    const id = req.params.id;
    if (!(await deps.repositorio.obtener(id))) {
      return reply.code(404).send({ error: { codigo: "PIEZA_NO_ENCONTRADA", mensaje: `No existe la pieza «${id}».` } });
    }
    if (agenteChat.estado(id).ocupado) {
      return reply.code(409).send({ error: { codigo: "OCUPADO", mensaje: "El agente todavía está trabajando en el mensaje anterior." } });
    }
    void agenteChat.enviar(id, texto, (evento) => hub.publicar({ tipo: "chat", piezaId: id, evento })).catch((e: unknown) => {
      hub.publicar({ tipo: "chat", piezaId: id, evento: { tipo: "error", mensaje: e instanceof Error ? e.message : String(e) } });
    });
    return reply.code(202).send({ ok: true });
  });

  app.post<{ Params: { id: string } }>("/api/piezas/:id/chat/cancelar", async (req) => {
    agenteChat?.cancelar(req.params.id);
    return { ok: true };
  });

  app.get("/api/configuracion", async () => ({ raiz: opciones.raiz ?? null }));

  app.get("/api/agente", async () => presencia.estado());

  // Rutas internas: las usa el proceso MCP (otro proceso) para avisar a los visores.
  app.post<{ Body: { cliente?: string } }>("/interno/agente", async (req) => {
    presencia.latido(req.body?.cliente ?? "Agente MCP");
    const c = presencia.cambio();
    if (c) hub.publicar({ tipo: "agente", ...c });
    return { ok: true };
  });
  app.post<{ Body: EventoPieza }>("/interno/eventos", async (req) => {
    hub.publicar(req.body);
    return { ok: true };
  });

  app.get("/ws", { websocket: true }, (socket) => {
    hub.agregar(socket as unknown as Socket);
    const e = presencia.estado();
    socket.send(JSON.stringify({ tipo: "agente", ...e }));
  });

  if (opciones.visorDir) {
    const base = normalize(opciones.visorDir);
    // Archivos del visor; cualquier otra ruta del navegador cae en index.html (es una SPA con rutas del lado del cliente).
    app.setNotFoundHandler(async (req, reply) => {
      const ruta = decodeURIComponent(req.url.split("?")[0] ?? "/");
      if (req.method !== "GET" || ruta.startsWith("/api/") || ruta === "/ws") {
        return reply.code(404).send({ error: { codigo: "NO_ENCONTRADO", mensaje: "Ruta inexistente." } });
      }
      const candidato = normalize(join(base, ruta));
      let archivo = join(base, "index.html");
      if (candidato.startsWith(base + sep) && (await stat(candidato).then((s) => s.isFile()).catch(() => false))) archivo = candidato;
      return reply.type(TIPOS[extname(archivo)] ?? "application/octet-stream").send(createReadStream(archivo));
    });
  }

  return app;
}
