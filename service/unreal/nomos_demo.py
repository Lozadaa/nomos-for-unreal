"""Nomos · tres capturas del modo demo DENTRO del juego lanzado desde el editor (`-game`, con `-ExecCmds="py …"`).

El juego arranca con la variable de su modo demo (p. ej. TROMPO_AUTO=1) y se juega solo. A los segundos pedidos (desde que
hay mundo con jugador) pausa, escribe el JSON de escena (nomos_escena.py) y captura con la UI (`Shot showui`).
Lo usan la comprobación `imagen` del servicio y `Scripts/capturar.ps1 -Demo` de la semilla; las mide revisar_imagen.py.

Variables de entorno:
  NOMOS_DEMO_DIR       carpeta donde quedan inicio.png, mitad.png y final.png con su .json
  NOMOS_DEMO_SEGUNDOS  "3,20,45" por defecto
  NOMOS_REPORT         informe JSON {capturas, errors}
"""
import json, os, shutil, sys, time, unreal

sys.path.insert(0, os.path.dirname(os.environ.get("NOMOS_SCRIPT", "")))
from nomos_escena import escena  # noqa: E402

DIR = os.environ["NOMOS_DEMO_DIR"]
SEGUNDOS = [float(s) for s in os.environ.get("NOMOS_DEMO_SEGUNDOS", "3,20,45").split(",")][:3]
NOMBRES = ["inicio", "mitad", "final"]
REPORT = os.environ.get("NOMOS_REPORT") or os.path.join(DIR, "demo.json")
SHOTS = os.path.join(unreal.Paths.project_saved_dir(), "Screenshots")
report = {"capturas": [], "errors": []}
state = {"phase": "wait", "t0": None, "t": time.time(), "i": 0, "world": None, "handle": None, "before": set()}
os.makedirs(DIR, exist_ok=True)


def pngs():
    return {os.path.join(r, f) for r, _, fs in os.walk(SHOTS) for f in fs if f.lower().endswith(".png")} if os.path.isdir(SHOTS) else set()


def console(command):
    unreal.SystemLibrary.execute_console_command(state["world"], command)


def game_world():
    for world in unreal.ObjectIterator(unreal.World):
        try:
            if unreal.GameplayStatics.get_player_controller(world, 0):
                return world
        except Exception:  # noqa: BLE001
            continue
    return None


def finish():
    with open(REPORT, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    unreal.log(f"NOMOS_DEMO_CAPTURAS {len(report['capturas'])} errores={len(report['errors'])}")
    if state["handle"] is not None:
        unreal.unregister_slate_post_tick_callback(state["handle"])
        state["handle"] = None
    console("quit")


def tick(_dt):
    if state["handle"] is None:
        return
    try:
        now = time.time()
        if state["phase"] == "wait":
            state["world"] = state["world"] or game_world()
            if state["world"] is None:
                if now - state["t"] > 120:
                    report["errors"].append("El juego no arrancó en 120 s")
                    finish()
                return
            state["t0"] = state["t0"] or now
            if now - state["t0"] >= SEGUNDOS[state["i"]]:
                console("pause")  # mismo fotograma para el JSON y la imagen
                target = os.path.join(DIR, NOMBRES[state["i"]] + ".png")
                escena(state["world"], target)
                state.update(before=pngs(), target=target, phase="shot", t=now)
                console("Shot showui")
        elif state["phase"] == "shot":
            new = sorted(pngs() - state["before"], key=os.path.getmtime)
            if new and os.path.getsize(new[-1]) > 0 and now - os.path.getmtime(new[-1]) > 0.5:
                shutil.copyfile(new[-1], state["target"])
                report["capturas"].append(state["target"])
                console("pause")
                # la pausa no cuenta: el siguiente segundo se mide en tiempo de juego
                state["t0"] += now - state["t"]
                state.update(i=state["i"] + 1, phase="wait", t=now)
                if state["i"] >= len(SEGUNDOS):
                    finish()
            elif now - state["t"] > 20:
                report["errors"].append(f"La captura {NOMBRES[state['i']]} no se escribió en 20 s")
                finish()
    except Exception as e:  # noqa: BLE001
        report["errors"].append(str(e))
        finish()


state["handle"] = unreal.register_slate_post_tick_callback(tick)
