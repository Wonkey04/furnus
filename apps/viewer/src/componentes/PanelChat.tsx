import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { ErrorApi, api, useEventos, type EstadoMotorChat, type EventoChat, type ItemChat } from "../api";

function aplicar(items: ItemChat[], e: EventoChat): ItemChat[] {
  switch (e.tipo) {
    case "inicio":
      return [...items, { tipo: "usuario", texto: e.texto }];
    case "texto": {
      const ultimo = items.at(-1);
      if (ultimo?.tipo === "asistente") return [...items.slice(0, -1), { ...ultimo, texto: ultimo.texto + e.delta }];
      return [...items, { tipo: "asistente", texto: e.delta }];
    }
    case "herramienta": {
      const hay = items.some((i) => i.tipo === "herramienta" && i.id === e.id);
      const nuevo: ItemChat = { tipo: "herramienta", id: e.id, nombre: e.nombre, estado: e.estado, resumen: e.resumen };
      return hay ? items.map((i) => (i.tipo === "herramienta" && i.id === e.id ? nuevo : i)) : [...items, nuevo];
    }
    case "error":
      return [...items, { tipo: "error", mensaje: e.mensaje }];
    default:
      return items;
  }
}

const EJEMPLOS = ["Una mesa de comedor para seis personas", "Un soporte con dos agujeros de 8 mm", "Una caja con tapa de 80 × 50 × 30 mm"];

export function PanelChat({ piezaId }: { piezaId: string }) {
  const [config, setConfig] = useState<EstadoMotorChat | null>(null);
  const [comprobando, setComprobando] = useState(false);
  const [items, setItems] = useState<ItemChat[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const finDeLista = useRef<HTMLDivElement>(null);

  const comprobar = () => {
    setComprobando(true);
    api
      .chatEstado()
      .then(setConfig)
      .catch(() => setConfig({ disponible: false, estado: "sin_motor", modelo: null, ayuda: null }))
      .finally(() => setComprobando(false));
  };
  useEffect(comprobar, []);

  useEffect(() => {
    setItems([]);
    setOcupado(false);
    api.chat(piezaId).then((e) => { setItems(e.transcripto); setOcupado(e.ocupado); }).catch(() => undefined);
  }, [piezaId]);

  useEventos((e) => {
    if (e.tipo !== "chat" || e.piezaId !== piezaId) return;
    const ev = e.evento;
    if (ev.tipo === "inicio") { setOcupado(true); setError(null); }
    if (ev.tipo === "fin") setOcupado(false);
    setItems((prev) => aplicar(prev, ev));
  });

  useEffect(() => {
    finDeLista.current?.scrollIntoView({ block: "end" });
  }, [items, ocupado]);

  const enviar = async (mensaje: string) => {
    const t = mensaje.trim();
    if (!t || ocupado) return;
    setTexto("");
    setError(null);
    setOcupado(true);
    try {
      await api.enviarChat(piezaId, t);
    } catch (e) {
      setOcupado(false);
      setTexto(t);
      setError(e instanceof ErrorApi ? e.message : "No se pudo enviar el mensaje.");
    }
  };

  const alEnviar = (ev: FormEvent) => {
    ev.preventDefault();
    void enviar(texto);
  };
  const alTeclear = (ev: KeyboardEvent<HTMLTextAreaElement>) => {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      void enviar(texto);
    }
  };

  const sinMotor = config !== null && !config.disponible;

  return (
    <section className="panel vidrio chat" aria-labelledby="t-chat">
      <h2 className="etiqueta-panel" id="t-chat">Chat</h2>

      <div className="chat-mensajes" role="log" aria-live="polite" aria-label="Conversación con el agente">
        {items.length === 0 && !ocupado && (
          <div className="chat-vacio">
            <p className="secundario">Contale qué pieza necesitás y la armo acá.</p>
            {!sinMotor && (
              <ul className="chat-ejemplos">
                {EJEMPLOS.map((e) => (
                  <li key={e}><button type="button" className="btn btn-enlace" onClick={() => void enviar(e)}>{e}</button></li>
                ))}
              </ul>
            )}
          </div>
        )}
        {items.map((i, n) => {
          if (i.tipo === "usuario") return <p key={n} className="burbuja burbuja-usuario">{i.texto}</p>;
          if (i.tipo === "asistente") return <p key={n} className="burbuja burbuja-agente">{i.texto}</p>;
          if (i.tipo === "error") return <p key={n} className="chat-error" role="alert"><span className="etiqueta-error">Error</span> <span className="secundario">{i.mensaje}</span></p>;
          return (
            <p key={i.id} className="chat-herramienta">
              <span className={i.estado === "ok" ? "punto" : "punto hueco"} aria-hidden="true" />
              <span className="mono">{i.nombre}</span>
              {i.estado === "ejecutando" && <span className="ayuda">ejecutando…</span>}
              {i.estado === "error" && <span className="etiqueta-error">Error</span>}
              {i.resumen && <span className="ayuda">{i.resumen}</span>}
            </p>
          );
        })}
        {ocupado && <p className="chip chip-punteado chat-trabajando" role="status"><span className="punto hueco" aria-hidden="true" />Trabajando…</p>}
        <div ref={finDeLista} />
      </div>

      {sinMotor && (
        <div className="aviso" role="status">
          <span className="etiqueta-panel">{config.estado === "sin_login" ? "Falta iniciar sesión" : "Falta Claude Code"}</span>
          {config.estado === "sin_login" && config.ayuda ? (
            <>
              <p className="secundario">El chat usa el Claude Code de tu computadora, con tu suscripción. Ya está instalado pero no tiene la sesión iniciada. Abrí una terminal y corré:</p>
              <pre className="codigo">{config.ayuda.login}</pre>
              <p className="ayuda">Se abre el navegador para entrar con tu cuenta de Claude. Después volvé acá.</p>
            </>
          ) : config.ayuda ? (
            <>
              <p className="secundario">El chat usa el Claude Code de tu computadora, con tu suscripción (no pide clave de API). No lo encuentro: instalalo con uno de estos comandos en una terminal:</p>
              {config.ayuda.instalar.map((i) => (
                <div key={i.etiqueta} className="aviso-comando">
                  <span className="ayuda">{i.etiqueta}</span>
                  <pre className="codigo">{i.comando}</pre>
                </div>
              ))}
              <p className="secundario">Después iniciá sesión:</p>
              <pre className="codigo">{config.ayuda.login}</pre>
            </>
          ) : (
            <p className="secundario">Este servidor no tiene el chat activado. Reiniciá <span className="mono">pnpm dev</span>.</p>
          )}
          <button type="button" className="btn" disabled={comprobando} onClick={comprobar}>{comprobando ? "Comprobando…" : "Volver a comprobar"}</button>
          <p className="ayuda">O usá tu propio agente (Claude Desktop, Cursor): <Link to="/conectar">Conectar agente</Link>.</p>
        </div>
      )}
      {error && <p className="chat-error" role="alert"><span className="etiqueta-error">Error</span> <span className="secundario">{error}</span></p>}

      <form className="chat-form" onSubmit={alEnviar}>
        <label className="sr-only" htmlFor="chat-texto">Mensaje para el agente</label>
        <textarea
          id="chat-texto"
          className="input chat-texto"
          rows={2}
          value={texto}
          placeholder={sinMotor ? "Falta dejar andando Claude Code" : "Escribí qué querés hacer…"}
          disabled={sinMotor}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={alTeclear}
        />
        <div className="fila">
          <span className="ayuda">{config?.modelo ?? ""}</span>
          <span className="espacio" />
          {ocupado ? (
            <button type="button" className="btn" onClick={() => void api.cancelarChat(piezaId)}>Parar</button>
          ) : (
            <button type="submit" className="btn btn-primario" disabled={sinMotor || !texto.trim()}>Enviar</button>
          )}
        </div>
      </form>
    </section>
  );
}
