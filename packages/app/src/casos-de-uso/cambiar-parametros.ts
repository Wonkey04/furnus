import {
  ErrorDeDominio,
  agregarRevision,
  conResultado,
  registrarActividad,
  scriptActual,
  validarCambios,
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

/**
 * Ajuste de parámetros hecho por el agente: reusa el script vigente y deja una revisión nueva
 * (con los valores), a diferencia del deslizador de la persona, que no llena el historial.
 */
export class CambiarParametros {
  constructor(private deps: Dependencias) {}

  async ejecutar(entrada: {
    piezaId: string;
    valores: Record<string, number>;
    origen?: OrigenCambio;
  }): Promise<SalidaEjecucion> {
    const { repositorio, eventos, reloj } = this.deps;
    const origen = entrada.origen ?? "agente";
    let pieza = await cargarPieza(this.deps, entrada.piezaId);
    if (Object.keys(entrada.valores).length === 0) {
      throw new ErrorDeDominio("PARAMETRO_DESCONOCIDO", "No indicaste ningún valor. Pasá por ejemplo { \"espesor\": 30 }.");
    }
    const script = scriptActual(pieza);
    if (!pieza.resultado) throw new ErrorDeDominio("SIN_SCRIPT", "La pieza todavía no se ejecutó.");
    validarCambios(pieza.resultado.parametros, entrada.valores);

    const valores = { ...pieza.valores, ...entrada.valores };
    const respuesta = await llamarKernel(this.deps, {
      script,
      parametros: valores,
      salidas: ["malla", "medidas"],
      directorioSalida: await repositorio.rutaSalidas(pieza.id),
    });
    const ahora = reloj.ahora();
    const resumen = Object.entries(entrada.valores).map(([n, v]) => `${n} = ${v}`).join(", ");

    if (!respuesta.ok) {
      pieza = registrarActividad(
        pieza,
        {
          herramienta: "cambiar_parametros",
          origen,
          estado: "error",
          detalle: `${resumen}: ${resumenError(respuesta)}`,
          traza: respuesta.error?.traceback,
        },
        ahora,
      );
      await repositorio.guardar(pieza);
      await eventos.publicar({ tipo: "pieza_actualizada", piezaId: pieza.id, motivo: "error" });
      return salidaFallida(respuesta);
    }

    const vigentes = valoresVigentes(valores, respuesta.parametros);
    pieza = agregarRevision(pieza, script, origen, ahora, vigentes);
    pieza = { ...pieza, valores: vigentes };
    pieza = conResultado(pieza, aResultado(respuesta, pieza.revisionActual, ahora));
    pieza = registrarActividad(
      pieza,
      { herramienta: "cambiar_parametros", origen, estado: "ok", detalle: `${resumen} → revisión ${pieza.revisionActual}` },
      ahora,
    );
    await repositorio.guardar(pieza);
    await eventos.publicar({ tipo: "pieza_actualizada", piezaId: pieza.id, motivo: "parametro" });
    return salidaOk(respuesta, pieza.revisionActual);
  }
}
