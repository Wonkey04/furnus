import { useEffect, useState } from "react";
import type { Actividad, Parametro, Pieza } from "@furnus/core";
import { Icono, ICONOS } from "./Basicos";

export function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

export function ArbolRevisiones({
  pieza,
  puedeDeshacer,
  puedeRehacer,
  ocupado,
  alIr,
}: {
  pieza: Pieza;
  puedeDeshacer: boolean;
  puedeRehacer: boolean;
  ocupado: boolean;
  alIr: (destino: "deshacer" | "rehacer" | number) => void;
}) {
  return (
    <section className="panel vidrio" aria-labelledby="t-arbol">
      <h2 className="etiqueta-panel" id="t-arbol">Árbol de features</h2>
      {pieza.revisiones.length === 0 ? (
        <p className="ayuda">Todavía no hay revisiones. Aparecen cuando el agente ejecuta un script.</p>
      ) : (
        <ol className="lista-revisiones">
          {[...pieza.revisiones].reverse().map((r) => {
            const activa = r.numero === pieza.revisionActual;
            return (
              <li key={r.numero}>
                <button
                  type="button"
                  className={`revision${activa ? " activa" : ""}`}
                  aria-current={activa ? "step" : undefined}
                  disabled={ocupado}
                  onClick={() => !activa && alIr(r.numero)}
                >
                  <span className={activa ? "punto" : "punto hueco"} aria-hidden="true" />
                  <span className="mono">{String(r.numero).padStart(2, "0")}</span>
                  <span>Revisión {r.numero}</span>
                  <span className="ayuda">{r.origen === "agente" ? "agente" : "persona"} · {hora(r.creadaEn)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <div className="fila">
        <button type="button" className="btn" disabled={!puedeDeshacer || ocupado} onClick={() => alIr("deshacer")}>
          <Icono d={ICONOS.deshacer} /> Deshacer
        </button>
        <button type="button" className="btn" disabled={!puedeRehacer || ocupado} onClick={() => alIr("rehacer")}>
          <Icono d={ICONOS.rehacer} /> Rehacer
        </button>
      </div>
    </section>
  );
}

function CampoParametro({
  p,
  ocupado,
  error,
  alCambiar,
}: {
  p: Parametro;
  ocupado: boolean;
  error: string | null;
  alCambiar: (nombre: string, valor: number) => void;
}) {
  const [texto, setTexto] = useState(String(p.valor));
  useEffect(() => setTexto(String(p.valor)), [p.valor]);
  const confirmar = () => {
    const n = Number(texto.replace(",", "."));
    if (texto.trim() !== "" && Number.isFinite(n) && n !== p.valor) alCambiar(p.nombre, n);
    else setTexto(String(p.valor));
  };
  const rango = p.min !== null && p.max !== null ? `${p.min} a ${p.max} ${p.unidad}` : p.unidad;
  return (
    <div className="parametro">
      <label htmlFor={`par-${p.nombre}`} className="mono">{p.nombre}</label>
      <div className="parametro-campo">
        <input
          id={`par-${p.nombre}`}
          className="input"
          inputMode="decimal"
          value={texto}
          disabled={ocupado}
          aria-invalid={error ? true : undefined}
          aria-describedby={`ayuda-${p.nombre}`}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur())}
        />
        <span className="unidad mono">{p.unidad}</span>
      </div>
      <p className="ayuda mono" id={`ayuda-${p.nombre}`}>{rango}</p>
      {error && <p className="error-campo" role="alert"><span className="etiqueta-error">Error</span> <span className="secundario">{error}</span></p>}
    </div>
  );
}

export function PanelParametros({
  parametros,
  ocupado,
  errores,
  alCambiar,
}: {
  parametros: Parametro[];
  ocupado: boolean;
  errores: Record<string, string>;
  alCambiar: (nombre: string, valor: number) => void;
}) {
  return (
    <section className="panel vidrio" aria-labelledby="t-param">
      <h2 className="etiqueta-panel" id="t-param">Parámetros</h2>
      {parametros.length === 0 ? (
        <p className="ayuda">El script no declara parámetros. Pedile al agente que use param() para lo que quieras ajustar.</p>
      ) : (
        <div className="apilar">
          {parametros.map((p) => (
            <CampoParametro key={p.nombre} p={p} ocupado={ocupado} error={errores[p.nombre] ?? null} alCambiar={alCambiar} />
          ))}
          <p className="ayuda">Al cambiar un valor, la pieza se regenera.</p>
        </div>
      )}
    </section>
  );
}

const HERRAMIENTA: Record<string, string> = {
  ejecutar_script: "ejecutar_script",
  cambiar_parametro: "cambiar_parametro",
  cambiar_parametros: "cambiar_parametros",
  medir: "medir",
  renderizar: "renderizar",
  exportar: "exportar",
};

export function ActividadAgente({ actividad }: { actividad: Actividad[] }) {
  const items = [...actividad].reverse().slice(0, 30);
  return (
    <section className="panel vidrio" aria-labelledby="t-act">
      <h2 className="etiqueta-panel" id="t-act">Actividad del agente</h2>
      {items.length === 0 ? (
        <p className="ayuda">Todavía no hubo llamadas.</p>
      ) : (
        <ul className="actividad">
          {items.map((a) => (
            <li key={a.id}>
              <div className="fila">
                {a.estado === "ok" ? (
                  <span className="chip"><span className="punto" aria-hidden="true" />OK</span>
                ) : (
                  <span className="etiqueta-error">Error</span>
                )}
                <span className="mono">{HERRAMIENTA[a.herramienta]}</span>
                <span className="espacio" />
                <span className="ayuda mono">{a.origen === "agente" ? "agente" : "persona"} · {hora(a.en)}</span>
              </div>
              <p className="secundario detalle">{a.detalle}</p>
              {a.estado === "error" && a.traza && (
                <details>
                  <summary className="ayuda">Ver el error completo</summary>
                  <pre className="traza">{a.traza}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
