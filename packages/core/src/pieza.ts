import { ErrorDeDominio } from "./errores.js";
import type { Actividad, Herramienta, OrigenCambio, Pieza, ResultadoEjecucion, Revision } from "./tipos.js";

const MAX_ACTIVIDAD = 200;

export function crearPieza(id: string, nombre: string, ahora: string): Pieza {
  return {
    id,
    nombre,
    creadaEn: ahora,
    editadaEn: ahora,
    revisiones: [],
    revisionActual: 0,
    valores: {},
    resultado: null,
    actividad: [],
  };
}

export function revisionActiva(pieza: Pieza): Revision | null {
  return pieza.revisiones.find((r) => r.numero === pieza.revisionActual) ?? null;
}

export function scriptActual(pieza: Pieza): string {
  const r = revisionActiva(pieza);
  if (!r) throw new ErrorDeDominio("SIN_SCRIPT", "La pieza todavía no tiene ningún script. Ejecutá uno con ejecutar_script.");
  return r.script;
}

export function agregarRevision(pieza: Pieza, script: string, origen: OrigenCambio, ahora: string): Pieza {
  const numero = (pieza.revisiones.at(-1)?.numero ?? 0) + 1;
  const revision: Revision = { numero, script, origen, creadaEn: ahora };
  return { ...pieza, revisiones: [...pieza.revisiones, revision], revisionActual: numero, editadaEn: ahora };
}

export function puedeDeshacer(pieza: Pieza): boolean {
  return pieza.revisiones.some((r) => r.numero < pieza.revisionActual);
}

export function puedeRehacer(pieza: Pieza): boolean {
  return pieza.revisiones.some((r) => r.numero > pieza.revisionActual);
}

export function irARevision(pieza: Pieza, numero: number, ahora: string): Pieza {
  if (!pieza.revisiones.some((r) => r.numero === numero)) {
    throw new ErrorDeDominio("SIN_SCRIPT", `La revisión ${numero} no existe.`);
  }
  return { ...pieza, revisionActual: numero, editadaEn: ahora };
}

export function revisionAnterior(pieza: Pieza): number | null {
  const previas = pieza.revisiones.filter((r) => r.numero < pieza.revisionActual);
  return previas.length ? Math.max(...previas.map((r) => r.numero)) : null;
}

export function revisionSiguiente(pieza: Pieza): number | null {
  const luego = pieza.revisiones.filter((r) => r.numero > pieza.revisionActual);
  return luego.length ? Math.min(...luego.map((r) => r.numero)) : null;
}

export function registrarActividad(
  pieza: Pieza,
  datos: { herramienta: Herramienta; origen: OrigenCambio; estado: "ok" | "error"; detalle: string },
  ahora: string,
): Pieza {
  const id = (pieza.actividad.at(-1)?.id ?? 0) + 1;
  const item: Actividad = { id, en: ahora, ...datos };
  return { ...pieza, actividad: [...pieza.actividad, item].slice(-MAX_ACTIVIDAD) };
}

export function conResultado(pieza: Pieza, resultado: ResultadoEjecucion): Pieza {
  return { ...pieza, resultado, editadaEn: resultado.ejecutadoEn };
}

/** La geometría tiene que ser válida para exportar (BRAND: honestidad geométrica). */
export function puedeExportar(pieza: Pieza): { ok: true } | { ok: false; motivos: string[] } {
  const r = pieza.resultado;
  if (!r || !r.ok) return { ok: false, motivos: ["La pieza todavía no se ejecutó sin errores."] };
  if (!r.valida) return { ok: false, motivos: r.motivos.length ? r.motivos : ["La geometría no es válida."] };
  return { ok: true };
}
