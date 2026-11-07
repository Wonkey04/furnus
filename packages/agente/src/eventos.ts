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

/** Lo que la API necesita del agente; permite probarla con uno falso. */
export interface AgentePuerto {
  readonly disponible: boolean;
  readonly modelo: string;
  estado(piezaId: string): EstadoChat;
  /** Resuelve cuando termina el turno completo (incluidas las tools). Lanza «OCUPADO» si ya hay uno en curso. */
  enviar(piezaId: string, texto: string, emitir: (e: EventoChat) => void): Promise<void>;
  cancelar(piezaId: string): void;
}
