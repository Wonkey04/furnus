import { ErrorDeDominio, registrarActividad, scriptActual } from "@furnus/core";
import type { Dependencias, Vista } from "../puertos/index.js";
import { cargarPieza, llamarKernel, resumenError } from "./comunes.js";

export const VISTAS_POR_DEFECTO: Vista[] = ["iso", "frente", "arriba", "derecha"];

export interface SalidaRenderizar {
  vistas: { vista: string; ruta: string }[];
}

/** Capturas de la pieza vigente. Se dibujan también las inválidas: es justo cuando más sirve mirarlas. */
export class Renderizar {
  constructor(private deps: Dependencias) {}

  async ejecutar(entrada: { piezaId: string; vistas?: Vista[] }): Promise<SalidaRenderizar> {
    const { repositorio, reloj } = this.deps;
    let pieza = await cargarPieza(this.deps, entrada.piezaId);
    const script = scriptActual(pieza);
    const vistas = entrada.vistas?.length ? [...new Set(entrada.vistas)] : VISTAS_POR_DEFECTO;
    const respuesta = await llamarKernel(this.deps, {
      script,
      parametros: pieza.valores,
      salidas: ["render"],
      vistas,
      directorioSalida: `${await repositorio.rutaSalidas(pieza.id)}/render`,
    });
    const ahora = reloj.ahora();
    if (!respuesta.ok || !respuesta.render?.length) {
      pieza = registrarActividad(
        pieza,
        { herramienta: "renderizar", origen: "agente", estado: "error", detalle: resumenError(respuesta) },
        ahora,
      );
      await repositorio.guardar(pieza);
      throw new ErrorDeDominio("PIEZA_INVALIDA", `No se pudo renderizar: ${respuesta.error?.mensaje ?? "el kernel no generó imágenes."}`);
    }
    pieza = registrarActividad(
      pieza,
      { herramienta: "renderizar", origen: "agente", estado: "ok", detalle: vistas.join(", ") },
      ahora,
    );
    await repositorio.guardar(pieza);
    return { vistas: respuesta.render };
  }
}
