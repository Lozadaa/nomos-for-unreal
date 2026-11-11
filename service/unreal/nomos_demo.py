"""Nomos · tres capturas del modo demo DENTRO del juego lanzado desde el editor (`-game`, con `-ExecCmds="py …"`).

El juego arranca con la variable de su modo demo (p. ej. TROMPO_AUTO=1) y se juega solo. A los segundos pedidos (desde que
hay mundo con jugador) pausa, escribe el JSON de escena (nomos_escena.py) y captura con la UI (`Shot showui`).
Lo usan la comprobación `imagen` del servicio y `Scripts/capturar.ps1 -Demo` de la semilla; las mide revisar_imagen.py.
Después (juez de arte, 2026-11-11) saca un primer plano sin UI de cada actor con rol, `detalle-<rol>.png`: cámara libre a tres
cuartos sobre el actor, a la distancia en que ocupa ~50 % del alto. El rol sale de la etiqueta que pone `<Juego>Aspecto::Vestir`
(Actor.Tags); sin etiquetas, el pawn es el protagonista y del resto, el más cercano de cada clase.

Variables de entorno:
  NOMOS_DEMO_DIR       carpeta donde quedan inicio.png, mitad.png y final.png con su .json
  NOMOS_DEMO_SEGUNDOS  "3,20,45" por defecto
  NOMOS_REPORT         informe JSON {capturas, detalles, errors}
  NOMOS_DEMO_DETALLE   "0" sin primeros planos
  NOMOS_DEMO_ROLES     "Protagonista,Amenaza,Objetivo,Escenario" por defecto
"""
import json, math, os, re, shutil, sys, time, unreal

sys.path.insert(0, os.path.dirname(os.environ.get("NOMOS_SCRIPT", "")))
from nomos_escena import escena, _hidden  # noqa: E402

DIR = os.environ["NOMOS_DEMO_DIR"]
SEGUNDOS = [float(s) for s in os.environ.get("NOMOS_DEMO_SEGUNDOS", "3,20,45").split(",")][:3]
NOMBRES = ["inicio", "mitad", "final"]
REPORT = os.environ.get("NOMOS_REPORT") or os.path.join(DIR, "demo.json")
SHOTS = os.path.join(unreal.Paths.project_saved_dir(), "Screenshots")
DETALLE = os.environ.get("NOMOS_DEMO_DETALLE", "1") != "0"
ROLES = [r for r in os.environ.get("NOMOS_DEMO_ROLES", "Protagonista,Amenaza,Objetivo,Escenario").split(",") if r]
report = {"capturas": [], "detalles": [], "errors": []}
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


def etiquetas(actor):
    try:
        return actor.get_editor_property("tags") or []
    except Exception:  # noqa: BLE001
        return []


def objetivos(world):
    """[(nombre, actor)]: uno por rol etiquetado; sin etiquetas, el pawn y el más cercano de cada clase con geometría."""
    pawn = unreal.GameplayStatics.get_player_pawn(world, 0)
    actores = [a for a in unreal.GameplayStatics.get_all_actors_of_class(world, unreal.Actor) if not _hidden(a)]
    out = []
    for rol in ROLES:
        tagged = [a for a in actores if any(str(t) == rol for t in etiquetas(a))]
        if tagged:
            out.append((rol.lower(), tagged[0]))
    if out:
        return out
    if pawn:
        out.append(("protagonista", pawn))
    cam = unreal.GameplayStatics.get_player_camera_manager(world, 0).get_camera_location()
    cerca = sorted(actores, key=lambda a: (a.get_actor_location() - cam).length())
    # otro de la misma clase que el pawn suele ser el rival (trompos, coches, luchadores)
    rival = next((a for a in cerca if pawn and a != pawn and a.get_class() == pawn.get_class()), None)
    if rival:
        out.append(("amenaza", rival))
    vistos = {pawn.get_class().get_name()} if pawn else set()
    for a in cerca:
        cls = a.get_class().get_name()
        if a == pawn or cls in vistos or any(w in cls for w in ("Controller", "Manager", "GameMode", "State", "HUD", "Info", "Volume",
                                                                 "Light", "Fog", "Sky", "Camera", "PostProcess", "Brush", "Debug",
                                                                 "PlayerStart", "Note", "Audio", "Sound")):
            continue
        _, ext = a.get_actor_bounds(False)
        if max(ext.x, ext.y, ext.z) < 1:
            continue
        vistos.add(cls)
        out.append((re.sub(r"\W+", "", cls).lower(), a))
        if len(out) >= 4:
            break
    return out


def sin_choque_de_camara(world):
    """El barrido de la cámara libre arranca en el pivote del actor: con el pivote en el suelo (la punta de un trompo) choca
    al empezar y la cámara queda dentro del actor. Solo el canal Camera (consultas), no la física: el juego sigue igual."""
    for a in unreal.GameplayStatics.get_all_actors_of_class(world, unreal.Actor):
        try:
            for c in a.get_components_by_class(unreal.PrimitiveComponent):
                c.set_collision_response_to_channel(unreal.CollisionChannel.ECC_CAMERA, unreal.CollisionResponseType.ECR_IGNORE)
        except Exception:  # noqa: BLE001
            continue


def apuntar(actor):
    """Cámara libre orbitando al actor (view target) a tres cuartos (45° de lado, 25° desde arriba); ~50 % del alto."""
    pc = unreal.GameplayStatics.get_player_controller(state["world"], 0)
    cm = unreal.GameplayStatics.get_player_camera_manager(state["world"], 0)
    # solo lo que colisiona: estelas, indicadores o luces hijas inflan la caja entera
    origin, ext = actor.get_actor_bounds(True)
    if max(ext.x, ext.y, ext.z) < 1:
        origin, ext = actor.get_actor_bounds(False)
    size = max(2 * ext.z, 1.2 * max(ext.x, ext.y), 10.0)
    half_v = math.atan(math.tan(math.radians(cm.get_fov_angle() / 2)) * 9 / 16)
    pc.set_view_target_with_blend(actor, 0.0)
    if not state.get("freecam"):
        console("camera freecam")
        state["freecam"] = True
    # 0,55: medido en Trompo, con 1,0 el actor ocupaba ~20 % del alto (la cámara libre no usa el FOV del juego)
    cm.set_editor_property("free_cam_distance", min(0.55 * size / math.tan(half_v), 8000.0))
    # que orbite el centro de la caja y no el pivote: con el pivote en el suelo (la punta de un trompo) el barrido de la
    # cámara (caja de 12 cm) arranca dentro del suelo y la deja pegada al actor. El desplazamiento va en ejes de la cámara.
    alto = max(origin.z - actor.get_actor_location().z, 0.0) + 15.0
    try:
        cm.set_editor_property("free_cam_offset", unreal.Vector(0.0, 0.0, alto))
    except Exception as e:  # noqa: BLE001
        report.setdefault("avisos", []).append(f"free_cam_offset: {e}")
    pc.set_control_rotation(unreal.Rotator(0.0, -25.0, actor.get_actor_rotation().yaw + 135.0))
    return {"centro": [round(origin.x), round(origin.y), round(origin.z)], "tam": round(size), "dist": round(cm.get_editor_property("free_cam_distance")),
            "camara": [round(v) for v in (cm.get_camera_location().x, cm.get_camera_location().y, cm.get_camera_location().z)],
            "rot": [round(cm.get_camera_rotation().pitch, 1), round(cm.get_camera_rotation().yaw, 1)]}


def detalle_tick(now):
    if now - state["d0"] > 90 or state["d"] >= len(state["objetivos"]):
        return finish()
    nombre, actor = state["objetivos"][state["d"]]
    if state["phase"] == "d-aim":
        apuntar(actor)
        state.update(phase="d-wait", t=now)
    elif state["phase"] == "d-wait" and now - state["t"] > 1.0:
        report.setdefault("detalles_info", {})[nombre] = apuntar(actor)  # el actor se movió (gira, rueda): se reapunta justo antes de la captura
        state.update(before=pngs(), target=os.path.join(DIR, f"detalle-{nombre}.png"), phase="d-shot", t=now)
        console("HighResShot 1280x720")
    elif state["phase"] == "d-shot":
        new = sorted(pngs() - state["before"], key=os.path.getmtime)
        if new and os.path.getsize(new[-1]) > 0 and now - os.path.getmtime(new[-1]) > 0.5:
            shutil.copyfile(new[-1], state["target"])
            report["detalles"].append(state["target"])
            state.update(d=state["d"] + 1, phase="d-aim", t=now)
        elif now - state["t"] > 20:
            report["errors"].append(f"El detalle {nombre} no se escribió en 20 s")
            state.update(d=state["d"] + 1, phase="d-aim", t=now)


def tick(_dt):
    if state["handle"] is None:
        return
    try:
        now = time.time()
        if state["phase"].startswith("d-"):
            return detalle_tick(now)
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
                    if not DETALLE:
                        return finish()
                    sin_choque_de_camara(state["world"])
                    state.update(objetivos=objetivos(state["world"]), d=0, d0=now, phase="d-aim")
            elif now - state["t"] > 20:
                report["errors"].append(f"La captura {NOMBRES[state['i']]} no se escribió en 20 s")
                finish()
    except Exception as e:  # noqa: BLE001
        report["errors"].append(str(e))
        finish()


state["handle"] = unreal.register_slate_post_tick_callback(tick)
