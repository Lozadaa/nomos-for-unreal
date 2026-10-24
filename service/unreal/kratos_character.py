"""Kratos · prepara un personaje animado DENTRO del editor sin GUI (UnrealEditor-Cmd -ExecutePythonScript).

Carga la malla (SkeletalMesh) o el Blueprint del personaje (un MetaHuman: su componente `Body`), resuelve su esqueleto y,
por cada animación: mismo esqueleto → se usa; distinto → retarget por lotes (kratos_retarget.py). Después crea o reutiliza el
mapa de prueba (`KRATOS_MAP`, desde Template_Default) con el personaje reproduciendo el primer clip, una cámara delante y el
GameModeBase como modo de juego (sin el HUD del juego), y lo guarda. El juego (`-game`) lo captura con kratos_anim_capture.py.

Variables: KRATOS_REPORT, KRATOS_MESH, KRATOS_ANIMATIONS (JSON), KRATOS_TARGET ('metahuman' o vacío), KRATOS_MAP.
"""
import json, os, re, sys, unreal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kratos_retarget import retarget, short  # noqa: E402

# base de la columna: en el cuerpo MetaHuman «pelvis» es un socket pegado a la raíz (mide 0); spine_01 existe en ambos
HIPS = "spine_01"
MH_RIG = "/MetaHumanCharacter/Animation/Retargeting/IK_MH_IKRig"
TEMPLATE = "/Engine/Maps/Templates/Template_Default"
MESH = os.environ["KRATOS_MESH"]
ANIMS = json.loads(os.environ.get("KRATOS_ANIMATIONS") or "[]")
TARGET = os.environ.get("KRATOS_TARGET", "")
MAP = os.environ.get("KRATOS_MAP") or "/Game/Kratos/Maps/AnimTest"
levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
report = {"engine": str(unreal.SystemLibrary.get_engine_version()), "mesh": MESH, "target_mesh": None, "skeleton": None,
          "map": MAP, "clips": [], "retarget": None, "rest_extent": None, "errors": [], "ok": False}


def body_of(actor):
    """El componente que manda: `Body` en un MetaHuman; si no, la malla con más huesos."""
    comps = list(actor.get_components_by_class(unreal.SkeletalMeshComponent))
    named = [c for c in comps if c.get_name() == "Body" and c.get_skeletal_mesh_asset()]
    return named[0] if named else max((c for c in comps if c.get_skeletal_mesh_asset()), key=lambda c: c.get_num_bones(), default=None)


def open_map():
    if unreal.EditorAssetLibrary.does_asset_exist(MAP):
        levels.load_level(MAP)
    elif not levels.new_level_from_template(MAP, TEMPLATE):
        raise RuntimeError(f"No se pudo crear {MAP} desde {TEMPLATE}")
    for old in actors.get_all_level_actors():
        if any(str(t) in ("KratosAnim", "KratosCamera", "KratosReference", "KratosProbe") for t in old.tags):
            actors.destroy_actor(old)


def spawn(asset):
    rot = unreal.Rotator(0, 0, 90)  # maniquí y MetaHuman miran a +Y: girados, miran a la cámara en -X (del lado del sol)
    if isinstance(asset, unreal.Blueprint):
        actor = actors.spawn_actor_from_object(asset, unreal.Vector(0, 0, 0), rot)
    else:
        actor = actors.spawn_actor_from_class(unreal.SkeletalMeshActor, unreal.Vector(0, 0, 0), rot)
        actor.skeletal_mesh_component.set_skeletal_mesh_asset(asset)
    actor.tags = [unreal.Name("KratosAnim")]
    camera = actors.spawn_actor_from_class(unreal.CameraActor, unreal.Vector(-380, 0, 110), unreal.Rotator(0, -6, 0))
    camera.tags = [unreal.Name("KratosCamera")]
    return actor


def pelvis_height(comp, actor):
    try:
        return round(comp.get_socket_location(HIPS).z - actor.get_actor_location().z, 2)
    except Exception:  # noqa: BLE001
        return None


def probe(mesh_path, clip_path, tag, y):
    """Actor sonda fuera de cámara: el juego compara la pelvis de la malla destino (clip retargeteado) con la de la original."""
    actor = actors.spawn_actor_from_class(unreal.SkeletalMeshActor, unreal.Vector(0, y, 0), unreal.Rotator(0, 0, 90))
    comp = actor.skeletal_mesh_component
    comp.set_skeletal_mesh_asset(unreal.load_asset(mesh_path))
    rest = pelvis_height(comp, actor)
    comp.set_editor_property("visibility_based_anim_tick_option", unreal.VisibilityBasedAnimTickOption.ALWAYS_TICK_POSE_AND_REFRESH_BONES)
    comp.set_animation_mode(unreal.AnimationMode.ANIMATION_SINGLE_NODE)
    comp.set_editor_property("animation_data", unreal.SingleAnimationPlayData(
        anim_to_play=unreal.load_asset(clip_path), saved_looping=True, saved_playing=True, saved_play_rate=1.0))
    actor.tags = [unreal.Name(tag)]
    return rest


def main():
    asset = unreal.load_asset(MESH)
    if asset is None:
        raise RuntimeError(f"No carga {MESH}")
    open_map()
    actor = spawn(asset)
    body = body_of(actor)
    if body is None:
        raise RuntimeError(f"{short(MESH)} no tiene malla esquelética")
    mesh = body.get_skeletal_mesh_asset()
    report["target_mesh"], report["skeleton"] = mesh.get_path_name(), mesh.skeleton.get_path_name()
    # pose de reposo: el actor recién colocado, sin animación (la misma medida que hace el juego en cada instante)
    extent = actor.get_actor_bounds(False)[1]
    report["rest_extent"] = [round(v, 2) for v in (extent.x, extent.y, extent.z)]
    report["rest_pelvis"] = {"target": None, "source": None}
    other = [a for a in ANIMS if (unreal.load_asset(a) or None) and unreal.load_asset(a).get_skeleton() != mesh.skeleton]
    retargeted = {}
    if other:
        result = retarget(other, mesh.get_path_name(), f"/Game/Kratos/Retarget/{short(mesh.get_path_name())}",
                          target_rig_path=MH_RIG if TARGET == "metahuman" else None)
        report["retarget"] = result
        report["errors"] += result["errors"] if not result["ok"] else []
        for anim in other:
            name = re.escape(f"{short(anim)}_{short(mesh.get_path_name())}")
            match = [o for o in result["outputs"] if re.fullmatch(name + r"\d*", short(o))]
            retargeted[anim] = match[0] if match else None
    for anim in ANIMS:
        played = retargeted.get(anim, anim) if anim in other else anim
        clip = unreal.load_asset(played) if played else None
        report["clips"].append({"source": anim, "played": played, "retargeted": anim in other,
                                "length": round(clip.get_play_length(), 3) if clip else 0})
    first = next((c for c in report["clips"] if c["played"]), None)
    if first:
        body.set_animation_mode(unreal.AnimationMode.ANIMATION_SINGLE_NODE)
        body.set_editor_property("animation_data", unreal.SingleAnimationPlayData(
            anim_to_play=unreal.load_asset(first["played"]), saved_looping=True, saved_playing=True, saved_play_rate=1.0))
        if first["retargeted"] and report["retarget"] and report["retarget"].get("source_mesh"):
            report["rest_pelvis"]["source"] = probe(report["retarget"]["source_mesh"], first["source"], "KratosReference", -3000)
            report["rest_pelvis"]["target"] = probe(mesh.get_path_name(), first["played"], "KratosProbe", 3000)
    settings = unreal.EditorLevelLibrary.get_editor_world().get_world_settings()
    settings.set_editor_property("default_game_mode", unreal.GameModeBase)
    levels.save_current_level()
    report["actor"] = actor.get_actor_label()
    report["ok"] = bool(first) and all(c["length"] > 0 for c in report["clips"]) and not report["errors"]
    if not first:
        report["errors"].append("Ningún clip reproducible para el personaje")


try:
    main()
except Exception as e:  # noqa: BLE001
    report["errors"].append(str(e))
with open(os.environ["KRATOS_REPORT"], "w", encoding="utf-8") as f:
    json.dump(report, f, indent=2, ensure_ascii=False)
unreal.log(f"KRATOS_CHARACTER ok={report['ok']} clips={len(report['clips'])} map={MAP}")
