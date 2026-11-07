import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ErrorApi, api, useAgente, useEventos, type ResumenPieza } from "../api";
import { Encabezado, Icono, ICONOS } from "../componentes/Basicos";

/** Miniatura isométrica de la caja de la pieza, con los tres grises fijos de BRAND. */
export function Miniatura({ caja }: { caja: [number, number, number] | null }) {
  const [x, y, z] = caja ?? [60, 40, 24];
  const c = Math.cos(Math.PI / 6);
  const s = 0.5;
  // Se proyectan las 8 esquinas, se escala para que entre en 160×120 y se centra.
  const crudo = (a: number, b: number, h: number): [number, number] => [(a - b) * c, (a + b) * s - h];
  const esquinas = [0, x].flatMap((a) => [0, y].flatMap((b) => [0, z].map((h) => crudo(a, b, h))));
  const xs = esquinas.map((e) => e[0]);
  const ys = esquinas.map((e) => e[1]);
  const k = Math.min(128 / (Math.max(...xs) - Math.min(...xs)), 88 / (Math.max(...ys) - Math.min(...ys)));
  const dx = 80 - ((Math.max(...xs) + Math.min(...xs)) / 2) * k;
  const dy = 60 - ((Math.max(...ys) + Math.min(...ys)) / 2) * k;
  const P = (a: number, b: number, h: number): [number, number] => {
    const [px, py] = crudo(a, b, h);
    return [Number((px * k + dx).toFixed(1)), Number((py * k + dy).toFixed(1))];
  };
  const pts = (...p: [number, number][]) => p.map((q) => q.join(",")).join(" ");
  return (
    <svg viewBox="0 0 160 120" role="img" aria-label={caja ? `Pieza de ${x} por ${y} por ${z} milímetros` : "Pieza sin ejecutar"} className="miniatura">
      <polygon points={pts(P(0, 0, z), P(x, 0, z), P(x, y, z), P(0, y, z))} fill="var(--piece-light)" />
      <polygon points={pts(P(0, y, z), P(x, y, z), P(x, y, 0), P(0, y, 0))} fill="var(--piece-mid)" />
      <polygon points={pts(P(x, 0, z), P(x, y, z), P(x, y, 0), P(x, 0, 0))} fill="var(--piece-dark)" />
      <g fill="none" stroke="var(--ink)" strokeWidth="1.2" strokeLinejoin="round">
        <polygon points={pts(P(0, 0, z), P(x, 0, z), P(x, y, z), P(0, y, z))} />
        <polygon points={pts(P(0, y, z), P(x, y, z), P(x, y, 0), P(0, y, 0))} />
        <polygon points={pts(P(x, 0, z), P(x, y, z), P(x, y, 0), P(x, 0, 0))} />
      </g>
    </svg>
  );
}

function cuando(iso: string): string {
  const d = new Date(iso);
  const hoy = new Date();
  const dias = Math.floor((new Date(hoy.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (dias <= 0) return "editada hoy";
  if (dias === 1) return "editada ayer";
  return `editada el ${d.toLocaleDateString("es-AR")}`;
}

export function MisPiezas() {
  const agente = useAgente();
  const navegar = useNavigate();
  const [piezas, setPiezas] = useState<ResumenPieza[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api.listar().then((p) => { setPiezas(p); setError(null); }).catch((e: unknown) => setError(e instanceof Error ? e.message : "Error."));
  }, []);
  useEffect(cargar, [cargar]);
  useEventos((e) => { if (e.tipo !== "agente") cargar(); });

  const nueva = async () => {
    try {
      const p = await api.crear();
      navegar(`/pieza/${p.id}`);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No se pudo crear la pieza.");
    }
  };

  return (
    <>
      <Encabezado agente={agente} />
      <main className="contenido">
        <div className="fila titulo-pantalla">
          <div>
            <h1>Mis piezas</h1>
            <p className="secundario">Guardadas en este equipo.</p>
          </div>
          <span className="espacio" />
          <button type="button" className="btn btn-primario" onClick={nueva}><Icono d={ICONOS.mas} /> Nueva pieza</button>
        </div>

        {!agente.conectado && (
          <aside className="banner vidrio" role="note">
            <p>Todavía no conectaste un agente. Sin agente podés ver y ajustar tus piezas, pero no pedirle cambios.</p>
            <Link to="/conectar" className="btn">Conectar agente</Link>
          </aside>
        )}

        {error && <p role="alert"><span className="etiqueta-error">Error</span> <span className="secundario">{error}</span></p>}

        {piezas === null && !error && <p className="secundario" role="status">Cargando piezas…</p>}

        {piezas?.length === 0 && (
          <section className="vacio vidrio">
            <h2>Todavía no hay piezas</h2>
            <p className="secundario">Creá una pieza y pedile a tu agente que la diseñe, o conectá un agente primero.</p>
          </section>
        )}

        {piezas && piezas.length > 0 && (
          <ul className="grilla">
            {piezas.map((p) => (
              <li key={p.id}>
                <Link to={`/pieza/${p.id}`} className="tarjeta vidrio">
                  <Miniatura caja={p.caja} />
                  <strong>{p.nombre}</strong>
                  <span className="ayuda">{p.operaciones} {p.operaciones === 1 ? "operación" : "operaciones"} · {cuando(p.editadaEn)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
