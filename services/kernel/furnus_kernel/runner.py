"""Se ejecuta DENTRO del subproceso: corre el script y escribe resultado.json.

Uso: python -I runner.py <pedido.json> <directorio_salida>
"""
from __future__ import annotations

import builtins
import json
import os
import sys
import traceback
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PERMITIDOS = {"build123d", "math", "furnus"}


def _importar(nombre, globales=None, locales=None, fromlist=(), level=0):
    if level or nombre.split(".")[0] not in PERMITIDOS:
        raise ImportError(f"No se puede importar «{nombre}» en el sandbox.")
    return builtins.__import__(nombre, globales, locales, fromlist, level)


def _builtins_seguros():
    prohibidos = {
        "open", "exec", "eval", "compile", "input", "breakpoint", "globals", "locals", "vars",
        "getattr", "setattr", "delattr", "memoryview", "__import__",
    }
    seguros = {k: v for k, v in vars(builtins).items() if k not in prohibidos}
    seguros["__import__"] = _importar
    return seguros


def _bloquear_red() -> None:
    import socket

    def _sin_red(*a, **k):
        raise PermissionError("El sandbox no tiene acceso a la red.")

    socket.socket = _sin_red  # type: ignore[assignment]
    socket.create_connection = _sin_red  # type: ignore[assignment]
    socket.getaddrinfo = _sin_red  # type: ignore[assignment]


def _traceback_legible(exc: BaseException, script: str) -> tuple[str, int | None]:
    lineas = script.splitlines()
    tb = traceback.extract_tb(exc.__traceback__)
    del_script = [f for f in tb if f.filename == "<script>"]
    linea = del_script[-1].lineno if del_script else None
    partes = []
    for f in del_script:
        codigo = lineas[f.lineno - 1].strip() if f.lineno and f.lineno <= len(lineas) else ""
        partes.append(f"  línea {f.lineno}: {codigo}")
    mensaje = f"{type(exc).__name__}: {exc}"
    texto = "Traceback (en tu script):\n" + "\n".join(partes) + "\n" + mensaje if partes else mensaje
    return texto, linea


def _exportar_step(forma, ruta: str, unidad: str) -> None:
    import build123d

    if unidad == "in":
        # La geometría sigue en mm; el archivo se etiqueta en pulgadas y OpenCascade convierte los valores.
        from OCP.Interface import Interface_Static
        from OCP.STEPControl import STEPControl_AsIs, STEPControl_Writer

        escritor = STEPControl_Writer()
        Interface_Static.SetCVal_s("write.step.unit", "INCH")
        escritor.Transfer(forma.wrapped, STEPControl_AsIs)
        escritor.Write(ruta)
        Interface_Static.SetCVal_s("write.step.unit", "MM")
    else:
        build123d.export_step(forma, ruta)


_preparado = False


def precalentar() -> None:
    """Importa todo lo pesado (build123d, ~3 s) una sola vez por proceso, ANTES de bloquear la red."""
    global _preparado
    if _preparado:
        return
    sys.path.insert(0, str(RAIZ))
    import build123d  # noqa: F401
    import furnus  # noqa: F401
    from furnus import _contexto  # noqa: F401
    from furnus._geometria import motivos_de_invalidez  # noqa: F401
    from furnus_kernel import sugerencias

    sugerencias.instalar(build123d)
    _bloquear_red()
    _preparado = True


def procesar(pedido: dict, salida: Path) -> None:
    """Corre un pedido y deja resultado.json en `salida`. Lo usan el modo suelto y el trabajador."""
    precalentar()
    import build123d
    from furnus import _contexto
    from furnus._geometria import motivos_de_invalidez
    from furnus_kernel import sugerencias

    salida.mkdir(parents=True, exist_ok=True)
    script = pedido["script"]
    resultado: dict = {"ok": False, "error": None}
    (salida / "resultado.json").unlink(missing_ok=True)
    _contexto._reiniciar(pedido.get("parametros") or {})

    entorno = {"__builtins__": _builtins_seguros(), "__name__": "__furnus_script__"}
    try:
        exec(compile(script, "<script>", "exec"), entorno)
    except BaseException as exc:  # noqa: BLE001 - se informa todo al agente
        texto, linea = _traceback_legible(exc, script)
        resultado["error"] = {
            "tipo": type(exc).__name__, "mensaje": str(exc), "linea": linea, "traceback": texto,
            "sugerencia": sugerencias.sugerir(exc, entorno, build123d),
        }
        resultado["parametros"] = list(_contexto._declarados.values())
        (salida / "resultado.json").write_text(json.dumps(resultado, ensure_ascii=False), encoding="utf-8")
        return

    resultado["parametros"] = list(_contexto._declarados.values())
    pieza = entorno.get("resultado")
    motivos = motivos_de_invalidez(pieza)
    for v in _contexto._validaciones:
        for m in v["motivos"]:
            if m not in motivos:
                motivos.append(m)
    resultado["valida"] = not motivos
    resultado["motivos"] = motivos

    if pieza is None or any(m.startswith(("El script no dejó", "«resultado» no es", "La pieza no tiene ning")) for m in motivos):
        resultado["error"] = {
            "tipo": "SinResultado", "mensaje": motivos[0], "linea": None,
            "traceback": motivos[0] + " Terminá el script con: resultado = pieza.part",
        }
        (salida / "resultado.json").write_text(json.dumps(resultado, ensure_ascii=False), encoding="utf-8")
        return

    forma = getattr(pieza, "part", pieza)
    bb = forma.bounding_box()
    resultado["medidas"] = {
        "caja": [round(bb.size.X, 6), round(bb.size.Y, 6), round(bb.size.Z, 6)],
        "volumen": round(forma.volume, 6),
        "area": round(forma.area, 6),
    }
    salidas = pedido.get("salidas") or ["malla", "medidas"]
    try:
        if "malla" in salidas:
            build123d.export_gltf(forma, str(salida / "pieza.glb"), binary=True)
            resultado["malla"] = {"formato": "glb", "ruta": str(salida / "pieza.glb")}
        if "render" in salidas:
            from furnus_kernel import render

            resultado["render"] = render.renderizar(forma, pedido.get("vistas") or list(render.VISTAS), salida / "render")
        if "step" in salidas:
            _exportar_step(forma, str(salida / "pieza.step"), pedido.get("unidad", "mm"))
            resultado["step"] = {"formato": "step", "ruta": str(salida / "pieza.step")}
        if "stl" in salidas:
            build123d.export_stl(forma, str(salida / "pieza.stl"))
            resultado["stl"] = {"formato": "stl", "ruta": str(salida / "pieza.stl")}
        resultado["ok"] = True
    except BaseException as exc:  # noqa: BLE001
        resultado["error"] = {
            "tipo": type(exc).__name__, "mensaje": str(exc), "linea": None,
            "traceback": f"No se pudo exportar la pieza: {type(exc).__name__}: {exc}",
        }
    (salida / "resultado.json").write_text(json.dumps(resultado, ensure_ascii=False), encoding="utf-8")


def main() -> int:
    procesar(json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")), Path(sys.argv[2]))
    return 0


def servir() -> int:
    """Trabajador persistente: build123d ya importado, un pedido por línea de stdin, "OK" por stdout."""
    # OpenCascade escribe a stdout desde C++: el canal del protocolo es un descriptor aparte.
    canal = os.fdopen(os.dup(1), "w", encoding="utf-8")
    os.dup2(os.open(os.devnull, os.O_WRONLY), 1)
    sys.stdout = open(os.devnull, "w", encoding="utf-8")  # noqa: SIM115
    precalentar()
    canal.write("LISTO\n")
    canal.flush()
    for linea in sys.stdin:
        if not linea.strip():
            continue
        orden = json.loads(linea)
        salida = Path(orden["salida"])
        try:
            procesar(json.loads(Path(orden["pedido"]).read_text(encoding="utf-8")), salida)
        except BaseException as exc:  # noqa: BLE001 - el trabajador no debe morir por un script
            error = {"tipo": type(exc).__name__, "mensaje": str(exc), "linea": None, "traceback": str(exc), "sugerencia": None}
            (salida / "resultado.json").write_text(
                json.dumps({"ok": False, "error": error, "parametros": []}, ensure_ascii=False), encoding="utf-8"
            )
        canal.write("OK\n")
        canal.flush()
    return 0


if __name__ == "__main__":
    sys.exit(servir() if len(sys.argv) > 1 and sys.argv[1] == "--servir" else main())
