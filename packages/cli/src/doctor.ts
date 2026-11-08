import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buscarEjecutable, type Entorno } from "./entorno.js";
import { NOMBRE_SERVIDOR } from "./mcp-config.js";
import type { Ejecutar } from "./proceso.js";
import { carpetasExtraCli, detectar, NOMBRE_CLIENTE } from "./rutas.js";
import { pythonDeVenv, venvDelKernel, type Runtime } from "./runtime.js";
import type { Salida } from "./salida.js";
import type { SondaMcp } from "./sonda-mcp.js";

export type EstadoChequeo = "ok" | "falla" | "aviso";

export interface Chequeo {
  id: "node" | "python" | "build123d" | "claude" | "login" | "mcp" | "registro";
  titulo: string;
  estado: EstadoChequeo;
  detalle: string;
  /** Qué hacer, paso por paso, cuando no está ok. */
  arreglo?: string[];
}

export interface ContextoDoctor {
  entorno: Entorno;
  runtime: Runtime;
  ejecutar: Ejecutar;
  sondear: SondaMcp;
  versionNode: string;
  /** Crea el venv e instala las dependencias del kernel si faltan. */
  instalar?: boolean;
}

/** Las 5 tools que tiene que exponer el MCP (ver docs/ARCHITECTURE.md). */
export const HERRAMIENTAS_ESPERADAS = ["cambiar_parametros", "ejecutar_script", "exportar", "medir", "renderizar"];

const MINIMO_PYTHON: [number, number] = [3, 11];
const SCRIPT_VERSION = "import sys;print('%d.%d.%d'%sys.version_info[:3])";
const SCRIPT_BUILD123D = "import build123d, numpy, PIL;print(build123d.__version__)";

function menorQue(v: string, [mayor, menor]: [number, number]): boolean {
  const [a = 0, b = 0] = v.split(".").map(Number);
  return a < mayor || (a === mayor && b < menor);
}

function ayudaInstalarPython(p: NodeJS.Platform): string[] {
  if (p === "win32") return ["Instalá Python 3.12: winget install Python.Python.3.12  (o desde https://www.python.org/downloads/)", "Abrí una terminal nueva y volvé a correr «furnus doctor»."];
  if (p === "darwin") return ["Instalá Python 3.12: brew install python@3.12  (o desde https://www.python.org/downloads/)", "Abrí una terminal nueva y volvé a correr «furnus doctor»."];
  return ["Instalá Python 3.11 o más con el venv incluido. Debian/Ubuntu: sudo apt install python3.12 python3.12-venv", "Volvé a correr «furnus doctor»."];
}

export function ayudaInstalarClaude(p: NodeJS.Platform): string[] {
  if (p === "win32") return ["En PowerShell: irm https://claude.ai/install.ps1 | iex", "O con WinGet: winget install Anthropic.ClaudeCode"];
  if (p === "darwin") return ["curl -fsSL https://claude.ai/install.sh | bash", "O con Homebrew: brew install --cask claude-code"];
  return ["curl -fsSL https://claude.ai/install.sh | bash"];
}

function candidatosPython(c: ContextoDoctor): { comando: string; pre: string[]; etiqueta: string }[] {
  const { entorno: e, runtime: r } = c;
  const lista: { comando: string; pre: string[]; etiqueta: string }[] = [];
  if (e.env.FURNUS_PYTHON) lista.push({ comando: e.env.FURNUS_PYTHON, pre: [], etiqueta: "FURNUS_PYTHON" });
  const venv = pythonDeVenv(venvDelKernel(r, e.casa), e.plataforma);
  if (existsSync(venv)) lista.push({ comando: venv, pre: [], etiqueta: "el entorno virtual de Furnus" });
  if (e.plataforma === "win32") lista.push({ comando: "py", pre: ["-3"], etiqueta: "py -3" }, { comando: "python", pre: [], etiqueta: "python" });
  else lista.push({ comando: "python3", pre: [], etiqueta: "python3" }, { comando: "python", pre: [], etiqueta: "python" });
  return lista;
}

interface PythonElegido {
  comando: string;
  pre: string[];
  etiqueta: string;
  version: string;
}

async function buscarPython(c: ContextoDoctor): Promise<{ elegido: PythonElegido | null; viejos: string[] }> {
  const viejos: string[] = [];
  for (const cand of candidatosPython(c)) {
    const r = await c.ejecutar(cand.comando, [...cand.pre, "-c", SCRIPT_VERSION], { timeoutMs: 15000 });
    const version = r.codigo === 0 ? r.stdout.trim() : "";
    if (!/^\d+\.\d+\.\d+$/.test(version)) continue;
    if (menorQue(version, MINIMO_PYTHON)) {
      viejos.push(`${cand.etiqueta} es ${version}`);
      continue;
    }
    return { elegido: { ...cand, version }, viejos };
  }
  return { elegido: null, viejos };
}

function dependenciasDelKernel(kernelDir: string): string[] {
  try {
    const t = readFileSync(join(kernelDir, "pyproject.toml"), "utf8");
    const m = /^dependencies\s*=\s*\[([^\]]*)\]/m.exec(t);
    const deps = m?.[1]?.match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1));
    if (deps?.length) return deps;
  } catch {
    /* sin pyproject: se usan las de siempre */
  }
  return ["build123d>=0.9", "numpy", "pillow>=10.1"];
}

/** Crea el entorno virtual y le instala lo que necesita el kernel. Devuelve un error legible, o null si salió bien. */
async function instalarKernel(c: ContextoDoctor, base: PythonElegido, salida: Salida): Promise<string | null> {
  const venv = venvDelKernel(c.runtime, c.entorno.casa);
  const py = pythonDeVenv(venv, c.entorno.plataforma);
  if (!existsSync(py)) {
    salida.linea(`Creando el entorno virtual en ${venv} …`);
    const r = await c.ejecutar(base.comando, [...base.pre, "-m", "venv", venv], { timeoutMs: 120000 });
    if (r.codigo !== 0) {
      const sinVenv = /ensurepip|No module named venv/i.test(r.stderr);
      return `No pude crear el entorno virtual: ${(r.stderr || r.stdout).trim().slice(-300)}${sinVenv ? " (en Debian/Ubuntu falta el paquete python3-venv)" : ""}`;
    }
  }
  const deps = dependenciasDelKernel(c.runtime.kernelDir);
  salida.linea(`Instalando ${deps.join(", ")} (puede tardar varios minutos: build123d trae OpenCascade) …`);
  const r = await c.ejecutar(py, ["-m", "pip", "install", "--disable-pip-version-check", ...deps], { timeoutMs: 20 * 60 * 1000, mostrar: true });
  if (r.codigo !== 0) {
    return `pip no pudo instalar las dependencias: ${(r.stderr || r.stdout).trim().slice(-400)}. Si dice que no hay una versión compatible, probá con Python 3.12 (build123d todavía no soporta las versiones más nuevas).`;
  }
  return null;
}

async function chequearPython(c: ContextoDoctor): Promise<{ chequeos: Chequeo[]; python: PythonElegido | null }> {
  const { elegido, viejos } = await buscarPython(c);
  if (!elegido) {
    const detalle = viejos.length ? `Encontré Python pero es anterior a 3.11 (${viejos.join("; ")}).` : "No encontré Python.";
    return { chequeos: [{ id: "python", titulo: "Python 3.11 o más", estado: "falla", detalle, arreglo: ayudaInstalarPython(c.entorno.plataforma) }], python: null };
  }
  return { chequeos: [{ id: "python", titulo: "Python 3.11 o más", estado: "ok", detalle: `${elegido.version} (${elegido.etiqueta})` }], python: elegido };
}

async function chequearBuild123d(c: ContextoDoctor, py: PythonElegido): Promise<Chequeo> {
  const r = await c.ejecutar(py.comando, [...py.pre, "-c", SCRIPT_BUILD123D], { timeoutMs: 120000, cwd: c.runtime.kernelDir });
  if (r.codigo === 0) return { id: "build123d", titulo: "build123d (kernel de geometría)", estado: "ok", detalle: `versión ${r.stdout.trim()}` };
  const falta = /No module named '?(\w+)/.exec(r.stderr)?.[1];
  const venv = venvDelKernel(c.runtime, c.entorno.casa);
  const pipVenv = pythonDeVenv(venv, c.entorno.plataforma);
  return {
    id: "build123d",
    titulo: "build123d (kernel de geometría)",
    estado: "falla",
    detalle: falta ? `Falta el módulo de Python «${falta}».` : `No se pudo importar build123d: ${r.stderr.trim().slice(-200) || "sin detalle"}`,
    arreglo: [
      "Lo más simple: furnus doctor --instalar   (crea un entorno virtual e instala todo)",
      `A mano: ${py.comando} ${[...py.pre, "-m", "venv", `"${venv}"`].join(" ")}  y después  "${pipVenv}" -m pip install ${dependenciasDelKernel(c.runtime.kernelDir).map((d) => `"${d}"`).join(" ")}`,
    ],
  };
}

async function chequearClaude(c: ContextoDoctor): Promise<Chequeo[]> {
  const e = c.entorno;
  const bin = e.env.FURNUS_CLAUDE_BIN && existsSync(e.env.FURNUS_CLAUDE_BIN) ? e.env.FURNUS_CLAUDE_BIN : buscarEjecutable("claude", e, carpetasExtraCli(e));
  if (!bin) {
    return [
      {
        id: "claude",
        titulo: "Claude Code (CLI `claude`)",
        estado: "aviso",
        detalle: "No está instalado. Solo hace falta para el chat del visor; si usás Claude Desktop u otro cliente MCP, podés ignorarlo.",
        arreglo: [...ayudaInstalarClaude(e.plataforma), "Después: claude auth login"],
      },
    ];
  }
  // Sin claves: el chat usa la suscripción de la persona, así que la comprobación tampoco las usa.
  const env = { ...e.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  const v = await c.ejecutar(bin, ["--version"], { timeoutMs: 20000, env });
  const claude: Chequeo = { id: "claude", titulo: "Claude Code (CLI `claude`)", estado: "ok", detalle: `${v.stdout.trim() || "instalado"} (${bin})` };
  if (v.codigo !== 0) {
    return [{ ...claude, estado: "aviso", detalle: `Está en ${bin} pero no se pudo ejecutar: ${(v.stderr || "sin detalle").trim().slice(-200)}`, arreglo: ["Reinstalalo: " + (ayudaInstalarClaude(e.plataforma)[0] ?? "")] }];
  }
  const a = await c.ejecutar(bin, ["auth", "status"], { timeoutMs: 20000, env });
  let logueado: boolean | null = null;
  try {
    const j = JSON.parse(a.stdout) as { loggedIn?: boolean };
    if (typeof j.loggedIn === "boolean") logueado = j.loggedIn;
  } catch {
    /* un CLI viejo sin `auth status` */
  }
  if (logueado === false || (logueado === null && a.codigo !== 0 && a.codigo !== null)) {
    return [claude, { id: "login", titulo: "Sesión de Claude Code", estado: "aviso", detalle: "Claude Code está instalado pero no tiene la sesión iniciada.", arreglo: ["Abrí una terminal y corré: claude auth login"] }];
  }
  return [claude, { id: "login", titulo: "Sesión de Claude Code", estado: "ok", detalle: logueado ? "sesión iniciada" : "no pude confirmarlo (CLI viejo); si el chat falla, corré «claude auth login»" }];
}

async function chequearMcp(c: ContextoDoctor, python: string | null): Promise<Chequeo> {
  const tmp = mkdtempSync(join(tmpdir(), "furnus-doctor-"));
  try {
    const env: NodeJS.ProcessEnv = { ...c.entorno.env, FURNUS_HOME: tmp, FURNUS_API_PORT: "1" };
    if (python) env.FURNUS_PYTHON = python;
    if (c.runtime.modo === "empaquetado") env.FURNUS_KERNEL_DIR = c.runtime.kernelDir;
    const r = await c.sondear({ comando: c.runtime.nodo, args: c.runtime.argsMcp, env, timeoutMs: 30000 });
    if (!r.ok) {
      return {
        id: "mcp",
        titulo: "El servidor MCP responde",
        estado: "falla",
        detalle: `No respondió: ${r.error ?? "sin detalle"}`,
        arreglo: [
          c.runtime.modo === "repo" ? `Corré «pnpm install» en ${c.runtime.raiz} y probá de nuevo.` : "Reinstalá el paquete: npm install -g furnus@latest",
          `Para ver el error completo: ${c.runtime.nodo} ${c.runtime.argsMcp.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
        ],
      };
    }
    const faltan = HERRAMIENTAS_ESPERADAS.filter((t) => !r.herramientas.includes(t));
    if (faltan.length) {
      return { id: "mcp", titulo: "El servidor MCP responde", estado: "falla", detalle: `Responde pero le faltan herramientas: ${faltan.join(", ")}.`, arreglo: ["Actualizá Furnus a la última versión y corré «furnus init» de nuevo."] };
    }
    return { id: "mcp", titulo: "El servidor MCP responde", estado: "ok", detalle: `${r.herramientas.length} herramientas: ${[...r.herramientas].sort().join(", ")}` };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function chequearRegistro(c: ContextoDoctor): Chequeo {
  const destinos = detectar(c.entorno);
  if (destinos.length === 0) {
    return { id: "registro", titulo: "Registrado en tus clientes", estado: "aviso", detalle: "No encontré Claude Desktop ni Claude Code en esta máquina.", arreglo: ["Instalá alguno de los dos y corré «furnus init»."] };
  }
  const lineas: string[] = [];
  let todoOk = true;
  for (const d of destinos) {
    const nombre = NOMBRE_CLIENTE[d.cliente];
    let entrada: { command?: string; args?: string[] } | undefined;
    try {
      entrada = (JSON.parse(readFileSync(d.archivo, "utf8")) as { mcpServers?: Record<string, { command?: string; args?: string[] }> }).mcpServers?.[NOMBRE_SERVIDOR];
    } catch {
      /* no existe o no es JSON */
    }
    if (!entrada) {
      todoOk = false;
      lineas.push(`${nombre}: sin registrar`);
    } else if (JSON.stringify(entrada.args) !== JSON.stringify(c.runtime.argsMcp) || entrada.command !== c.runtime.nodo) {
      todoOk = false;
      lineas.push(`${nombre}: registrado con otra ruta (¿se movió o actualizó Furnus?)`);
    } else lineas.push(`${nombre}: registrado`);
  }
  return todoOk
    ? { id: "registro", titulo: "Registrado en tus clientes", estado: "ok", detalle: lineas.join("; ") }
    : { id: "registro", titulo: "Registrado en tus clientes", estado: "aviso", detalle: lineas.join("; "), arreglo: ["Corré: furnus init"] };
}

export async function doctor(c: ContextoDoctor, salida: Salida): Promise<{ chequeos: Chequeo[]; fallas: number }> {
  const chequeos: Chequeo[] = [];
  const mostrar = (ch: Chequeo) => {
    const marca = ch.estado === "ok" ? "✓" : ch.estado === "aviso" ? "!" : "✗";
    salida.linea(`${marca} ${ch.titulo}: ${ch.detalle}`);
    for (const paso of ch.arreglo ?? []) salida.linea(`    → ${paso}`);
    chequeos.push(ch);
  };

  salida.linea("Furnus doctor");
  salida.linea("");

  const nodoOk = !menorQue(c.versionNode, [20, 0]);
  mostrar({
    id: "node",
    titulo: "Node 20 o más",
    estado: nodoOk ? "ok" : "falla",
    detalle: c.versionNode,
    ...(nodoOk ? {} : { arreglo: ["Instalá Node 20 o más desde https://nodejs.org (o con nvm: nvm install 22)."] }),
  });

  const resultadoPython = await chequearPython(c);
  resultadoPython.chequeos.forEach(mostrar);
  let python = resultadoPython.python;

  if (python) {
    let b = await chequearBuild123d(c, python);
    if (b.estado === "falla" && c.instalar) {
      const error = await instalarKernel(c, python, salida);
      if (error) b = { ...b, detalle: error };
      else {
        // Con el venv recién creado, el Python a usar es el del venv.
        python = (await buscarPython(c)).elegido ?? python;
        b = await chequearBuild123d(c, python);
      }
    }
    mostrar(b);
  } else {
    mostrar({ id: "build123d", titulo: "build123d (kernel de geometría)", estado: "falla", detalle: "No se puede comprobar sin Python.", arreglo: ["Resolvé primero lo de Python."] });
  }

  (await chequearClaude(c)).forEach(mostrar);

  const venvPy = pythonDeVenv(venvDelKernel(c.runtime, c.entorno.casa), c.entorno.plataforma);
  mostrar(await chequearMcp(c, existsSync(venvPy) ? venvPy : (c.entorno.env.FURNUS_PYTHON ?? null)));
  mostrar(chequearRegistro(c));

  const fallas = chequeos.filter((x) => x.estado === "falla").length;
  const avisos = chequeos.filter((x) => x.estado === "aviso").length;
  salida.linea("");
  if (fallas > 0) salida.linea(`${fallas} ${fallas === 1 ? "problema" : "problemas"} para resolver${avisos ? ` y ${avisos} ${avisos === 1 ? "aviso" : "avisos"}` : ""}. Seguí los pasos de arriba y volvé a correr «furnus doctor».`);
  else if (avisos > 0) salida.linea(`Todo lo necesario funciona. ${avisos} ${avisos === 1 ? "aviso" : "avisos"} opcional${avisos === 1 ? "" : "es"}.`);
  else salida.linea("Todo en orden.");
  return { chequeos, fallas };
}
