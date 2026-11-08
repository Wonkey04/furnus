import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Entorno } from "./entorno.js";
import { ConfigInvalida, fusionar, type EstadoFusion } from "./mcp-config.js";
import { detectar, NOMBRE_CLIENTE, type Cliente } from "./rutas.js";
import { entradaMcp, pythonDeVenv, venvDelKernel, type Runtime } from "./runtime.js";
import type { Salida } from "./salida.js";

export interface OpcionesInit {
  /** Registrar solo en un cliente. */
  solo?: Cliente;
  /** Muestra qué cambiaría sin escribir nada. */
  simular?: boolean;
  /** Para que los tests fijen el nombre de la copia de seguridad. */
  ahora?: () => Date;
}

export interface InformeDestino {
  cliente: Cliente;
  archivo: string;
  estado: EstadoFusion | "error";
  respaldo?: string;
  cambios: string[];
  error?: string;
}

export interface ResultadoInit {
  informes: InformeDestino[];
  /** Clientes que se pidieron o buscaron y no están en esta máquina. */
  noEncontrados: Cliente[];
  /** `true` si no hay un Python del kernel listo todavía (se resuelve con `doctor --instalar`). */
  kernelPendiente: boolean;
}

const sello = (d: Date) => d.toISOString().replace(/\D/g, "").slice(0, 14);

/** Escribe en un archivo temporal de la misma carpeta y renombra: si algo falla a mitad de camino, el original queda entero. */
function escribirAtomico(archivo: string, texto: string): void {
  mkdirSync(dirname(archivo), { recursive: true });
  const tmp = `${archivo}.furnus-tmp-${process.pid}`;
  try {
    writeFileSync(tmp, texto, "utf8");
    renameSync(tmp, archivo);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

/** Python que se le pasa al MCP por FURNUS_PYTHON: el venv del kernel si existe, o el que ya definió la persona. */
export function pythonParaMcp(r: Runtime, e: Entorno): string | null {
  const venv = pythonDeVenv(venvDelKernel(r, e.casa), e.plataforma);
  if (existsSync(venv)) return venv;
  return e.env.FURNUS_PYTHON && existsSync(e.env.FURNUS_PYTHON) ? e.env.FURNUS_PYTHON : null;
}

export function init(e: Entorno, r: Runtime, salida: Salida, op: OpcionesInit = {}): ResultadoInit {
  const ahora = op.ahora ?? (() => new Date());
  const python = pythonParaMcp(r, e);
  const entrada = entradaMcp(r, python);

  const detectados = detectar(e);
  const buscados: Cliente[] = op.solo ? [op.solo] : ["desktop", "code"];
  const destinos = detectados.filter((d) => buscados.includes(d.cliente));
  const noEncontrados = buscados.filter((c) => !destinos.some((d) => d.cliente === c));

  salida.linea(op.simular ? "Furnus init (simulación: no se escribe nada)" : "Furnus init");
  salida.linea(`Servidor MCP: ${entrada.command} ${entrada.args.join(" ")}`);
  salida.linea("");

  const informes: InformeDestino[] = [];
  for (const d of destinos) {
    const nombre = NOMBRE_CLIENTE[d.cliente];
    const informe: InformeDestino = { cliente: d.cliente, archivo: d.archivo, estado: "sin_cambios", cambios: [] };
    try {
      const original = d.existe ? readFileSync(d.archivo, "utf8") : null;
      const fusion = fusionar(original, entrada);
      informe.estado = fusion.estado;
      informe.cambios = fusion.cambios;
      if (fusion.estado !== "sin_cambios" && !op.simular) {
        if (d.existe) {
          informe.respaldo = `${d.archivo}.furnus-backup-${sello(ahora())}`;
          copyFileSync(d.archivo, informe.respaldo);
        }
        escribirAtomico(d.archivo, fusion.texto);
        // Se relee: si lo escrito no es un JSON válido, se vuelve al original.
        try {
          JSON.parse(readFileSync(d.archivo, "utf8"));
        } catch {
          if (informe.respaldo) copyFileSync(informe.respaldo, d.archivo);
          else rmSync(d.archivo, { force: true });
          throw new Error("lo escrito no quedó como JSON válido; se restauró el original");
        }
      }
    } catch (err) {
      informe.estado = "error";
      informe.error = err instanceof ConfigInvalida ? `${err.message}. No toqué nada; arreglalo a mano o borrá el archivo.` : err instanceof Error ? err.message : String(err);
    }
    informes.push(informe);

    salida.linea(`${nombre}: ${informe.archivo}`);
    if (informe.estado === "error") salida.linea(`  ✗ ${informe.error}`);
    else if (informe.estado === "sin_cambios") salida.linea("  ✓ ya estaba registrado, sin cambios");
    else {
      salida.linea(`  ${op.simular ? "→ haría" : "✓ hecho"}:`);
      for (const c of informe.cambios) salida.linea(`    - ${c}`);
      if (informe.respaldo) salida.linea(`    - copia de seguridad en ${informe.respaldo}`);
      else if (!d.existe) salida.linea(op.simular ? "    - el archivo no existe: lo crearía" : "    - el archivo no existía: lo creé");
    }
  }

  for (const c of noEncontrados) {
    salida.linea(`${NOMBRE_CLIENTE[c]}: no lo encontré en esta máquina, lo salteo.`);
  }

  const kernelPendiente = python === null;
  salida.linea("");
  if (informes.some((i) => i.estado === "creado" || i.estado === "actualizado") && !op.simular) {
    salida.linea("Reiniciá Claude Desktop (cerralo del todo, también en la bandeja) o abrí una sesión nueva de Claude Code para que cargue el servidor.");
  }
  if (kernelPendiente) {
    salida.linea("El kernel de Python todavía no está instalado: corré «furnus doctor --instalar» (o «furnus doctor» para ver el detalle).");
  } else {
    salida.linea("Para comprobar que todo responde: furnus doctor");
  }
  if (destinos.length === 0) {
    salida.linea("No encontré ni Claude Desktop ni Claude Code. Instalá alguno y volvé a correr «furnus init».");
  }
  return { informes, noEncontrados, kernelPendiente };
}
