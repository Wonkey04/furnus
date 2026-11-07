import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CASOS_CONTRATO, SCRIPT_CAJA, verificarRespuesta } from "@furnus/app";
import { KernelHttp } from "./index.js";

// La misma batería que corre contra el KernelFalso en packages/app, ahora contra el kernel real.
const kernel = new KernelHttp({ url: "http://127.0.0.1:4121", autoIniciar: true });

beforeAll(async () => {
  await kernel.ejecutar({ script: "from build123d import *\nresultado = Box(1,1,1)", parametros: {}, salidas: ["medidas"] });
}, 60_000);

afterAll(() => kernel.detener());

describe("contrato dominio ↔ kernel real", () => {
  for (const caso of CASOS_CONTRATO) {
    it(caso.nombre, async () => {
      const r = await kernel.ejecutar({
        script: caso.script,
        parametros: caso.parametros ?? {},
        salidas: ["malla", "medidas"],
        directorioSalida: mkdtempSync(join(tmpdir(), "furnus-contrato-")),
      });
      expect(verificarRespuesta(caso, r)).toEqual([]);
    }, 60_000);
  }

  it("exporta un STEP que empieza como ISO-10303-21", async () => {
    const r = await kernel.ejecutar({
      script: SCRIPT_CAJA,
      parametros: {},
      salidas: ["step"],
      directorioSalida: mkdtempSync(join(tmpdir(), "furnus-step-")),
    });
    expect(r.ok).toBe(true);
    expect(readFileSync(r.step!.ruta, "utf8").startsWith("ISO-10303-21")).toBe(true);
  }, 60_000);
});
