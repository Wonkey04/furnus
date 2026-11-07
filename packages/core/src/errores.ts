export type CodigoError =
  | "PIEZA_NO_ENCONTRADA"
  | "PARAMETRO_DESCONOCIDO"
  | "PARAMETRO_FUERA_DE_RANGO"
  | "SIN_SCRIPT"
  | "PIEZA_INVALIDA"
  | "FORMATO_NO_DISPONIBLE"
  | "CONSULTA_NO_DISPONIBLE"
  | "KERNEL_NO_DISPONIBLE";

export class ErrorDeDominio extends Error {
  constructor(
    readonly codigo: CodigoError,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorDeDominio";
  }
}
