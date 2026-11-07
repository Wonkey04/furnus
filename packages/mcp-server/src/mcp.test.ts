import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CASOS_CONTRATO,
  EventosEnMemoria,
  KernelFalso,
  RelojFijo,
  RepositorioEnMemoria,
  SCRIPT_CAJA,
} from "@furnus/app";
import { crearServidorMcp } from "./herramientas.js";

let cliente: Client;
let repo: RepositorioEnMemoria;
let eventos: EventosEnMemoria;

beforeEach(async () => {
  repo = new RepositorioEnMemoria();
  eventos = new EventosEnMemoria();
  const conStep = new KernelFalso((p) => {
    const caso = CASOS_CONTRATO.find((c) => c.script === p.script && JSON.stringify(c.parametros ?? {}) === JSON.stringify(p.parametros));
    const base = (caso ?? CASOS_CONTRATO[0]!).respuestaFalsa;
    return p.salidas.includes("step") ? { ...base, step: { formato: "step", ruta: "/tmp/p.step" } } : base;
  });
  const servidor = crearServidorMcp({ kernel: conStep, repositorio: repo, eventos, reloj: new RelojFijo() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  cliente = new Client({ name: "prueba", version: "1" });
  await Promise.all([servidor.connect(a), cliente.connect(b)]);
});

async function llamar(name: string, args: Record<string, unknown>) {
  const r = (await cliente.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
  return { json: JSON.parse(r.content[0]!.text) as Record<string, any>, isError: r.isError === true };
}

describe("contrato del MCP", () => {
  it("expone exactamente las 4 tools", async () => {
    const { tools } = await cliente.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["ejecutar_script", "exportar", "medir", "renderizar"]);
  });

  it("la descripción de ejecutar_script incluye reglas y un ejemplo de script", async () => {
    const t = (await cliente.listTools()).tools.find((x) => x.name === "ejecutar_script")!;
    expect(t.description).toContain("resultado = pieza.part");
    expect(t.description).toContain('param("largo"');
    expect(t.description).toContain("sel.aristas");
  });

  it("ejecutar_script devuelve el feedback que cierra el bucle", async () => {
    const { json, isError } = await llamar("ejecutar_script", { script: SCRIPT_CAJA });
    expect(isError).toBe(false);
    expect(json).toMatchObject({
      ok: true,
      revision: 1,
      valida: true,
      motivos: [],
      error: null,
      medidas: { caja: [60, 40, 24] },
    });
    expect(json.parametros.map((p: { nombre: string }) => p.nombre)).toEqual(["largo", "ancho"]);
    expect(json.pieza.id).toBeTruthy();
  });

  it("ejecutar_script con error devuelve isError y el traceback, y no crea revisión", async () => {
    const r1 = await llamar("ejecutar_script", { script: SCRIPT_CAJA });
    const { json, isError } = await llamar("ejecutar_script", { script: SCRIPT_CAJA, parametros: { largo: 500 } });
    expect(isError).toBe(true);
    expect(json).toMatchObject({ ok: false, revision: null });
    expect(json.error.mensaje).toContain("entre 10 y 200");
    const p = (await repo.obtener(r1.json.pieza.id))!;
    expect(p.revisiones).toHaveLength(1);
  });

  it("sin id usa la última pieza; con «nueva» crea otra", async () => {
    const a = await llamar("ejecutar_script", { script: SCRIPT_CAJA });
    const b = await llamar("ejecutar_script", { script: SCRIPT_CAJA });
    expect(b.json.pieza.id).toBe(a.json.pieza.id);
    expect(b.json.revision).toBe(2);
    const c = await llamar("ejecutar_script", { script: SCRIPT_CAJA, pieza: "nueva", nombre: "Soporte" });
    expect(c.json.pieza.id).not.toBe(a.json.pieza.id);
    expect(c.json.pieza.nombre).toBe("Soporte");
  });

  it("medir devuelve valor con unidad y rechaza consultas inexistentes", async () => {
    await llamar("ejecutar_script", { script: SCRIPT_CAJA });
    const ok = await llamar("medir", { consulta: "volumen" });
    expect(ok.json).toMatchObject({ consulta: "volumen", valor: 57000, unidad: "mm³" });
    const mal = await cliente.callTool({ name: "medir", arguments: { consulta: "espesor_minimo" } });
    expect(mal.isError).toBe(true);
  });

  it("renderizar avisa honestamente que todavía no existe", async () => {
    const { json, isError } = await llamar("renderizar", { vistas: ["iso"] });
    expect(isError).toBe(true);
    expect(json.error.codigo).toBe("NO_DISPONIBLE");
  });

  it("exportar devuelve la ruta del STEP; con pieza inválida devuelve el motivo", async () => {
    await llamar("ejecutar_script", { script: SCRIPT_CAJA });
    const ok = await llamar("exportar", { formato: "step" });
    expect(ok.json).toMatchObject({ ok: true, formato: "step", ruta: "/tmp/p.step" });

    await llamar("ejecutar_script", { script: CASOS_CONTRATO[5]!.script, pieza: "nueva" });
    const mal = await llamar("exportar", { formato: "step" });
    expect(mal.isError).toBe(true);
    expect(mal.json.error.codigo).toBe("PIEZA_INVALIDA");
    expect(mal.json.error.mensaje).toContain("sólidos separados");
  });

  it("avisa a los visores cada vez que se ejecuta un script", async () => {
    await llamar("ejecutar_script", { script: SCRIPT_CAJA });
    expect(eventos.eventos.map((e) => e.tipo)).toEqual(["pieza_creada", "pieza_actualizada"]);
  });
});
