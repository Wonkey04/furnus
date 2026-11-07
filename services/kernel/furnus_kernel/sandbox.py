"""Ejecuta runner.py en un subproceso con timeout y límite de memoria.

Fase 01, uso propio y local: NO es aislamiento real (ver docs/ARCHITECTURE.md).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from . import analisis

RUNNER = Path(__file__).with_name("runner.py")


def _timeout_s() -> float:
    return float(os.environ.get("FURNUS_TIMEOUT_S", "60"))


def _memoria_mb() -> int:
    return int(os.environ.get("FURNUS_MEMORIA_MB", "2048"))


def _error(tipo: str, mensaje: str, traceback: str | None = None, linea: int | None = None) -> dict:
    return {
        "ok": False, "malla": None, "medidas": None, "valida": False, "motivos": [], "parametros": [],
        "error": {"tipo": tipo, "mensaje": mensaje, "linea": linea, "traceback": traceback or mensaje},
    }


class _LimiteWindows:
    """Job Object: tope de memoria por proceso y muerte del árbol al cerrar."""

    def __init__(self, memoria_mb: int):
        import ctypes
        from ctypes import wintypes

        self.k32 = ctypes.WinDLL("kernel32", use_last_error=True)
        self.k32.CreateJobObjectW.restype = wintypes.HANDLE
        self.k32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        self.k32.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
        self.k32.CloseHandle.argtypes = [wintypes.HANDLE]
        self.job = self.k32.CreateJobObjectW(None, None)

        class Basico(ctypes.Structure):
            _fields_ = [("PerProcessUserTimeLimit", ctypes.c_int64), ("PerJobUserTimeLimit", ctypes.c_int64),
                        ("LimitFlags", wintypes.DWORD), ("MinimumWorkingSetSize", ctypes.c_size_t),
                        ("MaximumWorkingSetSize", ctypes.c_size_t), ("ActiveProcessLimit", wintypes.DWORD),
                        ("Affinity", ctypes.c_size_t), ("PriorityClass", wintypes.DWORD),
                        ("SchedulingClass", wintypes.DWORD)]

        class IO(ctypes.Structure):
            _fields_ = [(n, ctypes.c_uint64) for n in
                        ("ReadOps", "WriteOps", "OtherOps", "ReadBytes", "WriteBytes", "OtherBytes")]

        class Extendido(ctypes.Structure):
            _fields_ = [("Basic", Basico), ("Io", IO), ("ProcessMemoryLimit", ctypes.c_size_t),
                        ("JobMemoryLimit", ctypes.c_size_t), ("PeakProcess", ctypes.c_size_t),
                        ("PeakJob", ctypes.c_size_t)]

        info = Extendido()
        # KILL_ON_JOB_CLOSE (0x2000) | PROCESS_MEMORY (0x100)
        info.Basic.LimitFlags = 0x2000 | 0x100
        info.ProcessMemoryLimit = memoria_mb * 1024 * 1024
        self.k32.SetInformationJobObject(self.job, 9, ctypes.byref(info), ctypes.sizeof(info))

    def asignar(self, proc: subprocess.Popen) -> None:
        self.k32.AssignProcessToJobObject(self.job, int(proc._handle))  # type: ignore[attr-defined]

    def cerrar(self) -> None:
        self.k32.CloseHandle(self.job)


def ejecutar(pedido: dict, directorio_salida: str | None = None) -> dict:
    script = pedido.get("script")
    if not isinstance(script, str) or not script.strip():
        return _error("PedidoInvalido", "Falta el campo «script».")

    problemas = analisis.analizar(script)
    if problemas:
        texto = "El script no pasó el análisis previo:\n" + "\n".join("  " + p.texto() for p in problemas)
        return _error("ScriptProhibido", problemas[0].mensaje, texto, problemas[0].linea)

    salida = Path(directorio_salida) if directorio_salida else Path(tempfile.mkdtemp(prefix="furnus-"))
    salida.mkdir(parents=True, exist_ok=True)
    pedido_json = salida / "pedido.json"
    pedido_json.write_text(json.dumps(pedido), encoding="utf-8")
    (salida / "resultado.json").unlink(missing_ok=True)

    timeout, memoria = _timeout_s(), _memoria_mb()
    kwargs: dict = {}
    limite = None
    if sys.platform == "win32":
        kwargs["creationflags"] = 0x08000000  # CREATE_NO_WINDOW
        limite = _LimiteWindows(memoria)
    else:
        import resource

        def preparar():
            os.setsid()
            tope = memoria * 1024 * 1024
            resource.setrlimit(resource.RLIMIT_AS, (tope, tope))

        kwargs["preexec_fn"] = preparar

    entorno = {k: v for k, v in os.environ.items() if k in ("SYSTEMROOT", "PATH", "TEMP", "TMP", "HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "APPDATA", "LOCALAPPDATA")}
    proc = subprocess.Popen(
        [sys.executable, "-I", str(RUNNER), str(pedido_json), str(salida)],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=entorno, **kwargs,
    )
    err = b""
    try:
        if limite:
            limite.asignar(proc)
        try:
            _, err = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            _matar(proc)
            return _error(
                "Timeout",
                f"El script tardó más de {timeout:g} s y se canceló.",
                f"El script tardó más de {timeout:g} s y se canceló. Simplificá la geometría "
                "(menos operaciones booleanas o patrones más chicos).",
            )
    finally:
        if limite:
            limite.cerrar()

    archivo = salida / "resultado.json"
    if not archivo.exists():
        detalle = err.decode("utf-8", "replace").strip()[-1500:]
        if proc.returncode not in (0, None) or "MemoryError" in detalle:
            return _error(
                "ProcesoCaido",
                f"El proceso terminó sin resultado (código {proc.returncode}). Puede haber superado "
                f"el límite de {memoria} MB de memoria.",
                detalle or None,
            )
        return _error("SinResultado", "El proceso no devolvió resultado.", detalle or None)
    return json.loads(archivo.read_text(encoding="utf-8"))


def _matar(proc: subprocess.Popen) -> None:
    if sys.platform == "win32":
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
    else:
        import signal
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    proc.wait()
