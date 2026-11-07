"""Nomos · se ejecuta DENTRO del juego lanzado desde el editor (`-game -windowed -ResX -ResY <mapa>`, con `-ExecCmds="py …"`).

Espera a que el juego arranque, pausa, captura el viewport CON la UI (`Shot showui`), oculta los widgets y vuelve a capturar
SIN UI (captura de control), en el mismo fotograma pausado. Probado en UE 5.8.3: en PIE desde el editor por lotes
`Shot showui` captura la ventana entera del editor (2560×1392) y no el viewport del juego; por eso se usa `-game`.

Variables de entorno:
  NOMOS_REPORT  ruta del informe JSON
  NOMOS_SHOT    PNG con la UI;  NOMOS_CONTROL  PNG sin UI (opcional: sin ella no hay captura de control)
  NOMOS_WAIT    tope de segundos de juego antes de capturar (30 por defecto): se captura antes si el juego está listo
                (nomos_listo.py: fotogramas estables y sin shaders compilando); NOMOS_WAIT_FIJA=1 espera el tope entero
  NOMOS_WIDGETS lista JSON de clases de widget esperadas; sin ella vale cualquier UserWidget en el viewport
  NOMOS_VIEWS   (hito 10) lista JSON de vistas extra {view, path}: cámara libre que orbita al pawn, HighResShot sin UI
  NOMOS_VIEWS_BUDGET  segundos para las vistas extra (90); pasado el plazo se entregan las que haya y se anota

Junto a cada PNG queda `<png>.json` (escena.py): cámara, pawn y los actores que se ven, con su posición en el mundo y en la
imagen. Idea tomada de per-simmons/unreal-agent-harness (capturas anotadas): el revisor razona posiciones sin otra sonda.
"""
import json, os, shutil, sys, time, unreal

# el juego ejecuta este archivo con exec(): los módulos hermanos se cargan desde la carpeta de NOMOS_SCRIPT
sys.path.insert(0, os.path.dirname(os.environ.get("NOMOS_SCRIPT", "")))
from nomos_listo import Listo  # noqa: E402
from nomos_escena import escena  # noqa: E402

REPORT = os.environ["NOMOS_REPORT"]
SHOT = os.environ.get("NOMOS_SHOT") or os.path.join(unreal.Paths.project_saved_dir(), "nomos-ui.png")
CONTROL = os.environ.get("NOMOS_CONTROL", "")
# acelera B: NOMOS_WAIT ya no es una espera fija sino el tope; se captura en cuanto el juego está listo (nomos_listo.py).
# NOMOS_WAIT_FIJA=1 vuelve a esperar NOMOS_WAIT entero (para comparar)
WAIT = float(os.environ.get("NOMOS_WAIT", "30"))
FIJA = os.environ.get("NOMOS_WAIT_FIJA") == "1"
LISTO = Listo(WAIT)
EXPECTED = json.loads(os.environ.get("NOMOS_WIDGETS") or "[]")
# margen para que aparezca la UI tras estar listo: 20 s si la captura es de UI (control o widgets pedidos); si no (mapa), 5 s
UI_WAIT, FILE_WAIT = 20.0 if CONTROL or EXPECTED or FIJA else 5.0, 20.0
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
    unreal.log(f"NOMOS_PIE ok={report['ok']} shot={report['screenshot']} widgets={len(report['widgets'])}")
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


# --- Hito 10: vistas extra con un rig de cámara fijo relativo al pawn ------------------------------------------------
# NOMOS_VIEWS   lista JSON [{"view": "left|right|top", "path": "..."}]: tras las capturas del jugador, una vista por cámara libre
# NOMOS_VIEWS_BUDGET  segundos para todas las vistas extra (90): se entregan las que haya y se anota
VIEWS = json.loads(os.environ.get("NOMOS_VIEWS") or "[]")
BUDGET = float(os.environ.get("NOMOS_VIEWS_BUDGET", "90"))
report["views"] = {}


# Cámara libre del PlayerCameraManager («camera freecam»): orbita al pawn con la rotación de control a la distancia que se
# fije. Probado en UE 5.8.3 -game: desde Python no se pueden crear actores en el mundo de juego (no hay spawn expuesto).
RIG = {"left": (45 + 180, -24.6, 385.0), "right": (-45 + 180, -24.6, 385.0), "top": (0.0, -45.0, 600.0)}


def aim(item):
    """3/4 izquierda y derecha: a 3,5 m y 1,6 m de altura mirando al pawn (385 cm de órbita, -24,6°); picado: 6 m a 45°."""
    world = state["world"]
    pawn = unreal.GameplayStatics.get_player_pawn(world, 0)
    yaw = pawn.get_actor_rotation().yaw if pawn else 0.0
    turn, pitch, distance = RIG[item["view"]]
    if not state.get("freecam"):
        console("pause")  # el juego estaba en pausa para las capturas del jugador; la cámara libre necesita que avance
        console("camera freecam")
        state["freecam"] = True
    unreal.GameplayStatics.get_player_camera_manager(world, 0).set_editor_property("free_cam_distance", distance)
    unreal.GameplayStatics.get_player_controller(world, 0).set_control_rotation(unreal.Rotator(0.0, pitch, yaw + turn))


def view_tick():
    """Una vista por vuelta: apuntar, esperar medio segundo, HighResShot (sin UI) y copiar el PNG nuevo."""
    if time.time() - state["views_t"] > BUDGET:
        report["views_note"] = f"Vistas extra cortadas a los {int(BUDGET)} s: {len(report['views'])} de {len(VIEWS)}"
        return finish()
    if state["view"] >= len(VIEWS):
        return finish()
    item = VIEWS[state["view"]]
    if state["phase"] == "view-aim":
        aim(item)
        state.update(phase="view-wait", t=time.time())
    elif state["phase"] == "view-wait" and time.time() - state["t"] > 1.0:
        report.setdefault("escenas", {})[item["view"]] = escena(state["world"], item["path"])
        state.update(before=pngs(), target=item["path"], phase="view-shot", t=time.time())
        console("HighResShot 1280x720")
    elif state["phase"] == "view-shot":
        new = sorted(pngs() - state["before"], key=os.path.getmtime)
        if new and os.path.getsize(new[-1]) > 0 and time.time() - os.path.getmtime(new[-1]) > 0.5:
            shutil.copyfile(new[-1], item["path"])
            report["views"][item["view"]] = item["path"]
            state.update(view=state["view"] + 1, phase="view-aim")
        elif time.time() - state["t"] > FILE_WAIT:
            report.setdefault("views_errors", []).append(f"{item['view']}: la captura no se escribió en 20 s")
            state.update(view=state["view"] + 1, phase="view-aim")


def start_views():
    """Tras las capturas del jugador: si hay vistas pedidas, el rig; si no, terminar."""
    if not VIEWS:
        return finish()
    state.update(phase="view-aim", view=0, views_t=time.time())


def tick(dt):
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
            listo = elapsed >= WAIT if FIJA else LISTO.tick(dt)
            if listo and (ready or elapsed >= (WAIT if FIJA else LISTO.espera) + UI_WAIT):
                report["espera"] = {"s": round(elapsed, 2), "motivo": "fija" if FIJA else LISTO.motivo}
                state["found"] = found
                console("pause")  # mismo fotograma para las dos capturas: solo cambia la UI
                report["escena"] = escena(state["world"], SHOT)
                shoot(SHOT, "ui")
        elif state["phase"] == "ui" and landed("screenshot"):
            if not CONTROL:
                return start_views()
            for widget in state["found"]:
                widget.set_visibility(unreal.SlateVisibility.COLLAPSED)
            state.update(phase="hide", t=time.time())
        elif state["phase"] == "hide" and elapsed > 0.5:
            shoot(CONTROL, "control")
        elif state["phase"] == "control" and landed("control"):
            start_views()
        elif state["phase"].startswith("view"):
            try:
                view_tick()
            except Exception as e:  # noqa: BLE001  una vista que falla no tumba la comprobación: se anota y se entrega lo que haya
                report.setdefault("views_errors", []).append(str(e))
                finish()
    except Exception as e:  # noqa: BLE001
        report["errors"].append(str(e))
        finish()


state["handle"] = unreal.register_slate_post_tick_callback(tick)
