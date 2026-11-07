import type { RespuestaKernel } from "../puertos/index.js";

/**
 * Batería de contrato entre dominio y kernel. La misma lista corre contra el KernelFalso
 * (que repite `respuestaFalsa`) y contra el kernel real (que tiene que cumplir `espera`).
 */
export interface CasoContrato {
  nombre: string;
  script: string;
  parametros?: Record<string, number>;
  espera: {
    ok: boolean;
    valida?: boolean;
    caja?: [number, number, number];
    errorTipo?: string;
    errorContiene?: string;
    parametros?: string[];
  };
  respuestaFalsa: RespuestaKernel;
}

const PARAMS = [
  { nombre: "largo", valor: 60, min: 10, max: 200, unidad: "mm" },
  { nombre: "ancho", valor: 40, min: 10, max: 200, unidad: "mm" },
];

export const SCRIPT_CAJA = `from furnus import param, sel, validar
from build123d import *

largo = param("largo", 60, min=10, max=200, unidad="mm")
ancho = param("ancho", 40, min=10, max=200, unidad="mm")

with BuildPart() as pieza:
    Box(largo, ancho, 24)
    fillet(sel.aristas(pieza, "superiores"), radius=2)

resultado = pieza.part
validar(resultado)
`;

const vacia = { malla: null, medidas: null, valida: false, motivos: [], parametros: [] };

export const CASOS_CONTRATO: CasoContrato[] = [
  {
    nombre: "script válido devuelve medidas, validez y parámetros",
    script: SCRIPT_CAJA,
    espera: { ok: true, valida: true, caja: [60, 40, 24], parametros: ["largo", "ancho"] },
    respuestaFalsa: {
      ok: true,
      malla: { formato: "glb", ruta: "pieza.glb" },
      medidas: { caja: [60, 40, 24], volumen: 57000, area: 8000 },
      valida: true,
      motivos: [],
      parametros: PARAMS,
      error: null,
    },
  },
  {
    nombre: "un parámetro cambiado cambia la pieza",
    script: SCRIPT_CAJA,
    parametros: { largo: 100 },
    espera: { ok: true, valida: true, caja: [100, 40, 24] },
    respuestaFalsa: {
      ok: true,
      malla: { formato: "glb", ruta: "pieza.glb" },
      medidas: { caja: [100, 40, 24], volumen: 95000, area: 11000 },
      valida: true,
      motivos: [],
      parametros: [{ ...PARAMS[0]!, valor: 100 }, PARAMS[1]!],
      error: null,
    },
  },
  {
    nombre: "parámetro fuera de rango explica el rango",
    script: SCRIPT_CAJA,
    parametros: { largo: 500 },
    espera: { ok: false, errorTipo: "ParametroFueraDeRango", errorContiene: "entre 10 y 200" },
    respuestaFalsa: {
      ok: false,
      ...vacia,
      error: {
        tipo: "ParametroFueraDeRango",
        mensaje: "El parámetro «largo» vale 500 mm y tiene que estar entre 10 y 200 mm.",
        linea: 4,
        traceback: "…",
      },
    },
  },
  {
    nombre: "error de ejecución devuelve tipo y línea",
    script: "from build123d import *\nx = 1\ny = x / 0\nresultado = None\n",
    espera: { ok: false, errorTipo: "ZeroDivisionError" },
    respuestaFalsa: {
      ok: false,
      ...vacia,
      error: { tipo: "ZeroDivisionError", mensaje: "division by zero", linea: 3, traceback: "línea 3: y = x / 0" },
    },
  },
  {
    nombre: "import prohibido se rechaza antes de correr",
    script: "import os\nresultado = None\n",
    espera: { ok: false, errorTipo: "ScriptProhibido", errorContiene: "Solo se permiten" },
    respuestaFalsa: {
      ok: false,
      ...vacia,
      error: {
        tipo: "ScriptProhibido",
        mensaje: "No se puede importar «os». Solo se permiten: build123d, furnus, math.",
        linea: 1,
        traceback: "…",
      },
    },
  },
  {
    nombre: "pieza con dos sólidos sueltos es inválida pero se ejecuta",
    script:
      "from build123d import *\nwith BuildPart() as pieza:\n    Box(10, 10, 10)\n    with Locations((50, 0, 0)):\n        Box(10, 10, 10)\nresultado = pieza.part\n",
    espera: { ok: true, valida: false },
    respuestaFalsa: {
      ok: true,
      malla: { formato: "glb", ruta: "pieza.glb" },
      medidas: { caja: [70, 10, 10], volumen: 2000, area: 1200 },
      valida: false,
      motivos: ["La pieza tiene 2 sólidos separados; en el prototipo tiene que ser uno solo."],
      parametros: [],
      error: null,
    },
  },
];

export function verificarRespuesta(caso: CasoContrato, r: RespuestaKernel): string[] {
  const fallas: string[] = [];
  const e = caso.espera;
  if (r.ok !== e.ok) fallas.push(`ok: esperaba ${e.ok} y llegó ${r.ok}`);
  if (e.valida !== undefined && r.valida !== e.valida) fallas.push(`valida: esperaba ${e.valida} y llegó ${r.valida}`);
  if (e.caja) {
    const caja = r.medidas?.caja;
    if (!caja || caja.some((v, i) => Math.abs(v - e.caja![i]!) > 0.01)) {
      fallas.push(`caja: esperaba ${JSON.stringify(e.caja)} y llegó ${JSON.stringify(caja)}`);
    }
  }
  if (e.ok && !r.malla) fallas.push("falta la malla");
  if (e.ok && r.error) fallas.push("ok=true pero hay error");
  if (!e.ok && !r.error) fallas.push("ok=false pero no hay error");
  if (e.errorTipo && r.error?.tipo !== e.errorTipo) fallas.push(`error.tipo: esperaba ${e.errorTipo} y llegó ${r.error?.tipo}`);
  if (e.errorContiene && !r.error?.mensaje.includes(e.errorContiene)) {
    fallas.push(`error.mensaje no contiene «${e.errorContiene}»: ${r.error?.mensaje}`);
  }
  if (e.parametros) {
    const nombres = r.parametros.map((p) => p.nombre);
    if (JSON.stringify(nombres) !== JSON.stringify(e.parametros)) fallas.push(`parámetros: ${JSON.stringify(nombres)}`);
  }
  return fallas;
}
