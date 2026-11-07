import { useCallback, useEffect, useRef, useState } from "react";
import type { Actividad, ErrorScript, Medidas, Parametro, Pieza } from "@furnus/core";

export interface ResumenPieza {
  id: string;
  nombre: string;
  editadaEn: string;
  operaciones: number;
  caja: [number, number, number] | null;
  valida: boolean | null;
}

export interface EstadoPieza {
  pieza: Pieza;
  puedeDeshacer: boolean;
  puedeRehacer: boolean;
  exportable: { ok: true } | { ok: false; motivos: string[] };
  mallaUrl: string | null;
}

export interface SalidaEjecucion {
  ok: boolean;
  revision: number | null;
  error: ErrorScript | null;
  medidas: Medidas | null;
  valida: boolean;
  motivos: string[];
  parametros: Parametro[];
}

export interface EstadoAgente {
  conectado: boolean;
  cliente: string | null;
}

export class ErrorApi extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(ruta, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  } catch {
    throw new ErrorApi("SIN_API", "No se pudo hablar con la API. Levantala con «pnpm dev».");
  }
  if (!r.ok) {
    const cuerpo = (await r.json().catch(() => null)) as { error?: { codigo: string; mensaje: string } } | null;
    throw new ErrorApi(cuerpo?.error?.codigo ?? "ERROR", cuerpo?.error?.mensaje ?? `Error ${r.status}.`);
  }
  return (await r.json()) as T;
}

export const api = {
  listar: () => pedir<ResumenPieza[]>("/api/piezas"),
  crear: (nombre?: string) => pedir<ResumenPieza>("/api/piezas", { method: "POST", body: JSON.stringify({ nombre }) }),
  estado: (id: string) => pedir<EstadoPieza>(`/api/piezas/${id}`),
  cambiarParametro: (id: string, nombre: string, valor: number) =>
    pedir<SalidaEjecucion>(`/api/piezas/${id}/parametros`, { method: "PUT", body: JSON.stringify({ nombre, valor }) }),
  irARevision: (id: string, destino: "deshacer" | "rehacer" | number) =>
    pedir<SalidaEjecucion>(`/api/piezas/${id}/revision`, { method: "POST", body: JSON.stringify({ destino }) }),
  agente: () => pedir<EstadoAgente>("/api/agente"),
  async exportar(id: string, formato: "step", unidad: "mm" | "in"): Promise<{ blob: Blob; nombre: string }> {
    const r = await fetch(`/api/piezas/${id}/exportar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ formato, unidad }),
    });
    if (!r.ok) {
      const c = (await r.json().catch(() => null)) as { error?: { codigo: string; mensaje: string } } | null;
      throw new ErrorApi(c?.error?.codigo ?? "ERROR", c?.error?.mensaje ?? `Error ${r.status}.`);
    }
    const nombre = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "pieza.step";
    return { blob: await r.blob(), nombre };
  },
};

export type EventoSocket =
  | { tipo: "pieza_creada"; piezaId: string }
  | { tipo: "pieza_actualizada"; piezaId: string; motivo: string }
  | { tipo: "agente"; conectado: boolean; cliente: string | null };

/** Se suscribe al WebSocket de la API y reconecta solo. */
export function useEventos(alRecibir: (e: EventoSocket) => void): void {
  const ref = useRef(alRecibir);
  ref.current = alRecibir;
  useEffect(() => {
    let socket: WebSocket | null = null;
    let cerrado = false;
    let espera: number | undefined;
    const conectar = () => {
      const protocolo = location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${protocolo}://${location.host}/ws`);
      socket.onmessage = (m) => {
        try {
          ref.current(JSON.parse(m.data as string) as EventoSocket);
        } catch {
          /* mensaje que no es JSON: se ignora */
        }
      };
      socket.onclose = () => {
        if (!cerrado) espera = window.setTimeout(conectar, 2000);
      };
    };
    conectar();
    return () => {
      cerrado = true;
      window.clearTimeout(espera);
      socket?.close();
    };
  }, []);
}

export function useAgente(): EstadoAgente {
  const [estado, setEstado] = useState<EstadoAgente>({ conectado: false, cliente: null });
  const refrescar = useCallback(() => {
    api.agente().then(setEstado).catch(() => setEstado({ conectado: false, cliente: null }));
  }, []);
  useEffect(() => {
    refrescar();
    const t = window.setInterval(refrescar, 10_000);
    return () => window.clearInterval(t);
  }, [refrescar]);
  useEventos((e) => {
    if (e.tipo === "agente") setEstado({ conectado: e.conectado, cliente: e.cliente });
  });
  return estado;
}

export type { Actividad };
