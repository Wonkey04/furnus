import {
  ErrorDeDominio,
  conResultado,
  registrarActividad,
  scriptActual,
  validarCambio,
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

export class CambiarParametro {
  constructor(private deps: Dependencias) {}

  async ejecutar(entrada: {
    piezaId: string;
    nombre: string;
    valor: number;
    origen?: OrigenCambio;
  }): Promise<SalidaEjecucion> {
    const { repositorio, eventos, reloj } = this.deps;
    const origen = entrada.origen ?? "persona";
    let pieza = await cargarPieza(this.deps, entrada.piezaId);
    const script = scriptActual(pieza);
    if (!pieza.resultado) throw new ErrorDeDominio("SIN_SCRIPT", "La pieza todavía no se ejecutó.");
    validarCambio(pieza.resultado.parametros, entrada.nombre, entrada.valor);

    const valores = { ...pieza.valores, [entrada.nombre]: entrada.valor };
    const respuesta = await llamarKernel(this.deps, {
      script,
      parametros: valores,
      salidas: ["malla", "medidas"],
      directorioSalida: await repositorio.rutaSalidas(pieza.id),
    });
    const ahora = reloj.ahora();

    if (!respuesta.ok) {
      pieza = registrarActividad(
        pieza,
        {
          herramienta: "cambiar_parametro",
          origen,
          estado: "error",
          detalle: `${entrada.nombre} = ${entrada.valor}: ${resumenError(respuesta)}`,
          traza: respuesta.error?.traceback,
        },
        ahora,
      );
      await repositorio.guardar(pieza);
      await eventos.publicar({ tipo: "pieza_actualizada", piezaId: pieza.id, motivo: "error" });
      return salidaFallida(respuesta);
    }

    pieza = { ...pieza, valores };
    pieza = conResultado(pieza, aResultado(respuesta, pieza.revisionActual, ahora));
    pieza = registrarActividad(
      pieza,
      { herramienta: "cambiar_parametro", origen, estado: "ok", detalle: `${entrada.nombre} = ${entrada.valor}` },
      ahora,
    );
    await repositorio.guardar(pieza);
    await eventos.publicar({ tipo: "pieza_actualizada", piezaId: pieza.id, motivo: "parametro" });
    return salidaOk(respuesta, pieza.revisionActual);
  }
}
