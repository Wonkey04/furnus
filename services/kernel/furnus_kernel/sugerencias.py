"""Convierte errores crudos del kernel en mensajes con límite y sugerencia para el agente.

Corre dentro del subproceso del runner. Un agente que no leyó el repo tiene que poder corregir
un error mirando solo el mensaje: qué falló, cuál es el límite y qué probar.
"""
from __future__ import annotations

import difflib
import inspect
import re


class ErrorConSugerencia(ValueError):
    """Error de geometría reescrito en español; `sugerencia` viaja aparte del mensaje."""

    def __init__(self, mensaje: str, sugerencia: str):
        super().__init__(mensaje)
        self.sugerencia = sugerencia


def _mm(x: float) -> str:
    return f"{x:.1f}".rstrip("0").rstrip(".").replace(".", ",") if x != int(x) else str(int(x))


def _tope_de_filete(aristas) -> float | None:
    """Radio máximo que admiten estas aristas, o None si no se pudo calcular."""
    import build123d

    try:
        contexto = build123d.BuildPart._get_context()
        pieza = contexto.part if contexto is not None else None
        if pieza is None:
            return None
        lista = [aristas] if not hasattr(aristas, "__iter__") else list(aristas)
        # Se resta un margen: el valor que devuelve max_fillet es el borde del intervalo que todavía falla.
        return float(pieza.max_fillet(lista)) * 0.98
    except Exception:  # noqa: BLE001 - es una ayuda, nunca debe tapar el error original
        return None


def _envolver(original, nombre: str, magnitud: str):
    def envuelto(objects, *args, **kwargs):
        try:
            return original(objects, *args, **kwargs)
        except ValueError as exc:
            if isinstance(exc, ErrorConSugerencia):
                raise
            pedido = kwargs.get("radius", kwargs.get("length", args[0] if args else None))
            tope = _tope_de_filete(objects)
            if tope is not None and tope > 0:
                aprox = "≈ " if nombre == "chaflán" else ""
                msg = (
                    f"No se pudo hacer el {nombre} de {_mm(pedido) if isinstance(pedido, (int, float)) else pedido} mm: "
                    f"el {magnitud} máximo para estas aristas es {aprox}{_mm(tope)} mm."
                )
                sug = (
                    f"Usá un {magnitud} menor o igual a {_mm(tope)} mm, o seleccioná menos aristas. "
                    "Si lo declarás con param(), poné ese valor como max."
                )
            else:
                msg = f"No se pudo hacer el {nombre}: el {magnitud} pedido es demasiado grande para estas aristas."
                sug = f"Probá con un {magnitud} bastante menor o seleccioná menos aristas."
            raise ErrorConSugerencia(msg, sug) from exc

    envuelto.__name__ = original.__name__
    envuelto.__doc__ = original.__doc__
    return envuelto


def instalar(build123d_modulo) -> None:
    """Reemplaza fillet y chamfer por versiones que explican el límite. Antes del import * del script."""
    for atributo, nombre, magnitud in (("fillet", "filete", "radio"), ("chamfer", "chaflán", "tamaño")):
        original = getattr(build123d_modulo, atributo, None)
        if original is not None and not getattr(original, "_furnus", False):
            nuevo = _envolver(original, nombre, magnitud)
            nuevo._furnus = True  # type: ignore[attr-defined]
            setattr(build123d_modulo, atributo, nuevo)


def _cercanos(nombre: str, candidatos, n: int = 3) -> list[str]:
    return difflib.get_close_matches(nombre, [c for c in candidatos if not c.startswith("_")], n=n, cutoff=0.6)


def _firma(nombre: str, build123d_modulo) -> str | None:
    objeto = build123d_modulo
    for parte in nombre.split("."):
        objeto = getattr(objeto, parte, None)
        if objeto is None:
            return None
    try:
        return f"{nombre}{_firma_de(objeto)}"
    except (TypeError, ValueError):
        return None


def _firma_de(objeto) -> inspect.Signature:
    """En build123d las clases reciben *args/**kwargs: la firma real está en __init__."""
    if inspect.isclass(objeto):
        firma = inspect.signature(objeto.__init__)
        return firma.replace(parameters=[p for n, p in firma.parameters.items() if n != "self"])
    return inspect.signature(objeto)


def sugerir(exc: BaseException, entorno: dict, build123d_modulo) -> str | None:
    """Sugerencia accionable para el error, o None si no hay nada útil que agregar."""
    sugerencia_propia = getattr(exc, "sugerencia", None)
    if isinstance(sugerencia_propia, str):
        return sugerencia_propia

    if isinstance(exc, AttributeError) and getattr(exc, "name", None) is not None:
        obj = getattr(exc, "obj", None)
        parecidos = _cercanos(exc.name, dir(obj)) if obj is not None else []
        tipo = type(obj).__name__ if obj is not None else "el objeto"
        if parecidos:
            return f"«{tipo}» no tiene «.{exc.name}». ¿Quisiste decir: {', '.join('.' + p for p in parecidos)}?"
        return f"«{tipo}» no tiene «.{exc.name}». Revisá el nombre del método o atributo en build123d."

    if isinstance(exc, NameError) and getattr(exc, "name", None):
        candidatos = set(entorno) | set(dir(build123d_modulo))
        parecidos = _cercanos(exc.name, candidatos)
        if parecidos:
            return f"«{exc.name}» no está definido. ¿Quisiste decir: {', '.join(parecidos)}?"
        return f"«{exc.name}» no está definido. Si es una clase de build123d, comprobá que el script empiece con «from build123d import *»."

    if isinstance(exc, TypeError):
        m = re.match(r"^([\w.]+?)(?:\.__init__)?\(\) (got an unexpected keyword argument|missing \d+ required|takes )", str(exc))
        if m:
            firma = _firma(m.group(1), build123d_modulo)
            kw = re.search(r"unexpected keyword argument '(\w+)'", str(exc))
            extra = ""
            if kw and firma:
                parecidos = _cercanos(kw.group(1), list(_firma_de(_resolver(m.group(1), build123d_modulo)).parameters))
                if parecidos:
                    extra = f" ¿Quisiste decir «{parecidos[0]}»?"
            if firma:
                return f"Firma correcta: {firma}.{extra}"
        return None

    if isinstance(exc, ImportError):
        return "El sandbox solo permite importar build123d, math y furnus. Quitá ese import: no hay archivos, red ni sistema."

    return None


def _resolver(nombre: str, modulo):
    objeto = modulo
    for parte in nombre.split("."):
        objeto = getattr(objeto, parte)
    return objeto
