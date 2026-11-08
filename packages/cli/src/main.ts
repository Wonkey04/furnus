import { leerArgs } from "./args.js";
import { dev, DevNoDisponible } from "./dev.js";
import { doctor } from "./doctor.js";
import { entornoReal } from "./entorno.js";
import { init } from "./init.js";
import { ejecutarReal } from "./proceso.js";
import type { Cliente } from "./rutas.js";
import { resolverRuntime, RuntimeNoEncontrado } from "./runtime.js";
import { salidaConsola } from "./salida.js";
import { sondearMcp } from "./sonda-mcp.js";
import { VERSION } from "./version.js";

const AYUDA = `furnus ${VERSION} — CAD paramétrico para tu agente de IA

Uso: furnus <comando> [opciones]

Comandos:
  init      Registra el servidor MCP de Furnus en Claude Desktop y Claude Code
              --solo desktop|code   registrar en uno solo
              --simular             mostrar qué cambiaría sin escribir nada
  doctor    Revisa Node, Python, build123d, Claude Code y que el MCP responda
              --instalar            crear el entorno virtual e instalar el kernel si falta
  dev       Levanta la API y el visor

  --version, --ayuda`;

async function principal(argv: string[]): Promise<number> {
  const { comando, banderas, valores } = leerArgs(argv);
  if (banderas.has("version") || comando === "version") {
    console.log(VERSION);
    return 0;
  }
  if (!comando || banderas.has("ayuda") || banderas.has("help") || comando === "ayuda" || comando === "help") {
    console.log(AYUDA);
    return comando || banderas.size ? 0 : 1;
  }
  const entorno = entornoReal();
  let runtime;
  try {
    runtime = resolverRuntime();
  } catch (e) {
    if (e instanceof RuntimeNoEncontrado) {
      console.error(e.message);
      return 1;
    }
    throw e;
  }

  if (comando === "init") {
    const solo = valores.get("solo");
    if (solo !== undefined && solo !== "desktop" && solo !== "code") {
      console.error("--solo acepta «desktop» o «code».");
      return 1;
    }
    const r = init(entorno, runtime, salidaConsola, { solo: solo as Cliente | undefined, simular: banderas.has("simular") });
    return r.informes.some((i) => i.estado === "error") ? 1 : 0;
  }
  if (comando === "doctor") {
    const r = await doctor({ entorno, runtime, ejecutar: ejecutarReal, sondear: sondearMcp, versionNode: process.versions.node, instalar: banderas.has("instalar") }, salidaConsola);
    return r.fallas > 0 ? 1 : 0;
  }
  if (comando === "dev") {
    try {
      return await dev(runtime, entorno, salidaConsola);
    } catch (e) {
      if (e instanceof DevNoDisponible) {
        console.error(e.message);
        return 1;
      }
      throw e;
    }
  }
  console.error(`No conozco el comando «${comando}».\n\n${AYUDA}`);
  return 1;
}

principal(process.argv.slice(2)).then(
  (codigo) => process.exit(codigo),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  },
);
