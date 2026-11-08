import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { createInterface } from "node:readline";
import type { AyudaClaudeCode, Diagnostico } from "./eventos.js";

/** Un `claude` en ejecución, visto desde afuera: líneas de stdout, stdin y cómo pararlo. */
export interface ProcesoCli {
  lineas: AsyncIterable<string>;
  stderr(): string;
  escribir(texto: string): void;
  cerrarEntrada(): void;
  matar(): void;
  /** Resuelve al terminar. `error` viene si ni siquiera pudo arrancar (por ejemplo ENOENT). */
  salida: Promise<{ codigo: number | null; error?: NodeJS.ErrnoException }>;
}

export interface OpcionesLanzamiento {
  cwd: string;
  env: NodeJS.ProcessEnv;
  /** Un `.cmd` (npm en Windows) solo se puede lanzar a través del shell. */
  shell?: boolean;
}

export type Lanzador = (bin: string, args: string[], opciones: OpcionesLanzamiento) => ProcesoCli;

export interface CliEncontrado {
  ruta: string;
  shell: boolean;
}

/** Variables que, de estar presentes, hacen que `claude -p` use una clave o un proveedor en vez del login de la suscripción. */
const VARIABLES_DE_CREDENCIAL = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
];

/** El CLI trabaja con la suscripción de la persona: se le quita todo lo que lo desvíe a una clave. */
export function entornoParaCli(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...base };
  for (const k of VARIABLES_DE_CREDENCIAL) delete env[k];
  return env;
}

/** Busca el ejecutable: `FURNUS_CLAUDE_BIN`, el PATH y los lugares donde deja el instalador nativo. */
export function resolverCli(
  env: NodeJS.ProcessEnv = process.env,
  plataforma: NodeJS.Platform = process.platform,
  existe: (ruta: string) => boolean = existsSync,
  casa: string = homedir(),
): CliEncontrado | null {
  const esWin = plataforma === "win32";
  const aEncontrado = (ruta: string): CliEncontrado => ({ ruta, shell: esWin && /\.(cmd|bat)$/i.test(ruta) });
  if (env.FURNUS_CLAUDE_BIN) return existe(env.FURNUS_CLAUDE_BIN) ? aEncontrado(env.FURNUS_CLAUDE_BIN) : null;

  const nombres = esWin ? ["claude.exe", "claude.cmd"] : ["claude"];
  const carpetas = (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean);
  carpetas.push(join(casa, ".local", "bin"), join(casa, ".claude", "local"));
  for (const carpeta of carpetas) {
    for (const nombre of nombres) {
      const ruta = join(carpeta, nombre);
      if (existe(ruta)) return aEncontrado(ruta);
    }
  }
  return null;
}

export function ayudaClaudeCode(plataforma: NodeJS.Platform = process.platform): AyudaClaudeCode {
  const instalar =
    plataforma === "win32"
      ? [
          { etiqueta: "PowerShell", comando: "irm https://claude.ai/install.ps1 | iex" },
          { etiqueta: "WinGet", comando: "winget install Anthropic.ClaudeCode" },
        ]
      : [
          { etiqueta: plataforma === "darwin" ? "macOS" : "Linux", comando: "curl -fsSL https://claude.ai/install.sh | bash" },
          ...(plataforma === "darwin" ? [{ etiqueta: "Homebrew", comando: "brew install --cask claude-code" }] : []),
        ];
  instalar.push({ etiqueta: "npm (Node 22 o más)", comando: "npm install -g @anthropic-ai/claude-code" });
  return { instalar, login: "claude auth login" };
}

const comillas = (a: string) => (/[\s"&|<>^()%!]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

/** Lanzador real, sobre `child_process`. En Windows mata todo el árbol (un `.cmd` deja procesos nietos). */
export const lanzadorReal: Lanzador = (bin, args, { cwd, env, shell }) => {
  const hijo = shell ? spawn(comillas(bin), args.map(comillas), { cwd, env, shell: true, windowsHide: true }) : spawn(bin, args, { cwd, env, windowsHide: true });
  let stderr = "";
  hijo.stderr?.setEncoding("utf8");
  hijo.stderr?.on("data", (d: string) => {
    stderr = (stderr + d).slice(-8000);
  });
  // Un error de EPIPE al escribir en un proceso que ya murió no debe tirar la API.
  hijo.stdin?.on("error", () => undefined);

  const salida = new Promise<{ codigo: number | null; error?: NodeJS.ErrnoException }>((resolver) => {
    hijo.once("error", (error) => resolver({ codigo: null, error }));
    hijo.once("close", (codigo) => resolver({ codigo }));
  });
  const lineas = hijo.stdout ? createInterface({ input: hijo.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]() : (async function* () {})();

  return {
    lineas: { [Symbol.asyncIterator]: () => lineas as AsyncIterator<string> },
    stderr: () => stderr,
    escribir: (t) => void hijo.stdin?.write(t),
    cerrarEntrada: () => void hijo.stdin?.end(),
    matar: () => {
      if (hijo.pid === undefined || hijo.exitCode !== null) return;
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(hijo.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      else hijo.kill("SIGTERM");
    },
    salida,
  };
};

async function correr(
  lanzador: Lanzador,
  cli: CliEncontrado,
  args: string[],
  opciones: OpcionesLanzamiento,
  limiteMs: number,
): Promise<{ codigo: number | null; stdout: string; error?: NodeJS.ErrnoException }> {
  const p = lanzador(cli.ruta, args, { ...opciones, shell: cli.shell });
  p.cerrarEntrada();
  const reloj = setTimeout(() => p.matar(), limiteMs);
  let stdout = "";
  try {
    for await (const linea of p.lineas) stdout += linea + "\n";
    const { codigo, error } = await p.salida;
    return { codigo, stdout, error };
  } finally {
    clearTimeout(reloj);
  }
}

export interface OpcionesDiagnostico {
  lanzador: Lanzador;
  resolver: () => CliEncontrado | null;
  env: NodeJS.ProcessEnv;
  cwd: string;
  plataforma?: NodeJS.Platform;
  limiteMs?: number;
}

/** ¿Hay `claude` y tiene sesión? Se decide con `claude --version` y `claude auth status` (JSON; sale con 1 sin sesión). */
export async function diagnosticarCli(o: OpcionesDiagnostico): Promise<Diagnostico> {
  const ayuda = ayudaClaudeCode(o.plataforma);
  const cli = o.resolver();
  if (!cli) return { estado: "sin_cli", ayuda };
  const base = { cwd: o.cwd, env: entornoParaCli(o.env) };
  const limite = o.limiteMs ?? 15_000;

  const v = await correr(o.lanzador, cli, ["--version"], base, limite);
  if (v.error?.code === "ENOENT") return { estado: "sin_cli", ayuda };
  const version = v.stdout.trim().split(/\r?\n/)[0] || undefined;

  const a = await correr(o.lanzador, cli, ["auth", "status"], base, limite);
  if (a.error?.code === "ENOENT") return { estado: "sin_cli", ayuda };
  let metodo: string | null = null;
  try {
    const j = JSON.parse(a.stdout) as { authMethod?: string; loggedIn?: boolean };
    metodo = typeof j.authMethod === "string" ? j.authMethod : j.loggedIn === false ? "none" : null;
  } catch {
    /* un CLI viejo sin `auth status`: se asume que anda y el error, si lo hay, sale al usarlo */
  }
  if (metodo === "none" || (metodo === null && a.codigo === 1 && /not logged in|no estás/i.test(a.stdout))) {
    return { estado: "sin_login", version, ayuda };
  }
  return { estado: "listo", version };
}
