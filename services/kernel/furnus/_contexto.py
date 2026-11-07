"""Estado de una ejecución: parámetros declarados y valores que pidió la persona."""
from __future__ import annotations

_valores: dict[str, float] = {}
_declarados: dict[str, dict] = {}
_validaciones: list[dict] = []


class ParametroFueraDeRango(ValueError):
    sugerencia = (
        "Pasá un valor dentro del rango declarado en param(). Si el rango del script es demasiado "
        "estricto, ampliá min/max en el script."
    )


def _reiniciar(valores: dict | None = None) -> None:
    _valores.clear()
    _valores.update(valores or {})
    _declarados.clear()
    _validaciones.clear()


def param(nombre: str, valor: float, min: float | None = None, max: float | None = None, unidad: str = "mm"):
    """Declara un parámetro que la persona puede ajustar desde el visor.

    Devuelve el valor pedido por la persona si existe, si no el valor por defecto.
    """
    if nombre in _declarados:
        raise ValueError(f"El parámetro «{nombre}» está declarado dos veces.")
    if min is not None and max is not None and min > max:
        raise ValueError(f"El parámetro «{nombre}» tiene min ({min}) mayor que max ({max}).")
    elegido = _valores.get(nombre, valor)
    if isinstance(elegido, bool) or not isinstance(elegido, (int, float)):
        raise ParametroFueraDeRango(f"El parámetro «{nombre}» tiene que ser un número y llegó {elegido!r}.")
    if (min is not None and elegido < min) or (max is not None and elegido > max):
        rango = f"entre {min} y {max} {unidad}"
        raise ParametroFueraDeRango(
            f"El parámetro «{nombre}» vale {elegido} {unidad} y tiene que estar {rango}."
        )
    _declarados[nombre] = {"nombre": nombre, "valor": elegido, "min": min, "max": max, "unidad": unidad}
    return elegido


def validar(pieza) -> list[str]:
    """Registra la validez de la pieza. Devuelve los motivos si no es válida."""
    from ._geometria import motivos_de_invalidez

    motivos = motivos_de_invalidez(pieza)
    _validaciones.append({"motivos": motivos})
    return motivos
