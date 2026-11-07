"""Capturas de la pieza para el agente: proyección ortogonal, z-buffer propio y tres grises.

No usa GPU ni ventana: numpy + Pillow. Es lo que el agente ve para decidir si la pieza «parece bien»
(agujeros del lado equivocado, patas flotando, proporciones raras) más allá de las medidas.
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ANCHO, ALTO = 640, 480
SUPERMUESTREO = 2  # se dibuja al doble y se reduce: bordes sin escalera
MARGEN = 0.10

# (dirección en la que mira la cámara, hacia dónde es «arriba» en la imagen)
VISTAS: dict[str, tuple[tuple[float, float, float], tuple[float, float, float]]] = {
    "iso": ((-1.0, 1.0, -0.8), (0.0, 0.0, 1.0)),
    "frente": ((0.0, 1.0, 0.0), (0.0, 0.0, 1.0)),
    "arriba": ((0.0, 0.0, -1.0), (0.0, 1.0, 0.0)),
    "derecha": ((-1.0, 0.0, 0.0), (0.0, 0.0, 1.0)),
}
FONDO = 255
TINTA = (40, 40, 40)
TEXTO = (110, 110, 110)


def _unit(v) -> np.ndarray:
    v = np.asarray(v, dtype=float)
    return v / np.linalg.norm(v)


def _base(vista: str):
    mira, arriba = VISTAS[vista]
    f = _unit(mira)
    derecha = _unit(np.cross(f, arriba))
    sube = np.cross(derecha, f)
    return f, derecha, sube


def _fuente(tam: int):
    try:
        return ImageFont.load_default(size=tam)
    except TypeError:  # Pillow viejo: sin tamaño
        return ImageFont.load_default()


def _num(x: float) -> str:
    return f"{x:.1f}".rstrip("0").rstrip(".") if abs(x - round(x)) > 1e-6 else str(int(round(x)))


def _malla(forma, diagonal: float):
    vertices, triangulos = forma.tessellate(max(diagonal * 0.002, 0.01), 0.2)
    v = np.array([[p.X, p.Y, p.Z] for p in vertices], dtype=float)
    t = np.array(triangulos, dtype=int)
    return v, t


def _rasterizar(v3, tri, f, derecha, sube, escala, cx, cy, ancho, alto):
    """z-buffer: devuelve (imagen gris, profundidad). Profundidad menor = más cerca de la cámara."""
    pantalla = np.stack([v3 @ derecha, v3 @ sube], axis=1)
    px = cx + pantalla[:, 0] * escala
    py = cy - pantalla[:, 1] * escala
    prof = v3 @ f

    luz = _unit(-0.35 * derecha + 0.55 * sube - 0.75 * f)
    gris = np.full((alto, ancho), FONDO, dtype=np.uint8)
    zbuf = np.full((alto, ancho), np.inf)

    for a, b, c in tri:
        p0, p1, p2 = v3[a], v3[b], v3[c]
        n = np.cross(p1 - p0, p2 - p0)
        largo = np.linalg.norm(n)
        if largo < 1e-12:
            continue
        n /= largo
        if n @ f > 0:  # la normal tiene que mirar a la cámara
            n = -n
        tono = int(255 * (0.30 + 0.62 * max(0.0, float(n @ luz))))

        x0, x1, x2 = px[a], px[b], px[c]
        y0, y1, y2 = py[a], py[b], py[c]
        den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(den) < 1e-12:
            continue
        xmin = max(int(math.floor(min(x0, x1, x2))), 0)
        xmax = min(int(math.ceil(max(x0, x1, x2))), ancho - 1)
        ymin = max(int(math.floor(min(y0, y1, y2))), 0)
        ymax = min(int(math.ceil(max(y0, y1, y2))), alto - 1)
        if xmin > xmax or ymin > ymax:
            continue
        gx, gy = np.meshgrid(np.arange(xmin, xmax + 1) + 0.5, np.arange(ymin, ymax + 1) + 0.5)
        l0 = ((y1 - y2) * (gx - x2) + (x2 - x1) * (gy - y2)) / den
        l1 = ((y2 - y0) * (gx - x2) + (x0 - x2) * (gy - y2)) / den
        l2 = 1.0 - l0 - l1
        dentro = (l0 >= -1e-6) & (l1 >= -1e-6) & (l2 >= -1e-6)
        if not dentro.any():
            continue
        z = l0 * prof[a] + l1 * prof[b] + l2 * prof[c]
        sub_z = zbuf[ymin : ymax + 1, xmin : xmax + 1]
        gana = dentro & (z < sub_z)
        sub_z[gana] = z[gana]
        gris[ymin : ymax + 1, xmin : xmax + 1][gana] = tono
    return gris, zbuf


def _aristas(img: Image.Image, forma, f, derecha, sube, escala, cx, cy, zbuf, tolerancia: float) -> None:
    """Dibuja solo los tramos de arista que se ven (los tapados por la pieza se descartan)."""
    dib = ImageDraw.Draw(img)
    alto, ancho = zbuf.shape
    for arista in forma.edges():
        n = max(24, min(160, int(arista.length)))
        pts = np.array([[p.X, p.Y, p.Z] for p in (arista.position_at(i / n) for i in range(n + 1))])
        sx = cx + (pts @ derecha) * escala
        sy = cy - (pts @ sube) * escala
        prof = pts @ f
        visible = []
        for x, y, d in zip(sx, sy, prof):
            ix, iy = int(round(x)), int(round(y))
            visible.append(0 <= ix < ancho and 0 <= iy < alto and d <= zbuf[iy, ix] + tolerancia)
        for i in range(n):
            if visible[i] and visible[i + 1]:
                dib.line([(sx[i], sy[i]), (sx[i + 1], sy[i + 1])], fill=TINTA, width=SUPERMUESTREO)


def _ejes(dib: ImageDraw.ImageDraw, derecha, sube, ancho: int, alto: int) -> None:
    ox, oy, largo = ancho - 56, alto - 46, 26
    fuente = _fuente(13)
    for nombre, eje in (("X", (1, 0, 0)), ("Y", (0, 1, 0)), ("Z", (0, 0, 1))):
        dx, dy = float(np.dot(eje, derecha)), float(np.dot(eje, sube))
        if math.hypot(dx, dy) < 0.12:
            continue  # el eje apunta a la cámara: no se dibuja
        ex, ey = ox + dx * largo, oy - dy * largo
        dib.line([(ox, oy), (ex, ey)], fill=TEXTO, width=1)
        dib.text((ex + (4 if dx >= 0 else -11), ey - 7), nombre, fill=TEXTO, font=fuente)


def renderizar_vista(forma, vista: str, ruta: Path) -> None:
    f, derecha, sube = _base(vista)
    bb = forma.bounding_box()
    diag = float(bb.diagonal)
    v3, tri = _malla(forma, diag)

    ancho, alto = ANCHO * SUPERMUESTREO, ALTO * SUPERMUESTREO
    proy = np.stack([v3 @ derecha, v3 @ sube], axis=1)
    mn, mx = proy.min(axis=0), proy.max(axis=0)
    tam = np.maximum(mx - mn, 1e-9)
    util_x, util_y = ancho * (1 - 2 * MARGEN), alto * (1 - 2 * MARGEN)
    escala = min(util_x / tam[0], util_y / tam[1])
    cx = ancho / 2 - (mn[0] + tam[0] / 2) * escala
    cy = alto / 2 + (mn[1] + tam[1] / 2) * escala

    gris, zbuf = _rasterizar(v3, tri, f, derecha, sube, escala, cx, cy, ancho, alto)
    img = Image.fromarray(gris, mode="L").convert("RGB")
    _aristas(img, forma, f, derecha, sube, escala, cx, cy, zbuf, max(diag * 0.004, 1e-6))
    img = img.resize((ANCHO, ALTO), Image.LANCZOS)

    dib = ImageDraw.Draw(img)
    dib.text(
        (14, ALTO - 28),
        f"{vista} - X {_num(bb.size.X)} x Y {_num(bb.size.Y)} x Z {_num(bb.size.Z)} mm",
        fill=TEXTO,
        font=_fuente(14),
    )
    _ejes(dib, derecha, sube, ANCHO, ALTO)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    img.save(ruta, "PNG", optimize=True)


def renderizar(forma, vistas: list[str], carpeta: Path) -> list[dict]:
    salida = []
    for vista in vistas:
        if vista not in VISTAS:
            raise ValueError(f"Vista desconocida «{vista}». Disponibles: {', '.join(VISTAS)}.")
        ruta = carpeta / f"{vista}.png"
        renderizar_vista(forma, vista, ruta)
        salida.append({"vista": vista, "ruta": str(ruta)})
    return salida
