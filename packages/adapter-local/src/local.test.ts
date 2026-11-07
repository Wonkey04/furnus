import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CASOS_CONTRATO,
  CambiarParametro,
  CrearPieza,
  EjecutarScript,
  EventosEnMemoria,
  IrARevision,
  KernelFalso,
  RelojFijo,
  SCRIPT_CAJA,
  type Dependencias,
} from "@furnus/app";
import { RepositorioLocal } from "./index.js";

let raiz: string;
let repo: RepositorioLocal;
let deps: Dependencias;

beforeEach(async () => {
  raiz = await mkdtemp(join(tmpdir(), "furnus-repo-"));
  repo = new RepositorioLocal(raiz);
  deps = { kernel: KernelFalso.desdeCasos(CASOS_CONTRATO), repositorio: repo, eventos: new EventosEnMemoria(), reloj: new RelojFijo() };
});

describe("RepositorioLocal", () => {
  it("guarda con la estructura de ARCHITECTURE.md", async () => {
    const { id } = await new CrearPieza(deps).ejecutar({ nombre: "Carcasa" });
    await new EjecutarScript(deps).ejecutar({ piezaId: id, script: SCRIPT_CAJA });
    expect((await readdir(join(raiz, id))).sort()).toEqual(["parametros.json", "proyecto.json", "revisiones", "salidas"]);
    expect(await readdir(join(raiz, id, "revisiones"))).toEqual(["0001.py"]);
    expect(await readFile(join(raiz, id, "revisiones", "0001.py"), "utf8")).toBe(SCRIPT_CAJA);
  });

  it("carga lo guardado: revisiones, valores, resultado y actividad", async () => {
    const { id } = await new CrearPieza(deps).ejecutar({ nombre: "Carcasa" });
    await new EjecutarScript(deps).ejecutar({ piezaId: id, script: SCRIPT_CAJA });
    await new CambiarParametro(deps).ejecutar({ piezaId: id, nombre: "largo", valor: 100 });
    const p = (await new RepositorioLocal(raiz).obtener(id))!;
    expect(p.nombre).toBe("Carcasa");
    expect(p.revisiones.map((r) => r.script)).toEqual([SCRIPT_CAJA]);
    expect(p.valores).toEqual({ largo: 100 });
    expect(p.resultado?.medidas?.caja).toEqual([100, 40, 24]);
    expect(p.actividad).toHaveLength(2);
  });

  it("volver a una revisión anterior persiste el puntero sin perder revisiones", async () => {
    const { id } = await new CrearPieza(deps).ejecutar({});
    const ejecutar = new EjecutarScript(deps);
    await ejecutar.ejecutar({ piezaId: id, script: SCRIPT_CAJA });
    await ejecutar.ejecutar({ piezaId: id, script: SCRIPT_CAJA, parametros: { largo: 100 } });
    await new IrARevision(deps).ejecutar({ piezaId: id, destino: "deshacer" });
    const p = (await repo.obtener(id))!;
    expect(p.revisionActual).toBe(1);
    expect(p.revisiones).toHaveLength(2);
  });

  it("lista las piezas y devuelve null si no existe", async () => {
    expect(await repo.listar()).toEqual([]);
    const a = await new CrearPieza(deps).ejecutar({ nombre: "A" });
    await new CrearPieza(deps).ejecutar({ nombre: "B" });
    expect((await repo.listar()).map((p) => p.nombre).sort()).toEqual(["A", "B"]);
    expect(await repo.obtener("noexiste")).toBeNull();
    expect((await repo.obtener(a.id))?.nombre).toBe("A");
  });

  it("rechaza ids que intentan salirse de la carpeta", async () => {
    await expect(repo.obtener("../afuera")).rejects.toThrow(/inválido/);
  });

  it("crea la carpeta de salidas", async () => {
    const { id } = await new CrearPieza(deps).ejecutar({});
    const ruta = await repo.rutaSalidas(id);
    expect(ruta).toBe(join(raiz, id, "salidas"));
    expect(await readdir(ruta)).toEqual([]);
  });
});
