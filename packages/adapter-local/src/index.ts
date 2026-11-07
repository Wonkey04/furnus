import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RepositorioPort } from "@furnus/app";
import type { Actividad, Pieza, ResultadoEjecucion, Revision } from "@furnus/core";

/** Lo que va en proyecto.json; los scripts y los valores van en sus propios archivos. */
interface ProyectoJson {
  id: string;
  nombre: string;
  creadaEn: string;
  editadaEn: string;
  revisionActual: number;
  revisiones: Omit<Revision, "script">[];
  resultado: ResultadoEjecucion | null;
  actividad: Actividad[];
}

export function carpetaPorDefecto(): string {
  return process.env.FURNUS_HOME ? join(process.env.FURNUS_HOME, "proyectos") : join(homedir(), ".furnus", "proyectos");
}

const nombreRevision = (n: number) => `${String(n).padStart(4, "0")}.py`;

export class RepositorioLocal implements RepositorioPort {
  constructor(private raiz: string = carpetaPorDefecto()) {}

  private dir(id: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`Id de pieza inválido: ${id}`);
    return join(this.raiz, id);
  }

  nuevoId(): string {
    return randomUUID().slice(0, 8);
  }

  async crear(pieza: Pieza): Promise<void> {
    await mkdir(join(this.dir(pieza.id), "revisiones"), { recursive: true });
    await this.guardar(pieza);
  }

  async guardar(pieza: Pieza): Promise<void> {
    const base = this.dir(pieza.id);
    await mkdir(join(base, "revisiones"), { recursive: true });
    for (const r of pieza.revisiones) {
      await escribirAtomico(join(base, "revisiones", nombreRevision(r.numero)), r.script);
    }
    await escribirAtomico(join(base, "parametros.json"), JSON.stringify(pieza.valores, null, 2));
    const json: ProyectoJson = {
      id: pieza.id,
      nombre: pieza.nombre,
      creadaEn: pieza.creadaEn,
      editadaEn: pieza.editadaEn,
      revisionActual: pieza.revisionActual,
      revisiones: pieza.revisiones.map(({ numero, origen, creadaEn }) => ({ numero, origen, creadaEn })),
      resultado: pieza.resultado,
      actividad: pieza.actividad,
    };
    await escribirAtomico(join(base, "proyecto.json"), JSON.stringify(json, null, 2));
  }

  async obtener(id: string): Promise<Pieza | null> {
    const base = this.dir(id);
    let json: ProyectoJson;
    try {
      json = JSON.parse(await readFile(join(base, "proyecto.json"), "utf8")) as ProyectoJson;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
    const revisiones: Revision[] = [];
    for (const r of json.revisiones) {
      const script = await readFile(join(base, "revisiones", nombreRevision(r.numero)), "utf8");
      revisiones.push({ ...r, script });
    }
    let valores: Record<string, number> = {};
    try {
      valores = JSON.parse(await readFile(join(base, "parametros.json"), "utf8")) as Record<string, number>;
    } catch {
      /* sin parámetros guardados todavía */
    }
    return {
      id: json.id,
      nombre: json.nombre,
      creadaEn: json.creadaEn,
      editadaEn: json.editadaEn,
      revisiones,
      revisionActual: json.revisionActual,
      valores,
      resultado: json.resultado,
      actividad: json.actividad,
    };
  }

  async listar(): Promise<Pieza[]> {
    let ids: string[];
    try {
      ids = (await readdir(this.raiz, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
    const piezas = await Promise.all(ids.map((id) => this.obtener(id).catch(() => null)));
    return piezas.filter((p): p is Pieza => p !== null);
  }

  async rutaSalidas(id: string): Promise<string> {
    const ruta = join(this.dir(id), "salidas");
    await mkdir(ruta, { recursive: true });
    return ruta;
  }

  async borrar(id: string): Promise<void> {
    await rm(this.dir(id), { recursive: true, force: true });
  }
}

// Escribe y renombra para que el visor (otro proceso) nunca lea un JSON a medias.
async function escribirAtomico(ruta: string, contenido: string): Promise<void> {
  const tmp = `${ruta}.${process.pid}.tmp`;
  await writeFile(tmp, contenido, "utf8");
  await rename(tmp, ruta);
}
