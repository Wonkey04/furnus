"""Servicio HTTP local del kernel. POST /ejecutar con el JSON del contrato de ARCHITECTURE.md."""
from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import sandbox


class Handler(BaseHTTPRequestHandler):
    def _responder(self, codigo: int, cuerpo: dict) -> None:
        datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def do_GET(self):  # noqa: N802
        if self.path == "/salud":
            return self._responder(200, {"ok": True})
        self._responder(404, {"error": "No existe."})

    def do_POST(self):  # noqa: N802
        if self.path != "/ejecutar":
            return self._responder(404, {"error": "No existe."})
        try:
            largo = int(self.headers.get("Content-Length", 0))
            pedido = json.loads(self.rfile.read(largo) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self._responder(400, {"error": "El cuerpo no es JSON válido."})
        salida = pedido.pop("directorio_salida", None)
        self._responder(200, sandbox.ejecutar(pedido, salida))

    def log_message(self, formato, *args):  # noqa: A003
        sys.stderr.write("[kernel] " + formato % args + "\n")


def main() -> None:
    puerto = int(os.environ.get("FURNUS_KERNEL_PORT", "4020"))
    servidor = ThreadingHTTPServer(("127.0.0.1", puerto), Handler)
    print(f"[kernel] escuchando en http://127.0.0.1:{puerto}", flush=True)
    servidor.serve_forever()


if __name__ == "__main__":
    main()
