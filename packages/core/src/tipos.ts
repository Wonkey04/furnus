export interface Parametro {
  nombre: string;
  valor: number;
  min: number | null;
  max: number | null;
  unidad: string;
}

export interface Medidas {
  caja: [number, number, number];
  volumen: number;
  area: number;
}

export interface ErrorScript {
  tipo: string;
  mensaje: string;
  linea: number | null;
  traceback: string;
}

export type OrigenCambio = "agente" | "persona";

export interface Revision {
  numero: number;
  script: string;
  origen: OrigenCambio;
  creadaEn: string;
}

export interface ResultadoEjecucion {
  ok: boolean;
  error: ErrorScript | null;
  medidas: Medidas | null;
  valida: boolean;
  motivos: string[];
  parametros: Parametro[];
  /** Revisión cuyo script produjo este resultado. */
  revision: number;
  ejecutadoEn: string;
}

export type Herramienta = "ejecutar_script" | "cambiar_parametro" | "medir" | "renderizar" | "exportar";

export interface Actividad {
  id: number;
  en: string;
  herramienta: Herramienta;
  origen: OrigenCambio;
  estado: "ok" | "error";
  detalle: string;
  /** Traceback completo cuando el error vino de un script; el visor lo muestra entero. */
  traza?: string;
}

export interface Pieza {
  id: string;
  nombre: string;
  creadaEn: string;
  editadaEn: string;
  revisiones: Revision[];
  /** Número de la revisión activa; 0 si todavía no hay ninguna. */
  revisionActual: number;
  /** Valores de parámetros elegidos por la persona (los que no están usan el default del script). */
  valores: Record<string, number>;
  /** Último resultado correcto: el visor no pierde la pieza anterior cuando un script falla. */
  resultado: ResultadoEjecucion | null;
  actividad: Actividad[];
}
