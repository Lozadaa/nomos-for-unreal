"""Kratos · se ejecuta DENTRO del juego lanzado desde el editor (`-game -windowed -ResX -ResY <mapa>`, con `-ExecCmds="py …"`).

Espera a que el juego arranque, pausa, captura el viewport CON la UI (`Shot showui`), oculta los widgets y vuelve a capturar
SIN UI (captura de control), en el mismo fotograma pausado. Probado en UE 5.8.3: en PIE desde el editor por lotes
`Shot showui` captura la ventana entera del editor (2560×1392) y no el viewport del juego; por eso se usa `-game`.

Variables de entorno:
  KRATOS_REPORT  ruta del informe JSON
  KRATOS_SHOT    PNG con la UI;  KRATOS_CONTROL  PNG sin UI (opcional: sin ella no hay captura de control)
  KRATOS_WAIT    segundos de juego antes de capturar (30 por defecto)
  KRATOS_WIDGETS lista JSON de clases de widget esperadas; sin ella vale cualquier UserWidget en el viewport
"""
import json, os, shutil, time, unreal

REPORT = os.environ["KRATOS_REPORT"]
SHOT = os.environ.get("KRATOS_SHOT") or os.path.join(unreal.Paths.project_saved_dir(), "kratos-ui.png")
CONTROL = os.environ.get("KRATOS_CONTROL", "")
WAIT = float(os.environ.get("KRATOS_WAIT", "30"))
EXPECTED = json.loads(os.environ.get("KRATOS_WIDGETS") or "[]")
UI_WAIT, FILE_WAIT = 20.0, 20.0
SHOTS = os.path.join(unreal.Paths.project_saved_dir(), "Screenshots")

report = {"engine": str(unreal.SystemLibrary.get_engine_version()), "map": None, "widgets": [],
          "screenshot": None, "control": None, "errors": [], "ok": False}
state = {"phase": "wait", "t": time.time(), "handle": None, "world": None, "target": None}


def pngs():
    return {os.path.join(r, f) for r, _, fs in os.walk(SHOTS) for f in fs if f.lower().endswith(".png")} if os.path.isdir(SHOTS) else set()


def game_world():
    for world in unreal.ObjectIterator(unreal.World):
        try:
            if unreal.GameplayStatics.get_player_controller(world, 0):
                return world
        except Exception:  # noqa: BLE001
            continue
    return None


def console(command):
    unreal.SystemLibrary.execute_console_command(state["world"], command)


def finish():
    report["ok"] = bool(report["screenshot"]) and (not CONTROL or bool(report["control"])) and not report["errors"]
    with open(REPORT, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    unreal.log(f"KRATOS_PIE ok={report['ok']} shot={report['screenshot']} widgets={len(report['widgets'])}")
    if state["handle"] is not None:
        unreal.unregister_slate_post_tick_callback(state["handle"])
        state["handle"] = None
    console("quit")


def shoot(target, phase):
    state.update(before=pngs(), target=target, phase=phase, t=time.time())
    console("Shot showui")  # captura el viewport con Slate/UMG; HighResShot solo renderiza la escena


def landed(key):
    new = sorted(pngs() - state["before"], key=os.path.getmtime)
    if new and os.path.getsize(new[-1]) > 0 and time.time() - os.path.getmtime(new[-1]) > 0.5:
        shutil.copyfile(new[-1], state["target"])
        report[key] = state["target"]
        return True
    if time.time() - state["t"] > FILE_WAIT:
        report["errors"].append("La captura no se escribió en 20 s")
        finish()
    return False


def tick(_dt):
    if state["handle"] is None:
        return
    try:
        elapsed = time.time() - state["t"]
        if state["phase"] == "wait":
            state["world"] = state["world"] or game_world()
            if state["world"] is None:
                if elapsed > 120:
                    report["errors"].append("El juego no arrancó en 120 s")
                    finish()
                return
            report["map"] = state["world"].get_outermost().get_name()
            found = [w for w in unreal.WidgetLibrary.get_all_widgets_of_class(state["world"], unreal.UserWidget, True) or [] if w.is_in_viewport()]
            report["widgets"] = [w.get_class().get_name() for w in found]
            ready = report["widgets"] and (not EXPECTED or any(e in report["widgets"] for e in EXPECTED))
            if elapsed >= WAIT and (ready or elapsed >= WAIT + UI_WAIT):
                state["found"] = found
                console("pause")  # mismo fotograma para las dos capturas: solo cambia la UI
                shoot(SHOT, "ui")
        elif state["phase"] == "ui" and landed("screenshot"):
            if not CONTROL:
                return finish()
            for widget in state["found"]:
                widget.set_visibility(unreal.SlateVisibility.COLLAPSED)
            state.update(phase="hide", t=time.time())
        elif state["phase"] == "hide" and elapsed > 0.5:
            shoot(CONTROL, "control")
        elif state["phase"] == "control" and landed("control"):
            finish()
    except Exception as e:  # noqa: BLE001
        report["errors"].append(str(e))
        finish()


state["handle"] = unreal.register_slate_post_tick_callback(tick)
