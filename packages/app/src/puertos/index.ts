import type { ErrorScript, Medidas, Parametro, Pieza } from "@furnus/core";

export type SalidaKernel = "malla" | "medidas" | "step" | "stl";

export interface PedidoKernel {
  script: string;
  parametros: Record<string, number>;
  salidas: SalidaKernel[];
  unidad?: "mm" | "in";
  /** Carpeta donde el kernel deja los archivos generados. */
  directorioSalida?: string;
}

export interface ArchivoKernel {
  formato: string;
  ruta: string;
}

export interface RespuestaKernel {
  ok: boolean;
  malla: ArchivoKernel | null;
  step?: ArchivoKernel | null;
  stl?: ArchivoKernel | null;
  medidas: Medidas | null;
  valida: boolean;
  motivos: string[];
  parametros: Parametro[];
  error: ErrorScript | null;
}

export interface KernelPort {
  ejecutar(pedido: PedidoKernel): Promise<RespuestaKernel>;
}

export interface RepositorioPort {
  nuevoId(): string;
  crear(pieza: Pieza): Promise<void>;
  obtener(id: string): Promise<Pieza | null>;
  listar(): Promise<Pieza[]>;
  guardar(pieza: Pieza): Promise<void>;
  borrar(id: string): Promise<void>;
  /** Carpeta de salidas (malla, exportaciones) de la pieza; la crea si falta. */
  rutaSalidas(id: string): Promise<string>;
}

export type EventoPieza =
  | { tipo: "pieza_creada"; piezaId: string }
  | { tipo: "pieza_actualizada"; piezaId: string; motivo: "script" | "parametro" | "revision" | "error" };

export interface EventosPort {
  publicar(evento: EventoPieza): void | Promise<void>;
}

export interface RelojPort {
  ahora(): string;
}

export interface Dependencias {
  kernel: KernelPort;
  repositorio: RepositorioPort;
  eventos: EventosPort;
  reloj: RelojPort;
}
