import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

const PNG_MINIMO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let cliente: Client;
let repo: RepositorioEnMemoria;
let eventos: EventosEnMemoria;

beforeEach(async () => {
  repo = new RepositorioEnMemoria();
  eventos = new EventosEnMemoria();
  const conStep = new KernelFalso((p) => {
    const caso = CASOS_CONTRATO.find((c) => c.script === p.script && JSON.stringify(c.parametros ?? {}) === JSON.stringify(p.parametros));
    const base = (caso ?? CASOS_CONTRATO[0]!).respuestaFalsa;
    if (p.salidas.includes("render")) {
      const carpeta = mkdtempSync(join(tmpdir(), "furnus-mcp-"));
      const render = (p.vistas ?? []).map((vista) => {
        const ruta = join(carpeta, `${vista}.png`);
        writeFileSync(ruta, PNG_MINIMO);
        return { vista, ruta };
      });
      return { ...base, render };
    }
    return p.salidas.includes("step") ? { ...base, step: { formato: "step", ruta: "/tmp/p.step" } } : base;
  });
  const servidor = crearServidorMcp({ kernel: conStep, repositorio: repo, eventos, reloj: new RelojFijo() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  cliente = new Client({ name: "prueba", version: "1" });
  await Promise.all([servidor.connect(a), cliente.connect(b)]);
});

async function llamar(name: string, args: Record<string, unknown>) {
  const r = (await cliente.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { json: JSON.parse(r.content[0]!.text) as Record<string, any>, isError: r.isError === true };
}

describe("contrato del MCP", () => {
  it("expone las 5 tools (las 4 originales + cambiar_parametros, decisión 27)", async () => {
    const { tools } = await cliente.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["cambiar_parametros", "ejecutar_script", "exportar", "medir", "renderizar"]);
  });

  it("la descripción de ejecutar_script dice cómo tratar pedidos sin medidas e imposibles", async () => {
    const t = (await cliente.listTools()).tools.find((x) => x.name === "ejecutar_script")!;
    expect(t.description).toContain("listá las suposiciones");
    expect(t.description).toContain("cambia la FORMA");
    expect(t.description).toContain("máximo posible");
  });

  it("la descripción de ejecutar_script cubre agujeros pasantes/ciegos y manda a cambiar_parametros", async () => {
    const t = (await cliente.listTools()).tools.find((x) => x.name === "ejecutar_script")!;
    expect(t.description).toContain("pasante o ciego");
    expect(t.description).toContain('Locations(sel.caras(pieza, "superior")[0].center())');
    expect(t.description).toContain("usá cambiar_parametros");
  });

  it("toda respuesta de ejecutar_script abre con un resumen de una línea", async () => {
    const bien = await llamar("ejecutar_script", { script: SCRIPT_CAJA, pieza: "nueva" });
    expect(bien.json.resumen).toMatch(/^OK, revisión 1:/);
    expect(Object.keys(bien.json)[0]).toBe("resumen");
    const fallido = CASOS_CONTRATO.find((c) => c.espera.errorTipo === "ScriptProhibido")!;
    const mal = await llamar("ejecutar_script", { script: fallido.script, pieza: "nueva" });
    expect(mal.json.resumen).toMatch(/^Falló/);
  });

  it("cambiar_parametros con id explícito cambia solo el parámetro y crea una revisión nueva", async () => {
    const a = await llamar("ejecutar_script", { script: SCRIPT_CAJA });
    const id = a.json.pieza.id as string;
    const r = await llamar("cambiar_parametros", { pieza: id, valores: { largo: 100 } });
    expect(r.isError).toBe(false);
    expect(r.json).toMatchObject({ ok: true, revision: 2, medidas: { caja: [100, 40, 24] } });
    const p = (await repo.obtener(id))!;
    expect(p.revisiones).toHaveLength(2);
    expect(p.revisiones[1]!.script).toBe(p.revisiones[0]!.script);
    expect(p.revisiones[1]!.valores).toMatchObject({ largo: 100 });
    expect(p.valores).toMatchObject({ largo: 100 });
  });

  it("cambiar_parametros explica el rango y los nombres declarados, sin tocar el kernel", async () => {
    const a = await llamar("ejecutar_script", { script: SCRIPT_CAJA });
    const id = a.json.pieza.id as string;
    const fuera = await llamar("cambiar_parametros", { pieza: id, valores: { largo: 500 } });
    expect(fuera.isError).toBe(true);
    expect(fuera.json.error.mensaje).toContain("entre 10 y 200");
    const mal = await llamar("cambiar_parametros", { pieza: id, valores: { espesor: 30 } });
    expect(mal.isError).toBe(true);
    expect(mal.json.error.mensaje).toContain("Declarados: largo, ancho");
    expect((await repo.obtener(id))!.revisiones).toHaveLength(1);
  });

  it("un script que falla en una pieza nueva no deja una pieza huérfana", async () => {
    const fallido = CASOS_CONTRATO.find((c) => c.espera.errorTipo === "ScriptProhibido")!;
    const r = await llamar("ejecutar_script", { script: fallido.script, pieza: "nueva" });
    expect(r.isError).toBe(true);
    expect(r.json.pieza).toBeNull();
    expect(repo.piezas.size).toBe(0);
    expect(eventos.eventos).toEqual([]);
  });

  it("medir y exportar sin piezas no crean una pieza vacía", async () => {
    const m = await llamar("medir", { consulta: "caja" });
    expect(m.isError).toBe(true);
    expect(m.json.error.codigo).toBe("PIEZA_NO_ENCONTRADA");
    expect(repo.piezas.size).toBe(0);
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

  it("renderizar devuelve una imagen por vista pedida, más el resumen", async () => {
    await llamar("ejecutar_script", { script: SCRIPT_CAJA });
    const r = (await cliente.callTool({ name: "renderizar", arguments: { vistas: ["iso", "frente"] } })) as {
      content: { type: string; text?: string; data?: string; mimeType?: string }[];
      isError?: boolean;
    };
    expect(r.isError).toBeFalsy();
    expect(r.content.map((c) => c.type)).toEqual(["text", "image", "image"]);
    expect(JSON.parse(r.content[0]!.text!)).toMatchObject({ ok: true, vistas: ["iso", "frente"] });
    expect(r.content[1]).toMatchObject({ mimeType: "image/png" });
    expect(Buffer.from(r.content[1]!.data!, "base64").subarray(1, 4).toString()).toBe("PNG");
  });

  it("renderizar sin vistas manda las cuatro y sin piezas no crea ninguna", async () => {
    const sin = await llamar("renderizar", {});
    expect(sin.isError).toBe(true);
    expect(sin.json.error.codigo).toBe("PIEZA_NO_ENCONTRADA");
    expect(repo.piezas.size).toBe(0);
    await llamar("ejecutar_script", { script: SCRIPT_CAJA });
    const r = (await cliente.callTool({ name: "renderizar", arguments: {} })) as { content: { type: string }[] };
    expect(r.content.filter((c) => c.type === "image")).toHaveLength(4);
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
