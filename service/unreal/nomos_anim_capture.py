"""Nomos · se ejecuta DENTRO del juego (`-game -windowed -ResX -ResY <mapa>`, `-ExecCmds="py …"`) en el mapa que deja
nomos_character.py: mira por la cámara `KratosCamera`, congela el clip del actor `KratosAnim` en cada fracción pedida, mide la
deformación y captura el viewport (`Shot showui`, igual que nomos_pie_capture.py).

Deformación (Global Constraints del hito 5b): la diagonal de la caja del actor en cada instante dentro de ×3 de la de reposo, ningún hueso
del componente principal con escala 0 y duración del clip > 0.

Con dos sondas fuera de cámara (`KratosReference`: malla y clip originales; `KratosProbe`: malla destino y clip retargeteado),
la altura de cadera, cabeza, pies y manos de una y otra, relativas a la cadera en reposo, no pueden diferir más de 0,15
(un MetaHuman de rodillas donde el maniquí está de pie).

Variables: NOMOS_PELVIS (JSON {target, source}), NOMOS_REPORT, NOMOS_SHOT_DIR (carpeta de PNG), NOMOS_PREFIX (nombre base), NOMOS_FRACTIONS (JSON, [0, 0.5, 0.9]),
NOMOS_REST (JSON, caja de reposo [x, y, z]), NOMOS_VIDEO_DIR (carpeta de fotogramas del vídeo; sin ella, no hay vídeo), NOMOS_WAIT (segundos antes de la primera captura; 10 por defecto).
"""
import json, os, shutil, sys, time, unreal

# el juego ejecuta este archivo con exec(): los módulos hermanos se cargan desde la carpeta de NOMOS_SCRIPT
sys.path.insert(0, os.path.dirname(os.environ.get("NOMOS_SCRIPT", "")))
from nomos_anim_follow import BONES, center, follow_report, followers, pose, stretch  # noqa: E402
from nomos_listo import Listo  # noqa: E402

REPORT = os.environ["NOMOS_REPORT"]
OUT = os.environ.get("NOMOS_SHOT_DIR") or unreal.Paths.project_saved_dir()
PREFIX = os.environ.get("NOMOS_PREFIX", "anim")
FRACTIONS = json.loads(os.environ.get("NOMOS_FRACTIONS") or "[0, 0.5, 0.9]")
REST = json.loads(os.environ.get("NOMOS_REST") or "null")
# altura de cadera en reposo {target, source} de las sondas: la pose se compara instante a instante
PELVIS = json.loads(os.environ.get("NOMOS_PELVIS") or "null") or {}
MAX_PELVIS_DIFF = 0.15
# vídeo (corrección 2): con NOMOS_VIDEO_DIR, el clip entero a 30 fps paso a paso, de 3 a 8 s, un PNG por fotograma
VIDEO_DIR, FPS, MIN_S, MAX_S = os.environ.get("NOMOS_VIDEO_DIR") or "", 30, 3.0, 8.0
WAIT, FILE_WAIT, MAX_RATIO = float(os.environ.get("NOMOS_WAIT", "10")), 20.0, 3.0
# acelera B: NOMOS_WAIT es el tope; la primera captura sale en cuanto el juego está listo (nomos_listo.py); NOMOS_WAIT_FIJA=1, el tope entero
FIJA, LISTO = os.environ.get("NOMOS_WAIT_FIJA") == "1", Listo(WAIT)
SHOTS = os.path.join(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_saved_dir()), "Screenshots")

report = {"engine": str(unreal.SystemLibrary.get_engine_version()), "map": None, "clip": None, "length": 0,
          "frames": [], "errors": [], "ok": False}
state = {"phase": "wait", "t": time.time(), "handle": None, "world": None, "i": 0}


def pngs():
    return {os.path.join(r, f) for r, _, fs in os.walk(SHOTS) for f in fs if f.lower().endswith(".png")} if os.path.isdir(SHOTS) else set()


def tagged(world, tag):
    found = unreal.GameplayStatics.get_all_actors_with_tag(world, tag)
    return found[0] if found else None


def body_of(actor):
    comps = list(actor.get_components_by_class(unreal.SkeletalMeshComponent))
    named = [c for c in comps if c.get_name() == "Body"]
    return named[0] if named else max(comps, key=lambda c: c.get_num_bones(), default=None)


def console(command):
    unreal.SystemLibrary.execute_console_command(state["world"], command)


def finish():
    frames = report["frames"]
    if state.get("followers") and len(state["body_centers"]) >= 2:
        report["followers"] = follow_report(state["followers"], state["body_centers"])
        stuck = [f["name"] for f in report["followers"] if not f["follows"]]
        if stuck:
            report["errors"].append("prendas sin seguir al cuerpo: " + ", ".join(stuck))
    report["ok"] = not report["errors"] and report["length"] > 0 and len(frames) == len(FRACTIONS) \
        and all(f["screenshot"] and f["deformation_ok"] for f in frames)
    with open(REPORT, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    unreal.log(f"NOMOS_ANIM ok={report['ok']} frames={len(frames)}")
    if state["handle"] is not None:
        unreal.unregister_slate_post_tick_callback(state["handle"])
        state["handle"] = None
    console("quit")


def freeze(comp, fraction):
    comp.set_play_rate(0.0)
    comp.set_position(fraction * report["length"], False)


def measure(fraction):
    """Congela el clip en la fracción y mide caja del actor, escala de los huesos y, con sondas, la pose frente al original."""
    comp, actor, ref, probe = state["body"], state["actor"], state.get("reference"), state.get("probe")
    for c in [comp] + [a.skeletal_mesh_component for a in (ref, probe) if a]:
        freeze(c, fraction)
    state["body_centers"].append(center(comp))
    for f in state["followers"]:
        f["centers"].append(center(f["comp"]))
    stretched = stretch(comp, actor, state["followers"])
    extent = actor.get_actor_bounds(False)[1]
    box = [round(v, 2) for v in (extent.x, extent.y, extent.z)]
    zero = [str(comp.get_bone_name(i)) for i in range(comp.get_num_bones())
            if comp.get_socket_transform(comp.get_bone_name(i), unreal.RelativeTransformSpace.RTS_COMPONENT).scale3d.length() < 1e-4]
    # diagonal de la caja: por eje, un brazo extendido multiplica el fondo (20 cm) sin que haya deformación
    diag = lambda v: sum(x * x for x in v) ** 0.5
    ratio = diag(box) / diag(REST) if REST and diag(REST) > 0 else 0
    mine = pose(probe.skeletal_mesh_component, probe, PELVIS.get("target")) if probe else None
    theirs = pose(ref.skeletal_mesh_component, ref, PELVIS.get("source")) if ref else None
    diffs = {b: round(abs(mine[b] - theirs[b]), 3) for b in BONES} if mine and theirs else {}
    worst = max(diffs, key=diffs.get) if diffs else None
    diff = diffs[worst] if worst else None
    return {"fraction": fraction, "time": round(fraction * report["length"], 3), "extent": box, "ratio": round(ratio, 3),
            "zero_scale_bones": zero[:20], "pose": mine, "reference_pose": theirs, "pose_diff": diff, "worst_bone": worst,
            "stretch": stretched, "screenshot": None,
            "deformation_ok": ratio <= MAX_RATIO and not zero and (diff is None or diff <= MAX_PELVIS_DIFF) and not stretched["errors"]}


def view(i):
    if state["cameras"][i]:
        state["pc"].set_view_target_with_blend(state["cameras"][i], 0.0)


def next_video_frame():
    """Fotograma k del vídeo: el clip (en bucle si es más corto que 3 s) congelado en k/30 s y capturado."""
    if state["k"] >= state["total"]:
        return finish()
    t = (state["k"] / FPS) % report["length"]
    for c in [state["body"]] + [a.skeletal_mesh_component for a in (state.get("reference"), state.get("probe")) if a]:
        c.set_play_rate(0.0)
        c.set_position(t, False)
    state.update(phase="settle", t=time.time())


def tick(dt):
    if state["handle"] is None:
        return
    try:
        elapsed = time.time() - state["t"]
        if state["phase"] == "wait":
            for world in unreal.ObjectIterator(unreal.World):
                if tagged(world, "KratosAnim") and unreal.GameplayStatics.get_player_controller(world, 0):
                    state["world"] = world
            if state["world"] is None:
                if elapsed > 120:
                    report["errors"].append("El juego no arrancó en 120 s")
                    finish()
                return
            if not (elapsed >= WAIT if FIJA else LISTO.tick(dt)):
                return
            world = state["world"]
            report["map"] = world.get_outermost().get_name()
            state["actor"] = tagged(world, "KratosAnim")
            state["body"] = body_of(state["actor"])
            state["reference"], state["probe"] = tagged(world, "KratosReference"), tagged(world, "KratosProbe")
            state["followers"], state["body_centers"] = followers(state["actor"], state["body"]), []
            pc = unreal.GameplayStatics.get_player_controller(world, 0)
            state.update(pc=pc, cameras=[tagged(world, "KratosCamera"), tagged(world, "KratosCamera2")])
            view(0)
            if pc.get_controlled_pawn():  # el DefaultPawn del GameModeBase es una esfera delante del personaje
                pc.get_controlled_pawn().set_actor_hidden_in_game(True)
            console("DisableAllScreenMessages")
            clip = state["body"].get_editor_property("animation_data").anim_to_play
            report["clip"] = clip.get_path_name() if clip else None
            report["length"] = round(clip.get_play_length(), 3) if clip else 0
            if not clip or report["length"] <= 0:
                report["errors"].append("El actor no reproduce ningún clip con duración")
                return finish()
            state.update(phase="pose", t=time.time())
        elif state["phase"] == "pose":
            frame = measure(FRACTIONS[state["i"]])
            report["frames"].append(frame)
            state.update(phase="settle", t=time.time())
        elif state["phase"] == "settle" and elapsed > (0.15 if state.get("video") else 0.5):
            state.update(before=pngs(), phase="shot", t=time.time())
            console("Shot showui")
        elif state["phase"] == "shot":
            new = sorted(pngs() - state["before"], key=os.path.getmtime)
            if new and os.path.getsize(new[-1]) > 0 and time.time() - os.path.getmtime(new[-1]) > 0.2:
                if state.get("video"):  # cada fotograma, desde la cámara frontal y después desde la lateral
                    side = state.get("side", False)
                    shutil.copyfile(new[-1], os.path.join(VIDEO_DIR, "lateral" if side else "", f"frame_{state['k']:04d}.png"))
                    view(0 if side else 1)
                    if not side and state["cameras"][1]:
                        return state.update(side=True, phase="settle", t=time.time())
                    state["side"] = False
                    report["video_frames"] = state["k"] = state["k"] + 1
                    return next_video_frame()
                frame = report["frames"][-1]
                target = os.path.join(OUT, f"{PREFIX}-{int(round(frame['fraction'] * 100))}.png")
                shutil.copyfile(new[-1], target)
                frame["screenshot"] = target
                state["i"] += 1
                if state["i"] >= len(FRACTIONS):
                    if not VIDEO_DIR:
                        return finish()
                    os.makedirs(os.path.join(VIDEO_DIR, "lateral"), exist_ok=True)
                    state.update(video=True, k=0, total=int(round(min(max(report["length"], MIN_S), MAX_S) * FPS)))
                    report["video_seconds"] = round(state["total"] / FPS, 2)
                    return next_video_frame()
                state.update(phase="pose", t=time.time())
            elif elapsed > FILE_WAIT:
                report["errors"].append("La captura no se escribió en 20 s")
                finish()
    except Exception as e:  # noqa: BLE001
        report["errors"].append(str(e))
        finish()


state["handle"] = unreal.register_slate_post_tick_callback(tick)
