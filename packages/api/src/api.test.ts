import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CASOS_CONTRATO, KernelFalso, RelojFijo, RepositorioEnMemoria, SCRIPT_CAJA } from "@furnus/app";
import { ayudaClaudeCode, type AgentePuerto, type Diagnostico, type EventoChat } from "@furnus/agente";
import type { FastifyInstance } from "fastify";
import { HubEventos, PresenciaAgente, crearServidor } from "./servidor.js";

let app: FastifyInstance;
let repo: RepositorioEnMemoria;
let hub: HubEventos;
let ahora = 1_000_000;
let presencia: PresenciaAgente;
let carpeta: string;

beforeEach(async () => {
  carpeta = mkdtempSync(join(tmpdir(), "furnus-api-"));
  repo = new RepositorioEnMemoria();
  repo.rutaSalidas = async () => carpeta;
  hub = new HubEventos();
  presencia = new PresenciaAgente(() => ahora);
  const caja = CASOS_CONTRATO[0]!.respuestaFalsa;
  const kernel = new KernelFalso((p) => {
    if (p.salidas.includes("step")) {
      const ruta = join(carpeta, "pieza.step");
      writeFileSync(ruta, "ISO-10303-21;");
      return { ...caja, step: { formato: "step", ruta } };
    }
    const caso = CASOS_CONTRATO.find((c) => c.script === p.script && JSON.stringify(c.parametros ?? {}) === JSON.stringify(p.parametros));
    return caso?.respuestaFalsa ?? caja;
  });
  app = await crearServidor({ deps: { kernel, repositorio: repo, reloj: new RelojFijo() }, hub, presencia });
});

afterEach(() => app.close());

async function crear() {
  const r = await app.inject({ method: "POST", url: "/api/piezas", payload: { nombre: "Carcasa" } });
  return (r.json() as { id: string }).id;
}

describe("API HTTP", () => {
  it("lista, crea y consulta piezas", async () => {
    expect((await app.inject({ url: "/api/piezas" })).json()).toEqual([]);
    const id = await crear();
    await app.inject({ method: "POST", url: `/api/piezas/${id}/script`, payload: { script: SCRIPT_CAJA } });
    const lista = (await app.inject({ url: "/api/piezas" })).json() as Array<{ operaciones: number; caja: number[] }>;
    expect(lista[0]).toMatchObject({ operaciones: 1, caja: [60, 40, 24] });
    const estado = (await app.inject({ url: `/api/piezas/${id}` })).json() as { mallaUrl: string; exportable: { ok: boolean } };
    expect(estado.mallaUrl).toContain(`/api/piezas/${id}/malla`);
    expect(estado.exportable.ok).toBe(true);
  });

  it("devuelve 404 para una pieza inexistente", async () => {
    const r = await app.inject({ url: "/api/piezas/nada" });
    expect(r.statusCode).toBe(404);
    expect(r.json().error.codigo).toBe("PIEZA_NO_ENCONTRADA");
  });

  it("cambia un parámetro y rechaza uno fuera de rango con 422", async () => {
    const id = await crear();
    await app.inject({ method: "POST", url: `/api/piezas/${id}/script`, payload: { script: SCRIPT_CAJA } });
    const ok = await app.inject({ method: "PUT", url: `/api/piezas/${id}/parametros`, payload: { nombre: "largo", valor: 100 } });
    expect(ok.json().medidas.caja).toEqual([100, 40, 24]);
    const mal = await app.inject({ method: "PUT", url: `/api/piezas/${id}/parametros`, payload: { nombre: "largo", valor: 999 } });
    expect(mal.statusCode).toBe(422);
    expect(mal.json().error.mensaje).toContain("entre 10 y 200");
    const sinTipo = await app.inject({ method: "PUT", url: `/api/piezas/${id}/parametros`, payload: { nombre: "largo", valor: "x" } });
    expect(sinTipo.statusCode).toBe(400);
  });

  it("sirve la malla GLB o 404 si no existe", async () => {
    const id = await crear();
    expect((await app.inject({ url: `/api/piezas/${id}/malla` })).statusCode).toBe(404);
    writeFileSync(join(carpeta, "pieza.glb"), "glTF");
    const r = await app.inject({ url: `/api/piezas/${id}/malla` });
    expect(r.headers["content-type"]).toBe("model/gltf-binary");
    expect(r.body).toBe("glTF");
  });

  it("exporta STEP como descarga y rechaza STL con 422", async () => {
    const id = await crear();
    await app.inject({ method: "POST", url: `/api/piezas/${id}/script`, payload: { script: SCRIPT_CAJA } });
    const r = await app.inject({ method: "POST", url: `/api/piezas/${id}/exportar`, payload: { formato: "step" } });
    expect(r.headers["content-disposition"]).toContain('filename="carcasa.step"');
    expect(r.body.startsWith("ISO-10303-21")).toBe(true);
    const stl = await app.inject({ method: "POST", url: `/api/piezas/${id}/exportar`, payload: { formato: "stl" } });
    expect(stl.statusCode).toBe(422);
  });
});

describe("agente y eventos", () => {
  it("el latido del MCP marca al agente como conectado y expira", async () => {
    expect((await app.inject({ url: "/api/agente" })).json()).toEqual({ conectado: false, cliente: null });
    await app.inject({ method: "POST", url: "/interno/agente", payload: { cliente: "Claude Desktop" } });
    expect((await app.inject({ url: "/api/agente" })).json()).toEqual({ conectado: true, cliente: "Claude Desktop" });
    ahora += 60_000;
    expect((await app.inject({ url: "/api/agente" })).json().conectado).toBe(false);
  });

  it("reenvía a los visores lo que publica el MCP y lo que ocurre en la API", async () => {
    const recibidos: string[] = [];
    hub.agregar({ send: (d) => recibidos.push(d), on: () => undefined, readyState: 1 });
    await app.inject({ method: "POST", url: "/interno/eventos", payload: { tipo: "pieza_actualizada", piezaId: "x", motivo: "script" } });
    const id = await crear();
    await app.inject({ method: "POST", url: `/api/piezas/${id}/script`, payload: { script: SCRIPT_CAJA } });
    const tipos = recibidos.map((t) => JSON.parse(t) as { tipo: string; motivo?: string });
    expect(tipos[0]).toMatchObject({ motivo: "script" });
    expect(tipos.map((t) => t.tipo)).toContain("pieza_creada");
    expect(tipos.at(-1)).toMatchObject({ tipo: "pieza_actualizada", motivo: "script" });
  });
});

describe("chat con el agente embebido", () => {
  class AgenteFalso implements AgentePuerto {
    modelo = "modelo-falso";
    ocupado = false;
    cancelado = false;
    envios: string[] = [];
    liberar: () => void = () => undefined;
    constructor(public motor: "listo" | "sin_cli" | "sin_login" = "listo") {}
    async diagnostico(): Promise<Diagnostico> {
      return this.motor === "listo" ? { estado: "listo", version: "2.1.300" } : { estado: this.motor, ayuda: ayudaClaudeCode("win32") };
    }
    estado() {
      return { ocupado: this.ocupado, transcripto: [{ tipo: "usuario" as const, texto: "hola" }] };
    }
    async enviar(_id: string, texto: string, emitir: (e: EventoChat) => void) {
      this.envios.push(texto);
      this.ocupado = true;
      emitir({ tipo: "inicio", texto });
      emitir({ tipo: "texto", delta: "listo" });
      await new Promise<void>((r) => (this.liberar = r));
      this.ocupado = false;
      emitir({ tipo: "fin" });
    }
    cancelar() {
      this.cancelado = true;
      this.liberar();
    }
  }

  let agente: AgenteFalso;
  let chat: FastifyInstance;
  let id: string;
  const recibidos: { tipo: string; piezaId?: string; evento?: { tipo: string } }[] = [];

  async function levantar(motor: "listo" | "sin_cli" | "sin_login" = "listo") {
    agente = new AgenteFalso(motor);
    recibidos.length = 0;
    const h = new HubEventos();
    h.agregar({ send: (d) => recibidos.push(JSON.parse(d)), on: () => undefined, readyState: 1 });
    const r = new RepositorioEnMemoria();
    chat = await crearServidor({
      deps: { kernel: new KernelFalso(() => CASOS_CONTRATO[0]!.respuestaFalsa), repositorio: r, reloj: new RelojFijo() },
      hub: h,
      crearAgente: () => agente,
    });
    id = ((await chat.inject({ method: "POST", url: "/api/piezas", payload: { nombre: "Mesa" } })).json() as { id: string }).id;
  }
  afterEach(() => chat?.close());

  it("informa si el chat está disponible y con qué modelo", async () => {
    await levantar();
    expect((await chat.inject({ url: "/api/chat/estado" })).json()).toEqual({ disponible: true, estado: "listo", modelo: "modelo-falso", version: "2.1.300", ayuda: null });
    // el servidor de los otros tests no tiene agente
    expect((await app.inject({ url: "/api/chat/estado" })).json()).toEqual({ disponible: false, estado: "sin_motor", modelo: null, ayuda: null });
  });

  it("sin Claude Code instalado, el estado trae los comandos para instalarlo y entrar", async () => {
    await levantar("sin_cli");
    const e = (await chat.inject({ url: "/api/chat/estado" })).json();
    expect(e).toMatchObject({ disponible: false, estado: "sin_cli" });
    expect(e.ayuda.instalar[0].comando).toBe("irm https://claude.ai/install.ps1 | iex");
    expect(e.ayuda.login).toBe("claude auth login");
  });

  it("instalado pero sin sesión, el estado es sin_login", async () => {
    await levantar("sin_login");
    expect((await chat.inject({ url: "/api/chat/estado" })).json()).toMatchObject({ disponible: false, estado: "sin_login" });
  });

  it("acepta el mensaje enseguida y manda el avance por el WebSocket", async () => {
    await levantar();
    const r = await chat.inject({ method: "POST", url: `/api/piezas/${id}/chat`, payload: { texto: "  hacé una mesa  " } });
    expect(r.statusCode).toBe(202);
    await new Promise((res) => setTimeout(res, 10));
    expect(agente.envios).toEqual(["hacé una mesa"]);
    const eventos = recibidos.filter((e) => e.tipo === "chat");
    expect(eventos.map((e) => e.evento?.tipo)).toEqual(["inicio", "texto"]);
    expect(eventos[0]!.piezaId).toBe(id);
    agente.liberar();
    await new Promise((res) => setTimeout(res, 10));
    expect(recibidos.filter((e) => e.tipo === "chat").at(-1)!.evento!.tipo).toBe("fin");
  });

  it("rechaza mientras el agente trabaja (409), mensajes vacíos (400) y piezas que no existen (404)", async () => {
    await levantar();
    await chat.inject({ method: "POST", url: `/api/piezas/${id}/chat`, payload: { texto: "uno" } });
    await new Promise((res) => setTimeout(res, 10));
    const ocupado = await chat.inject({ method: "POST", url: `/api/piezas/${id}/chat`, payload: { texto: "dos" } });
    expect(ocupado.statusCode).toBe(409);
    expect(ocupado.json().error.codigo).toBe("OCUPADO");
    expect((await chat.inject({ method: "POST", url: `/api/piezas/${id}/chat`, payload: { texto: "  " } })).statusCode).toBe(400);
    expect((await chat.inject({ method: "POST", url: "/api/piezas/nada/chat", payload: { texto: "x" } })).statusCode).toBe(404);
    agente.liberar();
  });

  it("sin Claude Code devuelve 503 SIN_CLI y no manda nada al agente", async () => {
    await levantar("sin_cli");
    const r = await chat.inject({ method: "POST", url: `/api/piezas/${id}/chat`, payload: { texto: "hola" } });
    expect(r.statusCode).toBe(503);
    expect(r.json().error).toMatchObject({ codigo: "SIN_CLI" });
    expect(r.json().error.mensaje).toContain("Claude Code");
    expect(agente.envios).toEqual([]);
  });

  it("sin sesión iniciada devuelve 503 SIN_LOGIN con el comando", async () => {
    await levantar("sin_login");
    const r = await chat.inject({ method: "POST", url: `/api/piezas/${id}/chat`, payload: { texto: "hola" } });
    expect(r.statusCode).toBe(503);
    expect(r.json().error).toMatchObject({ codigo: "SIN_LOGIN" });
    expect(r.json().error.mensaje).toContain("claude auth login");
  });

  it("sin agente armado el chat responde 503 en vez de fallar", async () => {
    const id2 = ((await app.inject({ method: "POST", url: "/api/piezas", payload: { nombre: "x" } })).json() as { id: string }).id;
    const r = await app.inject({ method: "POST", url: `/api/piezas/${id2}/chat`, payload: { texto: "hola" } });
    expect(r.statusCode).toBe(503);
    expect(r.json().error.codigo).toBe("SIN_CLI");
  });

  it("devuelve la conversación guardada y permite cancelar", async () => {
    await levantar();
    expect((await chat.inject({ url: `/api/piezas/${id}/chat` })).json()).toEqual({
      ocupado: false,
      transcripto: [{ tipo: "usuario", texto: "hola" }],
    });
    await chat.inject({ method: "POST", url: `/api/piezas/${id}/chat`, payload: { texto: "uno" } });
    await chat.inject({ method: "POST", url: `/api/piezas/${id}/chat/cancelar` });
    expect(agente.cancelado).toBe(true);
  });
});
