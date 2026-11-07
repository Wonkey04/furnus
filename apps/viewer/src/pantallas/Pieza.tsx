import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorApi, api, useAgente, useEventos, type EstadoPieza } from "../api";
import { Encabezado } from "../componentes/Basicos";
import { DialogoExportar } from "../componentes/DialogoExportar";
import { ActividadAgente, ArbolRevisiones, PanelParametros } from "../componentes/PanelesPieza";
import { VISTAS, Visor3D, type Vista } from "../componentes/Visor3D";

export function PantallaPieza() {
  const { id = "" } = useParams();
  const agente = useAgente();
  const [estado, setEstado] = useState<EstadoPieza | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erroresParam, setErroresParam] = useState<Record<string, string>>({});
  const [errorOperacion, setErrorOperacion] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("iso");
  const [versionVista, setVersionVista] = useState(0);
  const [exportando, setExportando] = useState(false);

  const cargar = useCallback(() => {
    api.estado(id).then((e) => { setEstado(e); setErrorCarga(null); }).catch((e: unknown) => setErrorCarga(e instanceof Error ? e.message : "Error."));
  }, [id]);
  useEffect(cargar, [cargar]);
  useEventos((e) => { if (e.tipo === "pieza_actualizada" && e.piezaId === id) cargar(); });

  if (errorCarga && !estado) {
    return (
      <>
        <Encabezado agente={agente} />
        <main className="contenido">
          <p role="alert"><span className="etiqueta-error">Error</span> <span className="secundario">{errorCarga}</span></p>
          <Link to="/" className="btn">Volver a Mis piezas</Link>
        </main>
      </>
    );
  }
  if (!estado) {
    return (
      <>
        <Encabezado agente={agente} />
        <main className="contenido"><p className="secundario" role="status">Cargando pieza…</p></main>
      </>
    );
  }

  const { pieza } = estado;
  const r = pieza.resultado;
  const medidas = r?.medidas?.caja ?? null;
  const sinScript = pieza.revisiones.length === 0;
  const ultimaActividad = pieza.actividad.at(-1);
  const scriptConError = ultimaActividad?.estado === "error" && ultimaActividad.herramienta === "ejecutar_script" ? ultimaActividad : null;

  const operar = async (f: () => Promise<unknown>, param?: string) => {
    setOcupado(true);
    setErrorOperacion(null);
    if (param) setErroresParam((e) => ({ ...e, [param]: "" }));
    try {
      await f();
    } catch (e) {
      const mensaje = e instanceof ErrorApi ? e.message : "No se pudo completar la operación.";
      if (param) setErroresParam((x) => ({ ...x, [param]: mensaje }));
      else setErrorOperacion(mensaje);
    } finally {
      cargar();
      setOcupado(false);
    }
  };

  const cambiarParametro = (nombre: string, valor: number) =>
    operar(async () => {
      const res = await api.cambiarParametro(id, nombre, valor);
      if (!res.ok) setErroresParam((x) => ({ ...x, [nombre]: res.error?.mensaje ?? "El script no pudo regenerar la pieza." }));
    }, nombre);

  return (
    <>
      <Encabezado
        agente={agente}
        migas={<span className="secundario"><Link to="/">Mis piezas</Link> / <strong>{pieza.nombre}</strong></span>}
        acciones={
          <button type="button" className="btn btn-primario" onClick={() => setExportando(true)} disabled={sinScript}>
            Exportar
          </button>
        }
      />
      <main className="pieza-layout">
        <div className="columna-izq">
          <ArbolRevisiones
            pieza={pieza}
            puedeDeshacer={estado.puedeDeshacer}
            puedeRehacer={estado.puedeRehacer}
            ocupado={ocupado}
            alIr={(d) => operar(() => api.irARevision(id, d))}
          />
        </div>

        <section className="centro vidrio" aria-label="Visor 3D">
          <div className="barra-visor">
            <div className="fila" role="group" aria-label="Vistas">
              {VISTAS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`btn btn-vista${vista === v.id ? " activo" : ""}`}
                  aria-pressed={vista === v.id}
                  onClick={() => { setVista(v.id); setVersionVista((n) => n + 1); }}
                >
                  {v.etiqueta}
                </button>
              ))}
            </div>
            <span className="espacio" />
            <button type="button" className="btn" disabled title="Llega en la fase 02">Medir · Próximamente</button>
            <button type="button" className="btn" disabled title="Llega en la fase 02">Corte · Próximamente</button>
          </div>

          <div className="escenario">
            <Visor3D mallaUrl={estado.mallaUrl} medidas={medidas} vista={vista} versionVista={versionVista} />
            {sinScript && (
              <div className="vacio-pieza" role="status">
                <h2>Esperando al agente</h2>
                <p className="secundario">Esta pieza todavía no tiene script. Pedile a tu agente que la diseñe.</p>
                {!agente.conectado && <Link to="/conectar" className="btn">Conectar agente</Link>}
              </div>
            )}
            {ocupado && <p className="chip chip-punteado estado-flotante" role="status"><span className="punto hueco" aria-hidden="true" />Regenerando…</p>}
          </div>

          <div className="chips-visor">
            {medidas && <span className="chip" aria-label="Dimensiones">{medidas.map((m) => Number(m.toFixed(2))).join(" × ")} mm</span>}
            {r && (
              <span className={`chip${r.valida ? "" : " chip-punteado"}`} role="status">
                <span className={r.valida ? "punto" : "punto hueco"} aria-hidden="true" />
                {r.valida ? "Geometría válida" : "Geometría inválida"}
              </span>
            )}
          </div>

          {r && !r.valida && (
            <div className="aviso" role="alert">
              <span className="etiqueta-error">Pieza inválida</span>
              <ul className="motivos">{r.motivos.map((m) => <li key={m} className="secundario">{m}</li>)}</ul>
              <p className="ayuda">Mientras no sea válida no se puede exportar.</p>
            </div>
          )}

          {scriptConError && (
            <div className="aviso" role="alert">
              <span className="etiqueta-error">Error del script</span>
              <p className="secundario">{scriptConError.detalle}</p>
              {scriptConError.traza && <pre className="traza">{scriptConError.traza}</pre>}
              {!sinScript && <p className="ayuda">Se sigue mostrando la última pieza que funcionó.</p>}
            </div>
          )}
          {errorOperacion && <p className="aviso" role="alert"><span className="etiqueta-error">Error</span> <span className="secundario">{errorOperacion}</span></p>}
        </section>

        <div className="columna-der">
          <PanelParametros parametros={r?.parametros ?? []} ocupado={ocupado} errores={erroresParam} alCambiar={cambiarParametro} />
          <ActividadAgente actividad={pieza.actividad} />
        </div>
      </main>

      <DialogoExportar
        abierto={exportando}
        piezaId={id}
        nombre={pieza.nombre}
        exportable={estado.exportable}
        alCerrar={() => setExportando(false)}
      />
    </>
  );
}
