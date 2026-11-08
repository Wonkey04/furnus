import type { ReactNode, SVGProps } from "react";
import { Link, NavLink } from "react-router-dom";
import type { EstadoAgente } from "../api";

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Furnus, ir a Mis piezas">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 18v-5a8 8 0 0 1 16 0v5" />
        <path d="M10 18v-3a2 2 0 0 1 4 0v3" />
        <path d="M2.5 18h19" />
      </svg>
      <span>Furnus</span>
    </Link>
  );
}

/** El MCP informa el nombre técnico del cliente («claude-code»); a la persona le mostramos el nombre del producto. */
export function nombreDeAgente(cliente: string | null): string {
  if (!cliente) return "Agente";
  const c = cliente.toLowerCase();
  if (c.startsWith("claude-code")) return "Claude Code";
  if (c.startsWith("claude-ai") || c.includes("claude desktop")) return "Claude Desktop";
  if (c.includes("cursor")) return "Cursor";
  return cliente;
}

export function ChipAgente({ agente }: { agente: EstadoAgente }) {
  return (
    <span className="chip" role="status">
      <span className={agente.conectado ? "punto" : "punto inactivo"} aria-hidden="true" />
      {agente.conectado ? `${nombreDeAgente(agente.cliente)} conectado` : "Sin agente conectado"}
    </span>
  );
}

export function Encabezado({ agente, migas, acciones }: { agente: EstadoAgente; migas?: ReactNode; acciones?: ReactNode }) {
  return (
    <header className="encabezado vidrio">
      <Logo />
      <nav className="navegacion" aria-label="Principal">
        <NavLink to="/" end>Mis piezas</NavLink>
        <NavLink to="/conectar">Conectar agente</NavLink>
      </nav>
      {migas && <div className="migas">{migas}</div>}
      <span className="espacio" />
      <ChipAgente agente={agente} />
      {acciones}
    </header>
  );
}

export function Icono({ d, ...props }: { d: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d={d} />
    </svg>
  );
}

export const ICONOS = {
  deshacer: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  rehacer: "m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3",
  mas: "M12 5v14M5 12h14",
  copiar: "M9 9h11v11H9zM5 15V4h11",
  descargar: "M12 4v12m0 0 4-4m-4 4-4-4M5 20h14",
  cerrar: "M6 6l12 12M18 6 6 18",
};
