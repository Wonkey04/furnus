/** Lo que el agente le cuenta al visor mientras trabaja (viaja por el WebSocket de la API). */
export type EventoChat =
  | { tipo: "inicio"; texto: string }
  | { tipo: "texto"; delta: string }
  | { tipo: "herramienta"; id: string; nombre: string; estado: "ejecutando" | "ok" | "error"; resumen?: string }
  | { tipo: "error"; mensaje: string }
  | { tipo: "fin"; cancelado?: boolean };

/** Lo que queda guardado para volver a dibujar la conversación al abrir la pieza. */
export type ItemTranscripto =
  | { tipo: "usuario"; texto: string }
  | { tipo: "asistente"; texto: string }
  | { tipo: "herramienta"; id: string; nombre: string; estado: "ejecutando" | "ok" | "error"; resumen?: string }
  | { tipo: "error"; mensaje: string };

export interface EstadoChat {
  ocupado: boolean;
  transcripto: ItemTranscripto[];
}

/** Comandos que el panel le muestra a la persona para dejar andando Claude Code. */
export interface AyudaClaudeCode {
  instalar: { etiqueta: string; comando: string }[];
  login: string;
}

/**
 * «listo»: hay CLI y sesión. «sin_cli»: no se encuentra `claude`. «sin_login»: está instalado pero sin sesión iniciada.
 * «sin_motor» no lo produce el agente: lo informa la API cuando no se armó ningún agente.
 */
export type EstadoMotor = "listo" | "sin_cli" | "sin_login";

export interface Diagnostico {
  estado: EstadoMotor;
  version?: string;
  /** Solo cuando no está «listo». */
  ayuda?: AyudaClaudeCode;
}

/** Lo que la API necesita del agente; permite probarla con uno falso. */
export interface AgentePuerto {
  /** El modelo que se configuró o que informó el CLI; `null` si todavía no se sabe. */
  readonly modelo: string | null;
  diagnostico(): Promise<Diagnostico>;
  estado(piezaId: string): EstadoChat;
  /** Resuelve cuando termina el turno completo (incluidas las tools). Lanza «OCUPADO» si ya hay uno en curso, «SIN_CLI» o «SIN_LOGIN» si el motor no está listo. */
  enviar(piezaId: string, texto: string, emitir: (e: EventoChat) => void): Promise<void>;
  cancelar(piezaId: string): void;
}
