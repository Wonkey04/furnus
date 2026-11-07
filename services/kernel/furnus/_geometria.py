from __future__ import annotations


def _forma(pieza):
    # Acepta BuildPart (usa .part), Part o cualquier Shape.
    return getattr(pieza, "part", pieza)


def motivos_de_invalidez(pieza) -> list[str]:
    motivos: list[str] = []
    if pieza is None:
        return ["El script no dejó ninguna pieza en la variable «resultado»."]
    forma = _forma(pieza)
    try:
        solidos = list(forma.solids())
    except Exception:
        return ["«resultado» no es una pieza de build123d."]
    if not solidos:
        return ["La pieza no tiene ningún sólido."]
    if not forma.is_valid:
        motivos.append("La geometría no es válida para OpenCascade (caras o aristas mal cerradas).")
    try:
        volumen = forma.volume
    except Exception:
        volumen = 0.0
    if volumen <= 1e-9:
        motivos.append("La pieza tiene volumen cero o negativo.")
    if len(solidos) > 1:
        motivos.append(
            f"La pieza tiene {len(solidos)} sólidos separados; en el prototipo tiene que ser uno solo."
        )
    return motivos
