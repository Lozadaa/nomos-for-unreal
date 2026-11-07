"""Nomos · `nomos ue test`: «Automation RunTests <filtro>» dentro del editor caliente.

El editor caliente se lanza con -ReportExportPath=NOMOS_CALIENTE/tests, así que al acabar cada pasada el controlador
de automatización escribe ahí index.json (lo lee el servicio). «; Now» quita la espera fija de 5 s antes de empezar.
Un filtro que no casa con ningún test no escribe informe: se detecta en el log del editor.
"""
import glob, json, os, unreal

FILTRO = os.environ["NOMOS_TEST_FILTRO"]
INDICE = os.path.join(os.environ["NOMOS_CALIENTE"], "tests", "index.json")
if os.path.exists(INDICE):
    os.remove(INDICE)
logs = glob.glob(os.path.join(unreal.Paths.project_log_dir(), "*.log"))
LOG = max(logs, key=os.path.getmtime) if logs else None
st = {"pos": os.path.getsize(LOG) if LOG else 0}
unreal.SystemLibrary.execute_console_command(None, f"Automation RunTests {FILTRO}; Now")


def nomos_pendiente():
    if os.path.exists(INDICE):
        try:
            json.load(open(INDICE, encoding="utf-8-sig"))
            return True
        except ValueError:
            return False  # a medio escribir
    if LOG:
        with open(LOG, "rb") as f:
            f.seek(st["pos"])
            nuevo = f.read().decode("utf-8", "replace")
            st["pos"] = max(st["pos"], f.tell() - 200)  # con solape: la línea puede llegar a medias
        if "No automation tests matched" in nuevo:
            raise RuntimeError(f"No automation tests matched '{FILTRO}'")
    return False
