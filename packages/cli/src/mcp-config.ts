export interface EntradaMcp {
  type?: "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export type EstadoFusion = "creado" | "actualizado" | "sin_cambios";

export interface Fusion {
  estado: EstadoFusion;
  /** Texto final del archivo. */
  texto: string;
  /** Qué cambió, línea por línea, para avisarle a la persona. */
  cambios: string[];
}

export class ConfigInvalida extends Error {}

export const NOMBRE_SERVIDOR = "furnus";

function sangria(original: string): string | number {
  const m = /^[ \t]+(?=")/m.exec(original);
  if (!m) return 2;
  return m[0].includes("\t") ? "\t" : m[0].length;
}

function igual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Agrega o actualiza SOLO `mcpServers.furnus`. Los demás servidores y el resto de las claves quedan como estaban
 * (mismo orden, misma sangría). Si el JSON está roto, no se toca nada.
 */
export function fusionar(original: string | null, entrada: EntradaMcp): Fusion {
  const limpio = (original ?? "").replace(/^\uFEFF/, "");
  let raiz: Record<string, unknown>;
  if (limpio.trim() === "") raiz = {};
  else {
    let parseado: unknown;
    try {
      parseado = JSON.parse(limpio);
    } catch (e) {
      throw new ConfigInvalida(`el archivo no es un JSON válido (${e instanceof Error ? e.message : String(e)})`);
    }
    if (parseado === null || typeof parseado !== "object" || Array.isArray(parseado)) throw new ConfigInvalida("el archivo no es un objeto JSON");
    raiz = parseado as Record<string, unknown>;
  }
  if (raiz.mcpServers !== undefined && (raiz.mcpServers === null || typeof raiz.mcpServers !== "object" || Array.isArray(raiz.mcpServers))) {
    throw new ConfigInvalida("«mcpServers» existe pero no es un objeto");
  }
  const servidores = (raiz.mcpServers ?? {}) as Record<string, unknown>;
  const anterior = servidores[NOMBRE_SERVIDOR] as Partial<EntradaMcp> | undefined;

  if (anterior !== undefined && igual(anterior, entrada)) return { estado: "sin_cambios", texto: original ?? "", cambios: [] };

  const cambios: string[] = [];
  if (anterior === undefined) {
    cambios.push(`agrega el servidor «${NOMBRE_SERVIDOR}»`);
  } else {
    cambios.push(`actualiza el servidor «${NOMBRE_SERVIDOR}» que ya estaba`);
    if (anterior.command !== entrada.command) cambios.push(`comando: ${anterior.command ?? "(ninguno)"} → ${entrada.command}`);
    if (!igual(anterior.args, entrada.args)) cambios.push(`argumentos: ${JSON.stringify(anterior.args ?? [])} → ${JSON.stringify(entrada.args)}`);
    if (!igual(anterior.env, entrada.env)) cambios.push(`variables de entorno: ${JSON.stringify(anterior.env ?? {})} → ${JSON.stringify(entrada.env ?? {})}`);
  }
  const otros = Object.keys(servidores).filter((k) => k !== NOMBRE_SERVIDOR);
  if (otros.length > 0) cambios.push(`no toca los otros servidores: ${otros.join(", ")}`);

  servidores[NOMBRE_SERVIDOR] = entrada;
  raiz.mcpServers = servidores;
  const terminaEnSalto = limpio.length === 0 || /\n$/.test(limpio);
  const texto = JSON.stringify(raiz, null, sangria(limpio)) + (terminaEnSalto ? "\n" : "");
  return { estado: anterior === undefined ? "creado" : "actualizado", texto, cambios };
}
