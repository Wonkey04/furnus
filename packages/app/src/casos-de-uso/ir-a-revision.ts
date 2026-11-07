import {
  ErrorDeDominio,
  conResultado,
  irARevision,
  registrarActividad,
  revisionAnterior,
  revisionSiguiente,
  valoresVigentes,
  type OrigenCambio,
} from "@furnus/core";
import type { Dependencias } from "../puertos/index.js";
import {
  aResultado,
  cargarPieza,
  llamarKernel,
  resumenError,
  salidaFallida,
  salidaOk,
  type SalidaEjecucion,
} from "./comunes.js";

export type Destino = "deshacer" | "rehacer" | number;

/** Deshacer/rehacer: vuelve a correr el script de otra revisión. No crea revisiones nuevas. */
export class IrARevision {
  constructor(private deps: Dependencias) {}

  async ejecutar(entrada: { piezaId: string; destino: Destino; origen?: OrigenCambio }): Promise<SalidaEjecucion> {
    const { repositorio, eventos, reloj } = this.deps;
    const origen = entrada.origen ?? "persona";
    let pieza = await cargarPieza(this.deps, entrada.piezaId);
    const numero =
      entrada.destino === "deshacer"
        ? revisionAnterior(pieza)
        : entrada.destino === "rehacer"
          ? revisionSiguiente(pieza)
          : entrada.destino;
    if (numero === null) {
      throw new ErrorDeDominio("SIN_SCRIPT", `No hay una revisión a la cual ${entrada.destino}.`);
    }
    const destino = irARevision(pieza, numero, reloj.ahora());
    const script = destino.revisiones.find((r) => r.numero === numero)!.script;

    const respuesta = await llamarKernel(this.deps, {
      script,
      parametros: pieza.valores,
      salidas: ["malla", "medidas"],
      directorioSalida: await repositorio.rutaSalidas(pieza.id),
    });
    const ahora = reloj.ahora();
    if (!respuesta.ok) {
      pieza = registrarActividad(
        pieza,
        { herramienta: "ejecutar_script", origen, estado: "error", detalle: `Revisión ${numero}: ${resumenError(respuesta)}`, traza: respuesta.error?.traceback },
        ahora,
      );
      await repositorio.guardar(pieza);
      await eventos.publicar({ tipo: "pieza_actualizada", piezaId: pieza.id, motivo: "error" });
      return salidaFallida(respuesta);
    }
    pieza = { ...destino, valores: valoresVigentes(pieza.valores, respuesta.parametros), actividad: pieza.actividad };
    pieza = conResultado(pieza, aResultado(respuesta, numero, ahora));
    pieza = registrarActividad(
      pieza,
      { herramienta: "ejecutar_script", origen, estado: "ok", detalle: `Volvió a la revisión ${numero}` },
      ahora,
    );
    await repositorio.guardar(pieza);
    await eventos.publicar({ tipo: "pieza_actualizada", piezaId: pieza.id, motivo: "revision" });
    return salidaOk(respuesta, numero);
  }
}
