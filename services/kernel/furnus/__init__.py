"""Librería de ayuda para los scripts de Furnus: param, sel y validar."""
from . import sel
from ._contexto import ParametroFueraDeRango, param, validar

__all__ = ["param", "sel", "validar", "ParametroFueraDeRango"]
