import { ErrorDeDominio, puedeExportar, registrarActividad, scriptActual } from "@furnus/core";
import type { Dependencias } from "../puertos/index.js";
import { cargarPieza, llamarKernel, resumenError } from "./comunes.js";

export type FormatoExportacion = "step" | "stl" | "3mf";

export interface SalidaExportar {
  formato: "step";
  unidad: "mm" | "in";
  ruta: string;
  nombreArchivo: string;
}

function nombreSeguro(nombre: string): string {
  const base = nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "pieza";
}

export class Exportar {
  constructor(private deps: Dependencias) {}

  async ejecutar(entrada: {
    piezaId: string;
    formato: FormatoExportacion;
    unidad?: "mm" | "in";
  }): Promise<SalidaExportar> {
    const { repositorio, reloj } = this.deps;
    if (entrada.formato !== "step") {
      throw new ErrorDeDominio(
        "FORMATO_NO_DISPONIBLE",
        `El formato ${entrada.formato.toUpperCase()} llega en la fase 02. Por ahora solo STEP.`,
      );
    }
    let pieza = await cargarPieza(this.deps, entrada.piezaId);
    const estado = puedeExportar(pieza);
    if (!estado.ok) {
      throw new ErrorDeDominio("PIEZA_INVALIDA", `No se puede exportar: ${estado.motivos.join(" ")}`);
    }
    const unidad = entrada.unidad ?? "mm";
    const carpeta = `${await repositorio.rutaSalidas(pieza.id)}/exportacion`;
    const respuesta = await llamarKernel(this.deps, {
      script: scriptActual(pieza),
      parametros: pieza.valores,
      salidas: ["step"],
      unidad,
      directorioSalida: carpeta,
    });
    const ahora = reloj.ahora();
    if (!respuesta.ok || !respuesta.step) {
      pieza = registrarActividad(
        pieza,
        { herramienta: "exportar", origen: "persona", estado: "error", detalle: resumenError(respuesta) },
        ahora,
      );
      await repositorio.guardar(pieza);
      throw new ErrorDeDominio(
        "PIEZA_INVALIDA",
        `No se pudo exportar: ${respuesta.error?.mensaje ?? "el kernel no generó el STEP."}`,
      );
    }
    pieza = registrarActividad(
      pieza,
      { herramienta: "exportar", origen: "persona", estado: "ok", detalle: `STEP en ${unidad}` },
      ahora,
    );
    await repositorio.guardar(pieza);
    return { formato: "step", unidad, ruta: respuesta.step.ruta, nombreArchivo: `${nombreSeguro(pieza.nombre)}.step` };
  }
}
