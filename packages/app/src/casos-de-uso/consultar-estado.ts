import { ErrorDeDominio, puedeDeshacer, puedeExportar, puedeRehacer, type Pieza } from "@furnus/core";
import type { Dependencias } from "../puertos/index.js";
import { cargarPieza } from "./comunes.js";

export interface EstadoPieza {
  pieza: Pieza;
  puedeDeshacer: boolean;
  puedeRehacer: boolean;
  exportable: { ok: true } | { ok: false; motivos: string[] };
}

export class ConsultarEstado {
  constructor(private deps: Dependencias) {}
  async ejecutar(entrada: { piezaId: string }): Promise<EstadoPieza> {
    const pieza = await cargarPieza(this.deps, entrada.piezaId);
    return {
      pieza,
      puedeDeshacer: puedeDeshacer(pieza),
      puedeRehacer: puedeRehacer(pieza),
      exportable: puedeExportar(pieza),
    };
  }
}

export type ConsultaMedida = "caja" | "volumen" | "area";

/** `medir` en la fase 01: lee las medidas de la última ejecución. Distancias y espesores llegan en la fase 02. */
export class MedirPieza {
  constructor(private deps: Dependencias) {}
  async ejecutar(entrada: {
    piezaId: string;
    consulta: string;
  }): Promise<{ consulta: ConsultaMedida; valor: number | number[]; unidad: string }> {
    const pieza = await cargarPieza(this.deps, entrada.piezaId);
    const m = pieza.resultado?.medidas ?? null;
    if (!m) throw new ErrorDeDominio("SIN_SCRIPT", "La pieza todavía no tiene medidas. Ejecutá un script primero.");
    switch (entrada.consulta) {
      case "caja":
        return { consulta: "caja", valor: m.caja, unidad: "mm" };
      case "volumen":
        return { consulta: "volumen", valor: m.volumen, unidad: "mm³" };
      case "area":
        return { consulta: "area", valor: m.area, unidad: "mm²" };
      default:
        throw new ErrorDeDominio(
          "CONSULTA_NO_DISPONIBLE",
          `La consulta «${entrada.consulta}» todavía no existe. Disponibles: caja, volumen, area. Distancias y espesor mínimo llegan en la fase 02.`,
        );
    }
  }
}
