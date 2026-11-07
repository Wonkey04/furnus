import { describe, expect, it } from "vitest";
import {
  ErrorDeDominio,
  agregarRevision,
  conResultado,
  crearPieza,
  puedeDeshacer,
  puedeExportar,
  puedeRehacer,
  revisionAnterior,
  revisionSiguiente,
  irARevision,
  validarCambio,
  valoresVigentes,
  type Parametro,
  type ResultadoEjecucion,
} from "./index.js";

const largo: Parametro = { nombre: "largo", valor: 60, min: 10, max: 200, unidad: "mm" };
const T = "2026-01-01T00:00:00.000Z";

function resultado(extra: Partial<ResultadoEjecucion> = {}): ResultadoEjecucion {
  return { ok: true, error: null, medidas: null, valida: true, motivos: [], parametros: [largo], revision: 1, ejecutadoEn: T, ...extra };
}

describe("parámetros", () => {
  it("acepta un valor dentro del rango", () => {
    expect(validarCambio([largo], "largo", 100)).toBe(largo);
  });
  it("rechaza fuera de rango con el rango en el mensaje", () => {
    expect(() => validarCambio([largo], "largo", 500)).toThrowError(/entre 10 y 200 mm/);
  });
  it("rechaza un parámetro que no existe y lista los declarados", () => {
    try {
      validarCambio([largo], "alto", 5);
      expect.unreachable();
    } catch (e) {
      expect((e as ErrorDeDominio).codigo).toBe("PARAMETRO_DESCONOCIDO");
      expect((e as Error).message).toContain("largo");
    }
  });
  it("rechaza NaN", () => {
    expect(() => validarCambio([largo], "largo", Number.NaN)).toThrow();
  });
  it("descarta valores de parámetros que ya no existen", () => {
    expect(valoresVigentes({ largo: 80, viejo: 1 }, [largo])).toEqual({ largo: 80 });
  });
});

describe("revisiones", () => {
  it("agrega revisiones numeradas y mueve el puntero", () => {
    let p = crearPieza("a", "Caja", T);
    p = agregarRevision(p, "s1", "agente", T);
    p = agregarRevision(p, "s2", "persona", T);
    expect(p.revisiones.map((r) => r.numero)).toEqual([1, 2]);
    expect(p.revisionActual).toBe(2);
  });
  it("deshacer y rehacer se mueven por el historial sin borrarlo", () => {
    let p = crearPieza("a", "Caja", T);
    p = agregarRevision(agregarRevision(p, "s1", "agente", T), "s2", "agente", T);
    expect(puedeDeshacer(p)).toBe(true);
    expect(puedeRehacer(p)).toBe(false);
    p = irARevision(p, revisionAnterior(p)!, T);
    expect(p.revisionActual).toBe(1);
    expect(puedeRehacer(p)).toBe(true);
    expect(revisionSiguiente(p)).toBe(2);
    expect(p.revisiones).toHaveLength(2);
  });
  it("una revisión nueva después de deshacer queda al final", () => {
    let p = crearPieza("a", "Caja", T);
    p = agregarRevision(agregarRevision(p, "s1", "agente", T), "s2", "agente", T);
    p = irARevision(p, 1, T);
    p = agregarRevision(p, "s3", "agente", T);
    expect(p.revisionActual).toBe(3);
    expect(puedeRehacer(p)).toBe(false);
  });
  it("irARevision falla si no existe", () => {
    expect(() => irARevision(crearPieza("a", "x", T), 9, T)).toThrow(ErrorDeDominio);
  });
});

describe("exportar", () => {
  it("no deja exportar sin ejecución", () => {
    expect(puedeExportar(crearPieza("a", "x", T)).ok).toBe(false);
  });
  it("no deja exportar una geometría inválida y devuelve los motivos", () => {
    const p = conResultado(crearPieza("a", "x", T), resultado({ valida: false, motivos: ["Dos sólidos."] }));
    const r = puedeExportar(p);
    expect(r).toEqual({ ok: false, motivos: ["Dos sólidos."] });
  });
  it("deja exportar una pieza válida", () => {
    expect(puedeExportar(conResultado(crearPieza("a", "x", T), resultado())).ok).toBe(true);
  });
});
