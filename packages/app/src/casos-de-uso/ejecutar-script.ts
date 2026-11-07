import { agregarRevision, conResultado, registrarActividad, valoresVigentes, type OrigenCambio } from "@furnus/core";
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

export interface EntradaEjecutarScript {
  piezaId: string;
  script: string;
  parametros?: Record<string, number>;
  origen?: OrigenCambio;
}

export type SalidaEjecutarScript = SalidaEjecucion;

export class EjecutarScript {
  constructor(private deps: Dependencias) {}

  async ejecutar(entrada: EntradaEjecutarScript): Promise<SalidaEjecutarScript> {
    const { repositorio, eventos, reloj } = this.deps;
    const origen = entrada.origen ?? "agente";
    let pieza = await cargarPieza(this.deps, entrada.piezaId);
    const pedidos = { ...pieza.valores, ...(entrada.parametros ?? {}) };

    const respuesta = await llamarKernel(this.deps, {
      script: entrada.script,
      parametros: pedidos,
      salidas: ["malla", "medidas"],
      directorioSalida: await repositorio.rutaSalidas(pieza.id),
    });
    const ahora = reloj.ahora();

    // Un script que falla no se guarda como revisión: la pieza anterior sigue siendo la vigente.
    if (!respuesta.ok) {
      pieza = registrarActividad(
        pieza,
        { herramienta: "ejecutar_script", origen, estado: "error", detalle: resumenError(respuesta) },
        ahora,
      );
      await repositorio.guardar(pieza);
      await eventos.publicar({ tipo: "pieza_actualizada", piezaId: pieza.id, motivo: "error" });
      return salidaFallida(respuesta);
    }

    pieza = agregarRevision(pieza, entrada.script, origen, ahora);
    pieza = { ...pieza, valores: valoresVigentes(pedidos, respuesta.parametros) };
    pieza = conResultado(pieza, aResultado(respuesta, pieza.revisionActual, ahora));
    pieza = registrarActividad(
      pieza,
      {
        herramienta: "ejecutar_script",
        origen,
        estado: "ok",
        detalle: respuesta.valida
          ? `Revisión ${pieza.revisionActual}`
          : `Revisión ${pieza.revisionActual} (geometría inválida)`,
      },
      ahora,
    );
    await repositorio.guardar(pieza);
    await eventos.publicar({ tipo: "pieza_actualizada", piezaId: pieza.id, motivo: "script" });
    return salidaOk(respuesta, pieza.revisionActual);
  }
}
