import { beforeEach, describe, expect, it } from "vitest";
import { ErrorDeDominio } from "@furnus/core";
import {
  CASOS_CONTRATO,
  CambiarParametro,
  CambiarParametros,
  ConsultarEstado,
  CrearPieza,
  EjecutarScript,
  EventosEnMemoria,
  Exportar,
  IrARevision,
  KernelFalso,
  MedirPieza,
  RelojFijo,
  Renderizar,
  RepositorioEnMemoria,
  SCRIPT_CAJA,
  verificarRespuesta,
  type Dependencias,
} from "./index.js";

let deps: Dependencias;
let kernel: KernelFalso;
let repo: RepositorioEnMemoria;
let eventos: EventosEnMemoria;
let piezaId: string;

const [CAJA, CAJA_100, FUERA_DE_RANGO, , , INVALIDA] = CASOS_CONTRATO;

beforeEach(async () => {
  kernel = KernelFalso.desdeCasos(CASOS_CONTRATO);
  repo = new RepositorioEnMemoria();
  eventos = new EventosEnMemoria();
  deps = { kernel, repositorio: repo, eventos, reloj: new RelojFijo() };
  piezaId = (await new CrearPieza(deps).ejecutar({ nombre: "Carcasa de prueba" })).id;
});

describe("batería de contrato contra el kernel falso", () => {
  for (const caso of CASOS_CONTRATO) {
    it(caso.nombre, async () => {
      const r = await KernelFalso.desdeCasos(CASOS_CONTRATO).ejecutar({
        script: caso.script,
        parametros: caso.parametros ?? {},
        salidas: ["malla", "medidas"],
      });
      expect(verificarRespuesta(caso, r)).toEqual([]);
    });
  }
});

describe("EjecutarScript", () => {
  it("guarda una revisión, el resultado y avisa", async () => {
    const r = await new EjecutarScript(deps).ejecutar({ piezaId, script: SCRIPT_CAJA });
    expect(r).toMatchObject({ ok: true, revision: 1, valida: true });
    expect(r.medidas?.caja).toEqual([60, 40, 24]);
    const p = (await repo.obtener(piezaId))!;
    expect(p.revisiones).toHaveLength(1);
    expect(p.resultado?.ok).toBe(true);
    expect(p.actividad.at(-1)).toMatchObject({ herramienta: "ejecutar_script", estado: "ok", origen: "agente" });
    expect(eventos.eventos.at(-1)).toEqual({ tipo: "pieza_actualizada", piezaId, motivo: "script" });
  });

  it("un script que falla no crea revisión ni tapa la pieza anterior", async () => {
    const uc = new EjecutarScript(deps);
    await uc.ejecutar({ piezaId, script: SCRIPT_CAJA });
    const r = await uc.ejecutar({ piezaId, script: SCRIPT_CAJA, parametros: { largo: 500 } });
    expect(r.ok).toBe(false);
    expect(r.revision).toBeNull();
    expect(r.error?.mensaje).toContain("entre 10 y 200");
    const p = (await repo.obtener(piezaId))!;
    expect(p.revisiones).toHaveLength(1);
    expect(p.resultado?.ok).toBe(true);
    expect(p.valores).toEqual({});
    expect(p.actividad.at(-1)).toMatchObject({ estado: "error" });
    expect(eventos.eventos.at(-1)).toMatchObject({ motivo: "error" });
  });

  it("guarda una pieza inválida pero la marca como no exportable", async () => {
    const r = await new EjecutarScript(deps).ejecutar({ piezaId, script: INVALIDA!.script });
    expect(r).toMatchObject({ ok: true, valida: false });
    const estado = await new ConsultarEstado(deps).ejecutar({ piezaId });
    expect(estado.exportable.ok).toBe(false);
  });

  it("falla con un mensaje claro si el kernel no responde", async () => {
    const roto = new KernelFalso(() => {
      throw new Error("ECONNREFUSED");
    });
    const uc = new EjecutarScript({ ...deps, kernel: roto });
    await expect(uc.ejecutar({ piezaId, script: "x" })).rejects.toMatchObject({ codigo: "KERNEL_NO_DISPONIBLE" });
  });

  it("falla si la pieza no existe", async () => {
    await expect(new EjecutarScript(deps).ejecutar({ piezaId: "nada", script: "x" })).rejects.toMatchObject({
      codigo: "PIEZA_NO_ENCONTRADA",
    });
  });
});

describe("CambiarParametro", () => {
  beforeEach(async () => {
    await new EjecutarScript(deps).ejecutar({ piezaId, script: SCRIPT_CAJA });
    kernel.llamadas.length = 0;
  });

  it("vuelve a correr el script con el valor nuevo, sin crear revisión", async () => {
    const r = await new CambiarParametro(deps).ejecutar({ piezaId, nombre: "largo", valor: 100 });
    expect(r.medidas?.caja).toEqual(CAJA_100!.espera.caja);
    expect(kernel.llamadas[0]?.parametros).toEqual({ largo: 100 });
    const p = (await repo.obtener(piezaId))!;
    expect(p.valores).toEqual({ largo: 100 });
    expect(p.revisiones).toHaveLength(1);
    expect(p.actividad.at(-1)).toMatchObject({ herramienta: "cambiar_parametro", origen: "persona" });
  });

  it("rechaza fuera de rango sin tocar el kernel", async () => {
    await expect(new CambiarParametro(deps).ejecutar({ piezaId, nombre: "largo", valor: 500 })).rejects.toBeInstanceOf(
      ErrorDeDominio,
    );
    expect(kernel.llamadas).toHaveLength(0);
  });

  it("si el kernel falla con el valor, deja los valores como estaban", async () => {
    const uc = new CambiarParametro({
      ...deps,
      kernel: new KernelFalso(() => FUERA_DE_RANGO!.respuestaFalsa),
    });
    const r = await uc.ejecutar({ piezaId, nombre: "largo", valor: 150 });
    expect(r.ok).toBe(false);
    expect((await repo.obtener(piezaId))!.valores).toEqual({});
  });
});

describe("IrARevision", () => {
  it("deshacer vuelve a correr el script anterior y rehacer avanza", async () => {
    const uc = new EjecutarScript(deps);
    await uc.ejecutar({ piezaId, script: SCRIPT_CAJA });
    await uc.ejecutar({ piezaId, script: SCRIPT_CAJA, parametros: { largo: 100 } });
    const ir = new IrARevision(deps);
    expect((await ir.ejecutar({ piezaId, destino: "deshacer" })).revision).toBe(1);
    let estado = await new ConsultarEstado(deps).ejecutar({ piezaId });
    expect(estado).toMatchObject({ puedeDeshacer: false, puedeRehacer: true });
    expect((await ir.ejecutar({ piezaId, destino: "rehacer" })).revision).toBe(2);
    estado = await new ConsultarEstado(deps).ejecutar({ piezaId });
    expect(estado.pieza.revisiones).toHaveLength(2);
  });

  it("no hay nada para deshacer en la primera revisión", async () => {
    await new EjecutarScript(deps).ejecutar({ piezaId, script: SCRIPT_CAJA });
    await expect(new IrARevision(deps).ejecutar({ piezaId, destino: "deshacer" })).rejects.toBeInstanceOf(ErrorDeDominio);
  });
});

describe("Exportar y Medir", () => {
  it("no exporta una pieza inválida", async () => {
    await new EjecutarScript(deps).ejecutar({ piezaId, script: INVALIDA!.script });
    await expect(new Exportar(deps).ejecutar({ piezaId, formato: "step" })).rejects.toMatchObject({ codigo: "PIEZA_INVALIDA" });
  });

  it("STL y 3MF todavía no están disponibles", async () => {
    await new EjecutarScript(deps).ejecutar({ piezaId, script: SCRIPT_CAJA });
    await expect(new Exportar(deps).ejecutar({ piezaId, formato: "stl" })).rejects.toMatchObject({
      codigo: "FORMATO_NO_DISPONIBLE",
    });
  });

  it("exporta STEP con un nombre de archivo seguro", async () => {
    await new EjecutarScript(deps).ejecutar({ piezaId, script: SCRIPT_CAJA });
    const conStep = new KernelFalso(() => ({
      ...CAJA!.respuestaFalsa,
      step: { formato: "step", ruta: "/tmp/pieza.step" },
    }));
    const r = await new Exportar({ ...deps, kernel: conStep }).ejecutar({ piezaId, formato: "step", unidad: "in" });
    expect(r).toMatchObject({ ruta: "/tmp/pieza.step", nombreArchivo: "carcasa-de-prueba.step", unidad: "in" });
    expect(conStep.llamadas[0]).toMatchObject({ salidas: ["step"], unidad: "in" });
  });

  it("mide caja, volumen y área; rechaza consultas que no existen todavía", async () => {
    await new EjecutarScript(deps).ejecutar({ piezaId, script: SCRIPT_CAJA });
    const medir = new MedirPieza(deps);
    expect((await medir.ejecutar({ piezaId, consulta: "caja" })).valor).toEqual([60, 40, 24]);
    expect((await medir.ejecutar({ piezaId, consulta: "volumen" })).unidad).toBe("mm³");
    await expect(medir.ejecutar({ piezaId, consulta: "espesor_minimo" })).rejects.toMatchObject({
      codigo: "CONSULTA_NO_DISPONIBLE",
    });
  });
});

describe("Renderizar", () => {
  const conRender = () =>
    new KernelFalso((p) =>
      p.salidas.includes("render")
        ? { ...CAJA!.respuestaFalsa, render: (p.vistas ?? []).map((v) => ({ vista: v, ruta: `memoria/${v}.png` })) }
        : CAJA!.respuestaFalsa,
    );

  it("pide las vistas al kernel con el script y los valores vigentes, y registra la actividad", async () => {
    const k = conRender();
    const d = { ...deps, kernel: k };
    await new EjecutarScript(d).ejecutar({ piezaId, script: SCRIPT_CAJA });
    const r = await new Renderizar(d).ejecutar({ piezaId, vistas: ["iso", "arriba", "iso"] });
    expect(r.vistas.map((v) => v.vista)).toEqual(["iso", "arriba"]);
    const pedido = k.llamadas.at(-1)!;
    expect(pedido).toMatchObject({ salidas: ["render"], vistas: ["iso", "arriba"], script: SCRIPT_CAJA });
    expect(pedido.directorioSalida).toContain("/render");
    expect((await repo.obtener(piezaId))!.actividad.at(-1)).toMatchObject({ herramienta: "renderizar", estado: "ok" });
  });

  it("sin vistas manda las cuatro, y sin script explica qué falta", async () => {
    const d = { ...deps, kernel: conRender() };
    await expect(new Renderizar(d).ejecutar({ piezaId })).rejects.toMatchObject({ codigo: "SIN_SCRIPT" });
    await new EjecutarScript(d).ejecutar({ piezaId, script: SCRIPT_CAJA });
    expect((await new Renderizar(d).ejecutar({ piezaId })).vistas).toHaveLength(4);
  });
});

describe("CambiarParametros", () => {
  it("crea una revisión con el mismo script y los valores, y deshacer los restaura", async () => {
    await new EjecutarScript(deps).ejecutar({ piezaId, script: SCRIPT_CAJA });
    const r = await new CambiarParametros(deps).ejecutar({ piezaId, valores: { largo: 100 } });
    expect(r).toMatchObject({ ok: true, revision: 2 });
    let p = (await repo.obtener(piezaId))!;
    expect(p.revisiones.map((x) => x.valores)).toEqual([undefined, { largo: 100 }]);
    await new IrARevision(deps).ejecutar({ piezaId, destino: "deshacer" });
    p = (await repo.obtener(piezaId))!;
    expect(p.revisionActual).toBe(1);
  });

  it("junta todos los problemas de validación en un solo error", async () => {
    await new EjecutarScript(deps).ejecutar({ piezaId, script: SCRIPT_CAJA });
    await expect(
      new CambiarParametros(deps).ejecutar({ piezaId, valores: { largo: 500, espesor: 3 } }),
    ).rejects.toMatchObject({ message: expect.stringContaining("entre 10 y 200") });
    await expect(
      new CambiarParametros(deps).ejecutar({ piezaId, valores: { largo: 500, espesor: 3 } }),
    ).rejects.toMatchObject({ message: expect.stringContaining("«espesor» no existe") });
  });
});
