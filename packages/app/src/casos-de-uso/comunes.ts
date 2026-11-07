import { ErrorDeDominio, type Pieza, type ResultadoEjecucion } from "@furnus/core";
import type { Dependencias, PedidoKernel, RespuestaKernel } from "../puertos/index.js";

export async function cargarPieza(deps: Dependencias, id: string): Promise<Pieza> {
  const pieza = await deps.repositorio.obtener(id);
  if (!pieza) throw new ErrorDeDominio("PIEZA_NO_ENCONTRADA", `No existe la pieza «${id}».`);
  return pieza;
}

export async function llamarKernel(deps: Dependencias, pedido: PedidoKernel): Promise<RespuestaKernel> {
  try {
    return await deps.kernel.ejecutar(pedido);
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    throw new ErrorDeDominio(
      "KERNEL_NO_DISPONIBLE",
      `No se pudo hablar con el kernel. Levantalo con «pnpm kernel». Detalle: ${detalle}`,
    );
  }
}

export function aResultado(r: RespuestaKernel, revision: number, ejecutadoEn: string): ResultadoEjecucion {
  return {
    ok: r.ok,
    error: r.error,
    medidas: r.medidas,
    valida: r.valida,
    motivos: r.motivos,
    parametros: r.parametros,
    revision,
    ejecutadoEn,
  };
}

export function resumenError(r: RespuestaKernel): string {
  return r.error ? `${r.error.tipo}: ${r.error.mensaje}` : "El kernel no devolvió resultado.";
}

export interface SalidaEjecucion {
  ok: boolean;
  /** Número de la revisión activa tras la operación; null si falló. */
  revision: number | null;
  error: RespuestaKernel["error"];
  medidas: RespuestaKernel["medidas"];
  valida: boolean;
  motivos: string[];
  parametros: RespuestaKernel["parametros"];
}

export function salidaFallida(r: RespuestaKernel): SalidaEjecucion {
  return { ok: false, revision: null, error: r.error, medidas: null, valida: false, motivos: r.motivos, parametros: r.parametros };
}

export function salidaOk(r: RespuestaKernel, revision: number): SalidaEjecucion {
  return { ok: true, revision, error: null, medidas: r.medidas, valida: r.valida, motivos: r.motivos, parametros: r.parametros };
}
