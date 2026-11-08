import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

/**
 * Todo lo que depende de la máquina entra por acá. Las rutas de las configs se derivan de `casa` y `env`,
 * así los tests apuntan a un directorio temporal y nunca tocan la config real de nadie.
 */
export interface Entorno {
  plataforma: NodeJS.Platform;
  casa: string;
  env: NodeJS.ProcessEnv;
}

export function entornoReal(): Entorno {
  return { plataforma: process.platform, casa: homedir(), env: process.env };
}

export function variable(e: Entorno, nombre: string): string | undefined {
  // En Windows las variables no distinguen mayúsculas ("Path" vs "PATH").
  if (e.env[nombre] !== undefined) return e.env[nombre];
  if (e.plataforma !== "win32") return undefined;
  const clave = Object.keys(e.env).find((k) => k.toLowerCase() === nombre.toLowerCase());
  return clave ? e.env[clave] : undefined;
}

/** Busca un ejecutable en el PATH y en los lugares donde suelen dejarlo los instaladores. */
export function buscarEjecutable(nombre: string, e: Entorno, extras: string[] = []): string | null {
  const esWin = e.plataforma === "win32";
  const nombres = esWin ? [`${nombre}.exe`, `${nombre}.cmd`, `${nombre}.bat`] : [nombre];
  const carpetas = (variable(e, "PATH") ?? "").split(delimiter).filter(Boolean);
  carpetas.push(...extras);
  for (const carpeta of carpetas) {
    for (const n of nombres) {
      const ruta = join(carpeta, n);
      if (existsSync(ruta)) return ruta;
    }
  }
  return null;
}
