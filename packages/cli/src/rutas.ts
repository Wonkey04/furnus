import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { buscarEjecutable, variable, type Entorno } from "./entorno.js";

export type Cliente = "desktop" | "code";
export const NOMBRE_CLIENTE: Record<Cliente, string> = { desktop: "Claude Desktop", code: "Claude Code" };

export interface Destino {
  cliente: Cliente;
  /** Archivo de configuración a editar (puede no existir todavía). */
  archivo: string;
  existe: boolean;
}

/** Claude Desktop puede estar instalado "normal" o desde la Microsoft Store (config virtualizada). */
export function candidatosDesktop(e: Entorno): string[] {
  const nombre = "claude_desktop_config.json";
  if (e.plataforma === "darwin") return [join(e.casa, "Library", "Application Support", "Claude", nombre)];
  if (e.plataforma === "win32") {
    const roaming = variable(e, "APPDATA") ?? join(e.casa, "AppData", "Roaming");
    const local = variable(e, "LOCALAPPDATA") ?? join(e.casa, "AppData", "Local");
    const lista = [join(roaming, "Claude", nombre)];
    try {
      for (const d of readdirSync(join(local, "Packages"))) {
        if (/^(Claude_|AnthropicPBC\.Claude)/i.test(d)) lista.push(join(local, "Packages", d, "LocalCache", "Roaming", "Claude", nombre));
      }
    } catch {
      /* sin carpeta Packages */
    }
    return lista;
  }
  const config = variable(e, "XDG_CONFIG_HOME") ?? join(e.casa, ".config");
  return [join(config, "Claude", nombre)];
}

export function archivoConfigCode(e: Entorno): string {
  const dir = variable(e, "CLAUDE_CONFIG_DIR");
  return join(dir || e.casa, ".claude.json");
}

export function carpetasExtraCli(e: Entorno): string[] {
  return [join(e.casa, ".local", "bin"), join(e.casa, ".claude", "local")];
}

/**
 * Qué clientes hay en esta máquina. Desktop: existe la carpeta `Claude` de su config (la crea al abrirse la primera vez).
 * Code: existe el ejecutable `claude`, su carpeta `.claude` o su `.claude.json`.
 */
export function detectar(e: Entorno): Destino[] {
  const destinos: Destino[] = [];
  for (const archivo of candidatosDesktop(e)) {
    if (existsSync(archivo) || existsSync(dirname(archivo))) destinos.push({ cliente: "desktop", archivo, existe: existsSync(archivo) });
  }
  const code = archivoConfigCode(e);
  // Con CLAUDE_CONFIG_DIR esa carpeta es la config de Claude Code (adentro va .claude.json); si no, ~/.claude.
  const claudeDir = variable(e, "CLAUDE_CONFIG_DIR") || join(e.casa, ".claude");
  if (existsSync(code) || existsSync(claudeDir) || buscarEjecutable("claude", e, carpetasExtraCli(e))) {
    destinos.push({ cliente: "code", archivo: code, existe: existsSync(code) });
  }
  return destinos;
}
