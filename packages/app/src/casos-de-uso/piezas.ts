import { crearPieza, type Pieza } from "@furnus/core";
import type { Dependencias } from "../puertos/index.js";

export class CrearPieza {
  constructor(private deps: Dependencias) {}
  async ejecutar(entrada: { nombre?: string }): Promise<Pieza> {
    const { repositorio, reloj, eventos } = this.deps;
    const pieza = crearPieza(repositorio.nuevoId(), entrada.nombre?.trim() || "Pieza sin nombre", reloj.ahora());
    await repositorio.crear(pieza);
    await eventos.publicar({ tipo: "pieza_creada", piezaId: pieza.id });
    return pieza;
  }
}

export class ListarPiezas {
  constructor(private deps: Dependencias) {}
  async ejecutar(): Promise<Pieza[]> {
    const piezas = await this.deps.repositorio.listar();
    return piezas.sort((a, b) => b.editadaEn.localeCompare(a.editadaEn));
  }
}
