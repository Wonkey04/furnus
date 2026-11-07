import { ErrorDeDominio } from "./errores.js";
import type { Parametro } from "./tipos.js";

/** Devuelve el mensaje de error si `valor` no cumple el rango declarado, o null si es válido. */
export function motivoFueraDeRango(p: Parametro, valor: number): string | null {
  if (!Number.isFinite(valor)) return `«${p.nombre}» tiene que ser un número.`;
  const bajo = p.min !== null && valor < p.min;
  const alto = p.max !== null && valor > p.max;
  if (!bajo && !alto) return null;
  const rango =
    p.min !== null && p.max !== null
      ? `entre ${p.min} y ${p.max} ${p.unidad}`
      : p.min !== null
        ? `al menos ${p.min} ${p.unidad}`
        : `como máximo ${p.max} ${p.unidad}`;
  return `«${p.nombre}» vale ${valor} ${p.unidad} y tiene que estar ${rango}.`;
}

/** Regla de dominio: un cambio de parámetro solo vale si el parámetro existe y está en rango. */
export function validarCambio(declarados: Parametro[], nombre: string, valor: number): Parametro {
  const p = declarados.find((d) => d.nombre === nombre);
  if (!p) {
    const nombres = declarados.map((d) => d.nombre).join(", ") || "ninguno";
    throw new ErrorDeDominio("PARAMETRO_DESCONOCIDO", `El parámetro «${nombre}» no existe. Declarados: ${nombres}.`);
  }
  const motivo = motivoFueraDeRango(p, valor);
  if (motivo) throw new ErrorDeDominio("PARAMETRO_FUERA_DE_RANGO", motivo);
  return p;
}

/** Descarta valores guardados de parámetros que el script nuevo ya no declara. */
export function valoresVigentes(valores: Record<string, number>, declarados: Parametro[]): Record<string, number> {
  const salida: Record<string, number> = {};
  for (const p of declarados) if (p.nombre in valores) salida[p.nombre] = valores[p.nombre] as number;
  return salida;
}
