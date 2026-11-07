"""Nomos · cuándo capturar en el juego (`-game`) sin esperar un tiempo fijo (docs/x10/acelera.md, mejora B).

En UE 5.8.3 el Python del juego no tiene ShaderCompilingManager, AssetCompilingManager ni IsAsyncLoading (lo comprobé
con dir(unreal) en -game). Las señales que sí hay:
- fotogramas estables: los últimos FRAMES ticks por debajo de DT_MAX (cargas y compilaciones síncronas dan tirones);
- ningún ShaderCompileWorker trabajando: la suma de su CPU (Toolhelp + GetProcessTimes, solo Windows) no crece en 0,5 s.
Se captura cuando las dos se cumplen y han pasado MINIMO segundos (NOMOS_WAIT_MIN, 1 por defecto), o al llegar al
tope (NOMOS_WAIT del llamador, que antes era la espera fija). `motivo` dice cuál fue: 'listo' o 'tope'.
"""
import ctypes
import os
import sys
import time

MINIMO = float(os.environ.get("NOMOS_WAIT_MIN", "1"))
FRAMES, DT_MAX = 10, 0.1


def _cpu_scw():
    """(procesos, segundos de CPU) de los ShaderCompileWorker vivos; None fuera de Windows."""
    if sys.platform != "win32":
        return None
    from ctypes import wintypes as w

    class Entrada(ctypes.Structure):
        _fields_ = [("dwSize", w.DWORD), ("cntUsage", w.DWORD), ("th32ProcessID", w.DWORD), ("th32DefaultHeapID", ctypes.c_size_t),
                    ("th32ModuleID", w.DWORD), ("cntThreads", w.DWORD), ("th32ParentProcessID", w.DWORD),
                    ("pcPriClassBase", ctypes.c_long), ("dwFlags", w.DWORD), ("szExeFile", ctypes.c_wchar * 260)]
    k32 = ctypes.WinDLL("kernel32")
    k32.CreateToolhelp32Snapshot.restype = w.HANDLE
    k32.OpenProcess.restype = w.HANDLE
    foto, e, n, cpu = k32.CreateToolhelp32Snapshot(2, 0), Entrada(), 0, 0.0
    e.dwSize = ctypes.sizeof(Entrada)
    sigue = k32.Process32FirstW(foto, ctypes.byref(e))
    while sigue:
        if e.szExeFile.lower().startswith("shadercompileworker"):
            n += 1
            h = k32.OpenProcess(0x1000, False, e.th32ProcessID)  # PROCESS_QUERY_LIMITED_INFORMATION
            if h:
                t = [w.FILETIME() for _ in range(4)]
                if k32.GetProcessTimes(h, *[ctypes.byref(x) for x in t]):
                    cpu += sum((x.dwHighDateTime << 32 | x.dwLowDateTime) for x in t[2:]) / 1e7
                k32.CloseHandle(h)
        sigue = k32.Process32NextW(foto, ctypes.byref(e))
    k32.CloseHandle(foto)
    return n, cpu


class Listo:
    """`tick(dt)` en cada tick de la espera; True cuando se puede capturar. `espera` y `motivo` van al informe."""

    def __init__(self, tope):
        self.t0, self.tope, self.estables = time.time(), tope, 0
        self.scw, self.t_scw, self.quieto = None, 0.0, False
        self.espera, self.motivo = None, None

    def tick(self, dt):
        if self.motivo:
            return True
        ahora = time.time()
        self.estables = self.estables + 1 if dt < DT_MAX else 0
        if ahora - self.t_scw >= 0.5:  # ~13 ms por consulta: cada medio segundo, no en cada tick
            scw = _cpu_scw()
            self.quieto = scw is None or (self.scw is not None and scw[0] == self.scw[0] and scw[1] - self.scw[1] < 0.05)
            self.scw, self.t_scw = scw, ahora
        pasado = ahora - self.t0
        if pasado >= self.tope or (pasado >= MINIMO and self.estables >= FRAMES and self.quieto):
            self.espera, self.motivo = round(pasado, 2), "tope" if pasado >= self.tope else "listo"
            return True
        return False


if __name__ == "__main__":  # comprobacion rapida fuera de Unreal: python nomos_listo.py
    MINIMO = 0.0
    l = Listo(5)
    l.quieto, l.t_scw = True, time.time() + 99  # sin consultar procesos
    assert not any(l.tick(0.3) for _ in range(20)), "con tirones no esta listo"
    assert [l.tick(0.01) for _ in range(10)][-1] and l.motivo == "listo"
    t = Listo(0)
    assert t.tick(0.5) and t.motivo == "tope"
    print("ok")
