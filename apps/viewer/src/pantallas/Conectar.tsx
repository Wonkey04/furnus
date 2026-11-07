import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, useAgente } from "../api";
import { Encabezado, Icono, ICONOS } from "../componentes/Basicos";

type Cliente = "claude" | "cursor" | "otro";

const CLIENTES: { id: Cliente; nombre: string; donde: string[] }[] = [
  {
    id: "claude",
    nombre: "Claude Desktop",
    donde: [
      "Abrí Claude Desktop y andá a Ajustes → Desarrollador → Editar configuración.",
      "Pegá el bloque dentro de claude_desktop_config.json (si ya hay «mcpServers», sumá solo «furnus»).",
      "Cerrá Claude Desktop del todo y volvé a abrirlo.",
    ],
  },
  {
    id: "cursor",
    nombre: "Cursor",
    donde: [
      "Abrí Cursor y andá a Settings → MCP → Add new MCP server.",
      "Pegá el bloque en ~/.cursor/mcp.json (si ya hay «mcpServers», sumá solo «furnus»).",
      "Recargá la ventana de Cursor.",
    ],
  },
  {
    id: "otro",
    nombre: "Otro cliente MCP",
    donde: [
      "Buscá en tu cliente dónde se agregan servidores MCP por stdio.",
      "Usá el comando y los argumentos del bloque. No hace falta ninguna clave.",
      "Reiniciá el cliente para que cargue el servidor.",
    ],
  },
];

function configuracion(raiz: string | null): string {
  const base = (raiz ?? "[ruta-del-repo]").replaceAll("\\", "/");
  // Mientras no exista un paquete publicado ([paquete-mcp]) se apunta a la copia local.
  return JSON.stringify(
    {
      mcpServers: {
        furnus: {
          command: "node",
          args: ["--import", `file:///${base}/node_modules/tsx/dist/esm/index.mjs`, `${base}/packages/mcp-server/src/main.ts`],
        },
      },
    },
    null,
    2,
  );
}

export function Conectar() {
  const agente = useAgente();
  const [cliente, setCliente] = useState<Cliente>("claude");
  const [raiz, setRaiz] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [probando, setProbando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/configuracion").then((r) => r.json()).then((c: { raiz: string | null }) => setRaiz(c.raiz)).catch(() => undefined);
  }, []);

  const info = CLIENTES.find((c) => c.id === cliente)!;
  const texto = configuracion(raiz);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      setMensaje("No se pudo copiar. Seleccioná el bloque y copialo a mano.");
    }
  };

  const probar = async () => {
    setProbando(true);
    setMensaje(null);
    try {
      const e = await api.agente();
      setMensaje(e.conectado ? `${e.cliente ?? "El agente"} está conectado.` : "Todavía no hay un agente conectado. Revisá que reiniciaste el cliente y probá de nuevo.");
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "No se pudo verificar.");
    } finally {
      setProbando(false);
    }
  };

  return (
    <>
      <Encabezado agente={agente} />
      <main className="contenido contenido-angosto">
        <h1>Conectar agente</h1>
        <p className="secundario">Traé tu propio agente. Furnus no vende ni incluye ningún modelo.</p>

        <div className="fila selector" role="radiogroup" aria-label="Cliente">
          {CLIENTES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={cliente === c.id}
              className={`btn${cliente === c.id ? " btn-vista activo" : ""}`}
              onClick={() => setCliente(c.id)}
            >
              {c.nombre}
            </button>
          ))}
        </div>

        <ol className="pasos vidrio">
          <li>
            <h2>1. Copiá esta configuración</h2>
            <pre className="codigo" tabIndex={0} aria-label="Configuración MCP">{texto}</pre>
            <button type="button" className="btn" onClick={copiar}><Icono d={ICONOS.copiar} /> {copiado ? "Copiado" : "Copiar"}</button>
          </li>
          <li>
            <h2>2. Pegala en {info.nombre}</h2>
            <ul className="instrucciones">{info.donde.map((d) => <li key={d} className="secundario">{d}</li>)}</ul>
          </li>
          <li>
            <h2>3. Verificá la conexión</h2>
            <p className="fila" role="status">
              <span className={agente.conectado ? "punto" : "punto hueco"} aria-hidden="true" />
              {agente.conectado ? `${agente.cliente ?? "Agente"} conectado.` : "Esperando conexión del agente…"}
            </p>
            <button type="button" className="btn btn-primario" onClick={probar} disabled={probando}>{probando ? "Probando…" : "Probar conexión"}</button>
            {mensaje && <p className="secundario" role="status">{mensaje}</p>}
          </li>
        </ol>

        <div className="fila">
          <Link to="/" className="btn btn-enlace">Volver a Mis piezas</Link>
          <Link to="/" className="btn btn-enlace" aria-label="Ir a la pieza más reciente" onClick={async (e) => {
            e.preventDefault();
            const piezas = await api.listar().catch(() => []);
            window.location.assign(piezas[0] ? `/pieza/${piezas[0].id}` : "/");
          }}>Ir a la pieza</Link>
        </div>
      </main>
    </>
  );
}
