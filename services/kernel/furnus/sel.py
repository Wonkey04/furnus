"""Selectores semánticos: se resuelven en cada ejecución, no dependen de índices."""
from __future__ import annotations

from build123d import Axis, Plane, ShapeList

from ._geometria import _forma

_TOL = 1e-4
_CARAS = {
    "superior": (0, 0, 1),
    "inferior": (0, 0, -1),
    "frontal": (0, -1, 0),
    "trasera": (0, 1, 0),
    "izquierda": (-1, 0, 0),
    "derecha": (1, 0, 0),
}


def _cerca(a: float, b: float) -> bool:
    return abs(a - b) <= _TOL * max(1.0, abs(a), abs(b))


def caras(pieza, nombre: str) -> ShapeList:
    """Caras planas cuya normal apunta a `nombre` y que están en el extremo de la pieza."""
    if nombre not in _CARAS:
        raise ValueError(f"Cara «{nombre}» desconocida. Opciones: {', '.join(_CARAS)}.")
    forma = _forma(pieza)
    d = _CARAS[nombre]
    eje = next(i for i, v in enumerate(d) if v)
    bb = forma.bounding_box()
    extremo = (bb.max if d[eje] > 0 else bb.min)
    extremo = (extremo.X, extremo.Y, extremo.Z)[eje]
    elegidas = []
    for cara in forma.faces():
        if cara.geom_type.name != "PLANE":
            continue
        n = cara.normal_at()
        alineada = (n.X * d[0] + n.Y * d[1] + n.Z * d[2]) > 1 - _TOL
        c = cara.center()
        if alineada and _cerca((c.X, c.Y, c.Z)[eje], extremo):
            elegidas.append(cara)
    return ShapeList(elegidas)


def aristas(pieza, nombre: str) -> ShapeList:
    """`superiores` / `inferiores`: aristas en el plano extremo de Z. `verticales`: paralelas a Z."""
    forma = _forma(pieza)
    bb = forma.bounding_box()
    if nombre in ("superiores", "inferiores"):
        z = bb.max.Z if nombre == "superiores" else bb.min.Z
        return ShapeList(
            e for e in forma.edges()
            if _cerca(e.bounding_box().min.Z, z) and _cerca(e.bounding_box().max.Z, z)
        )
    if nombre == "verticales":
        return ShapeList(
            e for e in forma.edges()
            if e.geom_type.name == "LINE"
            and abs(e.bounding_box().size.X) <= _TOL and abs(e.bounding_box().size.Y) <= _TOL
        )
    raise ValueError(f"Aristas «{nombre}» desconocidas. Opciones: superiores, inferiores, verticales.")


def agujeros(pieza) -> ShapeList:
    """Caras cilíndricas internas (paredes de los agujeros)."""
    forma = _forma(pieza)
    salida = []
    for cara in forma.faces():
        if cara.geom_type.name == "CYLINDER":
            # Cóncava si el material queda afuera del eje: la normal apunta hacia el eje.
            c = cara.center()
            n = cara.normal_at(c)
            eje = cara.axis_of_rotation if hasattr(cara, "axis_of_rotation") else None
            if eje is None:
                continue
            radial = c - eje.position
            radial = radial - eje.direction * radial.dot(eje.direction)
            if radial.dot(n) < 0:
                salida.append(cara)
    return ShapeList(salida)


__all__ = ["caras", "aristas", "agujeros", "Axis", "Plane"]
