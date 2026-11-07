import os
from pathlib import Path

import pytest

from furnus_kernel import analisis, sandbox

CAJA = """
from furnus import param, sel, validar
from build123d import *

largo = param("largo", 60, min=10, max=200, unidad="mm")
ancho = param("ancho", 40, min=10, max=200, unidad="mm")
radio = param("radio", 2, min=0.5, max=10, unidad="mm")

with BuildPart() as pieza:
    Box(largo, ancho, 24)
    fillet(sel.aristas(pieza, "superiores"), radius=radio)

resultado = pieza.part
validar(resultado)
"""


def correr(script, parametros=None, salidas=("malla", "medidas")):
    return sandbox.ejecutar({"script": script, "parametros": parametros or {}, "salidas": list(salidas)})


def test_script_valido_devuelve_malla_medidas_y_parametros(tmp_path):
    r = sandbox.ejecutar({"script": CAJA, "parametros": {}, "salidas": ["malla", "medidas", "step"]}, str(tmp_path))
    assert r["ok"] is True and r["error"] is None
    assert r["valida"] is True and r["motivos"] == []
    assert r["medidas"]["caja"] == [60.0, 40.0, 24.0]
    assert 0 < r["medidas"]["volumen"] < 60 * 40 * 24
    assert r["medidas"]["area"] > 0
    assert [p["nombre"] for p in r["parametros"]] == ["largo", "ancho", "radio"]
    assert Path(r["malla"]["ruta"]).read_bytes()[:4] == b"glTF"
    assert Path(r["step"]["ruta"]).read_text(errors="ignore").startswith("ISO-10303-21")


def test_parametros_cambian_la_pieza():
    r = correr(CAJA, {"largo": 100})
    assert r["medidas"]["caja"][0] == 100.0


def test_parametro_fuera_de_rango_explica_el_rango():
    r = correr(CAJA, {"largo": 500})
    assert r["ok"] is False
    assert "largo" in r["error"]["mensaje"] and "entre 10 y 200" in r["error"]["mensaje"]
    assert r["error"]["linea"] == 5


def test_filete_demasiado_grande_devuelve_traceback_legible():
    r = correr(CAJA, {"radio": 10, "ancho": 10})
    assert r["ok"] is False
    assert r["error"]["tipo"]
    assert "línea 11" in r["error"]["traceback"] or "línea" in r["error"]["traceback"]


def test_error_de_script_incluye_linea():
    r = correr("from build123d import *\nx = 1\ny = x / 0\nresultado = None")
    assert r["ok"] is False
    assert r["error"]["tipo"] == "ZeroDivisionError"
    assert r["error"]["linea"] == 3
    assert "y = x / 0" in r["error"]["traceback"]


def test_error_de_sintaxis():
    r = correr("def (:")
    assert r["ok"] is False and r["error"]["tipo"] == "ScriptProhibido"
    assert "sintaxis" in r["error"]["mensaje"].lower()


@pytest.mark.parametrize("codigo", [
    "import os\nresultado = None",
    "import subprocess",
    "from socket import socket",
    "import build123d.exporters\nimport sys",
    "x = open('a.txt')",
    "exec('1')",
    "from build123d import *\nx = ().__class__.__bases__",
    "__import__('os')",
])
def test_import_o_nombre_prohibido(codigo):
    r = correr(codigo)
    assert r["ok"] is False
    assert r["error"]["tipo"] == "ScriptProhibido"
    assert "sandbox" in r["error"]["mensaje"] or "Solo se permiten" in r["error"]["mensaje"]


def test_el_analisis_permite_los_imports_declarados():
    assert analisis.analizar("import math\nfrom build123d import *\nfrom furnus import param, sel, validar") == []


def test_timeout(monkeypatch):
    monkeypatch.setenv("FURNUS_TIMEOUT_S", "3")
    r = correr("while True:\n    pass")
    assert r["ok"] is False and r["error"]["tipo"] == "Timeout"
    assert "3 s" in r["error"]["mensaje"]


def test_limite_de_memoria(monkeypatch):
    monkeypatch.setenv("FURNUS_MEMORIA_MB", "400")
    r = correr("x = []\nwhile True:\n    x.append(bytearray(50_000_000))")
    assert r["ok"] is False
    assert r["error"]["tipo"] in ("MemoryError", "ProcesoCaido")


def test_sin_red():
    # El import está prohibido por análisis; también se verifica el bloqueo en runtime con build123d a mano.
    r = correr("import socket")
    assert r["error"]["tipo"] == "ScriptProhibido"


def test_pieza_invalida_se_informa():
    # Dos sólidos separados: el kernel lo marca como inválido para el prototipo.
    script = """
from build123d import *
with BuildPart() as pieza:
    Box(10, 10, 10)
    with Locations((50, 0, 0)):
        Box(10, 10, 10)
resultado = pieza.part
"""
    r = correr(script)
    assert r["ok"] is True
    assert r["valida"] is False
    assert any("sólidos separados" in m for m in r["motivos"])


def test_sin_variable_resultado():
    r = correr("from build123d import *\npieza = Box(1, 1, 1)")
    assert r["ok"] is False and r["error"]["tipo"] == "SinResultado"
    assert "resultado" in r["error"]["traceback"]


def test_selectores_caras_aristas_y_agujeros():
    script = """
from furnus import sel
from build123d import *
with BuildPart() as caja:
    Box(40, 40, 20)
assert len(sel.caras(caja, "frontal")) == 1
assert len(sel.caras(caja, "superior")) == 1
assert len(sel.aristas(caja, "verticales")) == 4
assert len(sel.aristas(caja, "superiores")) == 4
assert len(sel.agujeros(caja)) == 0
with BuildPart() as pieza:
    Box(40, 40, 20)
    with Locations(sel.caras(pieza, "superior")[0].center()):
        Hole(4, 10)
assert len(sel.agujeros(pieza)) == 1
resultado = pieza.part
"""
    r = correr(script)
    assert r["ok"] is True, r["error"]


def test_step_se_puede_reimportar(tmp_path):
    from build123d import import_step

    r = sandbox.ejecutar({"script": CAJA, "salidas": ["step", "medidas"]}, str(tmp_path))
    forma = import_step(r["step"]["ruta"])
    assert forma.volume == pytest.approx(r["medidas"]["volumen"], rel=1e-6)
    assert forma.is_valid


def test_step_en_pulgadas_conserva_el_tamano_y_se_etiqueta(tmp_path):
    from build123d import import_step

    r = sandbox.ejecutar({"script": CAJA, "salidas": ["step"], "unidad": "in"}, str(tmp_path))
    assert "CONVERSION_BASED_UNIT('INCH'" in Path(r["step"]["ruta"]).read_text(errors="ignore")
    forma = import_step(r["step"]["ruta"])
    assert forma.bounding_box().size.X == pytest.approx(60.0, abs=1e-3)
