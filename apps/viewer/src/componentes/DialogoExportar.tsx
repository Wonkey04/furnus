import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Icono, ICONOS } from "./Basicos";

interface Props {
  abierto: boolean;
  piezaId: string;
  nombre: string;
  exportable: { ok: true } | { ok: false; motivos: string[] };
  alCerrar: () => void;
}

export function DialogoExportar({ abierto, piezaId, nombre, exportable, alCerrar }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [unidad, setUnidad] = useState<"mm" | "in">("mm");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) {
      setError(null);
      d.showModal();
    }
    if (!abierto && d.open) d.close();
  }, [abierto]);

  const descargar = async () => {
    setTrabajando(true);
    setError(null);
    try {
      const { blob, nombre: archivo } = await api.exportar(piezaId, "step", unidad);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = archivo;
      a.click();
      URL.revokeObjectURL(url);
      alCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo exportar.");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <dialog ref={ref} className="dialogo vidrio" onClose={alCerrar} aria-labelledby="t-exportar">
      <div className="fila">
        <div>
          <h2 id="t-exportar">Exportar pieza</h2>
          <p className="secundario">{nombre} · rama principal</p>
        </div>
        <span className="espacio" />
        <button type="button" className="btn btn-enlace" aria-label="Cerrar" onClick={alCerrar}><Icono d={ICONOS.cerrar} /></button>
      </div>

      <fieldset className="grupo">
        <legend className="etiqueta-panel">Formato</legend>
        <label className="opcion seleccionada">
          <input type="radio" name="formato" checked readOnly />
          <span><strong>STEP</strong> <span className="chip">Recomendado</span><br /><span className="ayuda">Abrir en otro CAD</span></span>
        </label>
        <label className="opcion deshabilitada">
          <input type="radio" name="formato" disabled />
          <span><strong>STL</strong> <span className="chip chip-punteado">Próximamente</span><br /><span className="ayuda">Imprimir en 3D</span></span>
        </label>
        <label className="opcion deshabilitada">
          <input type="radio" name="formato" disabled />
          <span><strong>3MF</strong> <span className="chip chip-punteado">Próximamente</span><br /><span className="ayuda">Imprimir con unidades</span></span>
        </label>
      </fieldset>

      <fieldset className="grupo">
        <legend className="etiqueta-panel">Unidad</legend>
        <div className="fila">
          <label className={`opcion${unidad === "mm" ? " seleccionada" : ""}`}>
            <input type="radio" name="unidad" checked={unidad === "mm"} onChange={() => setUnidad("mm")} /> Milímetros
          </label>
          <label className={`opcion${unidad === "in" ? " seleccionada" : ""}`}>
            <input type="radio" name="unidad" checked={unidad === "in"} onChange={() => setUnidad("in")} /> Pulgadas
          </label>
        </div>
      </fieldset>

      {exportable.ok ? (
        <p className="fila" role="status"><span className="punto" aria-hidden="true" /> La pieza es válida y se puede exportar.</p>
      ) : (
        <div role="alert" className="apilar">
          <p><span className="etiqueta-error">No se puede exportar</span></p>
          <ul className="motivos">{exportable.motivos.map((m) => <li key={m} className="secundario">{m}</li>)}</ul>
        </div>
      )}
      {error && <p role="alert"><span className="etiqueta-error">Error</span> <span className="secundario">{error}</span></p>}

      <div className="fila acciones-dialogo">
        <span className="espacio" />
        <button type="button" className="btn" onClick={alCerrar}>Cancelar</button>
        <button type="button" className="btn btn-primario" disabled={!exportable.ok || trabajando} onClick={descargar}>
          <Icono d={ICONOS.descargar} /> {trabajando ? "Exportando…" : "Descargar STEP"}
        </button>
      </div>
    </dialog>
  );
}
