"""Análisis estático del script antes de correrlo. No es seguridad real (ver ARCHITECTURE.md)."""
from __future__ import annotations

import ast
from dataclasses import dataclass

IMPORTS_PERMITIDOS = {"build123d", "math", "furnus"}
NOMBRES_PROHIBIDOS = {
    "os", "sys", "subprocess", "socket", "open", "exec", "eval", "compile", "input", "breakpoint",
    "__import__", "globals", "locals", "vars", "getattr", "setattr", "delattr", "memoryview",
    "importlib", "ctypes", "shutil", "pathlib", "builtins",
}


@dataclass
class Problema:
    linea: int
    mensaje: str
    sugerencia: str | None = None

    def texto(self) -> str:
        return f"línea {self.linea}: {self.mensaje}"


_SUG_IMPORT = (
    "Quitá ese import. El sandbox no tiene archivos, red ni sistema: la pieza se arma solo con "
    "build123d, math y furnus (param, sel, validar)."
)
_SUG_NOMBRE = "Quitá esa línea: el sandbox no da acceso a archivos, red, sistema ni introspección."


def analizar(script: str) -> list[Problema]:
    try:
        arbol = ast.parse(script)
    except SyntaxError as e:
        return [Problema(e.lineno or 1, f"Error de sintaxis: {e.msg}.")]
    problemas: list[Problema] = []
    for nodo in ast.walk(arbol):
        linea = getattr(nodo, "lineno", 0)
        if isinstance(nodo, ast.Import):
            for a in nodo.names:
                raiz = a.name.split(".")[0]
                if raiz not in IMPORTS_PERMITIDOS:
                    problemas.append(Problema(linea, _import(raiz), _SUG_IMPORT))
        elif isinstance(nodo, ast.ImportFrom):
            raiz = (nodo.module or "").split(".")[0]
            if nodo.level or raiz not in IMPORTS_PERMITIDOS:
                problemas.append(Problema(linea, _import(raiz or "."), _SUG_IMPORT))
        elif isinstance(nodo, ast.Name) and nodo.id in NOMBRES_PROHIBIDOS:
            problemas.append(Problema(linea, f"«{nodo.id}» no está permitido en el sandbox.", _SUG_NOMBRE))
        elif isinstance(nodo, ast.Attribute) and (
            nodo.attr.startswith("__") or nodo.attr in NOMBRES_PROHIBIDOS
        ):
            problemas.append(Problema(linea, f"El acceso a «.{nodo.attr}» no está permitido en el sandbox.", _SUG_NOMBRE))
    return problemas


def _import(raiz: str) -> str:
    permitidos = ", ".join(sorted(IMPORTS_PERMITIDOS))
    return f"No se puede importar «{raiz}». Solo se permiten: {permitidos}."
