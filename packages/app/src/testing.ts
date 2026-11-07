import type { Pieza } from "@furnus/core";
import type { CasoContrato } from "./contrato/casos.js";
import type {
  EventoPieza,
  EventosPort,
  KernelPort,
  PedidoKernel,
  RelojPort,
  RepositorioPort,
  RespuestaKernel,
} from "./puertos/index.js";

/** KernelPort falso: responde con lo que le des. Registra los pedidos recibidos. */
export class KernelFalso implements KernelPort {
  llamadas: PedidoKernel[] = [];
  constructor(private responder: (p: PedidoKernel) => RespuestaKernel | Promise<RespuestaKernel>) {}

  static desdeCasos(casos: CasoContrato[]): KernelFalso {
    return new KernelFalso((p) => {
      const caso = casos.find(
        (c) => c.script === p.script && JSON.stringify(c.parametros ?? {}) === JSON.stringify(p.parametros),
      );
      if (!caso) throw new Error("KernelFalso: no hay respuesta para este pedido.");
      return caso.respuestaFalsa;
    });
  }

  async ejecutar(pedido: PedidoKernel): Promise<RespuestaKernel> {
    this.llamadas.push(pedido);
    return this.responder(pedido);
  }
}

export class RepositorioEnMemoria implements RepositorioPort {
  piezas = new Map<string, Pieza>();
  private n = 0;
  nuevoId(): string {
    this.n += 1;
    return `p${this.n}`;
  }
  async crear(pieza: Pieza): Promise<void> {
    this.piezas.set(pieza.id, structuredClone(pieza));
  }
  async obtener(id: string): Promise<Pieza | null> {
    const p = this.piezas.get(id);
    return p ? structuredClone(p) : null;
  }
  async listar(): Promise<Pieza[]> {
    return [...this.piezas.values()].map((p) => structuredClone(p));
  }
  async guardar(pieza: Pieza): Promise<void> {
    this.piezas.set(pieza.id, structuredClone(pieza));
  }
  async borrar(id: string): Promise<void> {
    this.piezas.delete(id);
  }
  async rutaSalidas(id: string): Promise<string> {
    return `memoria/${id}/salidas`;
  }
}

export class EventosEnMemoria implements EventosPort {
  eventos: EventoPieza[] = [];
  publicar(e: EventoPieza): void {
    this.eventos.push(e);
  }
}

export class RelojFijo implements RelojPort {
  private t = 0;
  ahora(): string {
    this.t += 1;
    return new Date(Date.UTC(2026, 0, 1, 0, 0, this.t)).toISOString();
  }
}
