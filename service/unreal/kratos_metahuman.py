"""Kratos · crea y ensambla un MetaHuman por script DENTRO del editor sin GUI (UnrealEditor-Cmd -ExecutePythonScript).

Sigue los ejemplos del plugin (MetaHumanCharacter/Content/Python/examples/example_create_asset.py y example_assembly.py):
asset MetaHumanCharacter nuevo → editar con MetaHumanCharacterEditorSubsystem → auto-rig → build_meta_human (Optimized).
Comprobado en 5.8.3 (proyecto de sonda): sin rig, build_meta_human no ensambla («Character is not rigged») y el auto-rig es
una petición a la nube; tampoco está el contenido opcional de MetaHuman Creator (texturas): el script lo dice y no inventa nada.
Cada paso queda en el informe; si uno exige el plugin, la nube o la GUI, se dice en `needs` y el servicio abre Decisión.

Variables: KRATOS_REPORT, KRATOS_NAME, KRATOS_DEST (/Game/MetaHumans por defecto).
"""
import json, os, re, time, unreal

NAME = os.environ["KRATOS_NAME"]
DEST = os.environ.get("KRATOS_DEST") or "/Game/MetaHumans"
SOURCE = "/Game/Kratos/MetaHumans"
report = {"engine": str(unreal.SystemLibrary.get_engine_version()), "name": NAME, "steps": [], "blueprint": None,
          "needs": None, "errors": [], "ok": False}


def step(name, fn):
    started = time.time()
    try:
        detail = fn()
        report["steps"].append({"step": name, "ok": True, "detail": str(detail or "ok"), "seconds": round(time.time() - started, 1)})
        return True
    except Exception as e:  # noqa: BLE001
        text = str(e)
        report["steps"].append({"step": name, "ok": False, "detail": text, "seconds": round(time.time() - started, 1)})
        report["errors"].append(f"{name}: {text}")
        report["needs"] = report["needs"] or ("cloud" if re.search(r"cloud|login|sign.?in|auth|servic", text, re.I) else "gui")
        return False


def subsystem():
    if not hasattr(unreal, "MetaHumanCharacterEditorSubsystem"):
        report["needs"] = "plugin"
        raise RuntimeError("MetaHumanCharacterEditorSubsystem no existe: el plugin MetaHumanCharacter no está activo en el proyecto")
    state["mh"] = unreal.get_editor_subsystem(unreal.MetaHumanCharacterEditorSubsystem)


def create():
    path = f"{SOURCE}/{NAME}"
    state["character"] = unreal.load_asset(path) or unreal.AssetToolsHelpers.get_asset_tools().create_asset(
        asset_name=NAME, package_path=SOURCE, asset_class=unreal.MetaHumanCharacter, factory=unreal.new_object(type=unreal.MetaHumanCharacterFactoryNew))
    if not state["character"]:
        raise RuntimeError("create_asset devolvió None")
    return path


def edit():
    if not state["mh"].try_add_object_to_edit(state["character"]):
        raise RuntimeError("try_add_object_to_edit falló: el asset ya está abierto o el editor no puede editarlo sin ventana")


def rig():
    """El ensamblado exige un personaje con rig: el auto-rig es una petición a la nube de MetaHuman (asíncrona, con sesión)."""
    if state["mh"].can_build_meta_human(state["character"], True):
        return "ya tiene rig"
    state["mh"].request_auto_rigging(state["character"])
    for _ in range(20):  # en el editor por lotes no hay bucle de eventos: si no vuelve ya, no vuelve
        if state["mh"].can_build_meta_human(state["character"], False):
            return "auto-rig hecho"
        time.sleep(0.5)
    report["needs"] = "cloud"
    raise RuntimeError("El personaje no tiene rig: el auto-rig de MetaHuman es un servicio en la nube (con sesión) que no termina en el editor por lotes")


def build():
    params = unreal.MetaHumanCharacterEditorBuildParameters()
    params.pipeline_type = unreal.MetaHumanDefaultPipelineType.OPTIMIZED
    params.pipeline_quality = unreal.MetaHumanQualityLevel.MEDIUM
    params.absolute_build_path = DEST
    params.common_folder_path = f"{DEST}/Common"
    params.enable_wardrobe_item_validation = False
    state["mh"].build_meta_human(character=state["character"], params=params)
    unreal.EditorAssetLibrary.save_directory(DEST)


def blueprint():
    found = [str(d.package_name) for d in unreal.AssetRegistryHelpers.get_asset_registry().get_assets_by_path(f"{DEST}/{NAME}", recursive=True)
             if str(d.asset_class_path.asset_name) == "Blueprint"]
    if not found:
        raise RuntimeError(f"build_meta_human terminó sin Blueprint en {DEST}/{NAME}")
    report["blueprint"] = found[0]
    return found[0]


state = {}
for name, fn in [("subsystem", subsystem), ("create", create), ("edit", edit), ("rig", rig), ("build", build), ("blueprint", blueprint)]:
    if not step(name, fn):
        break
if state.get("character") and state.get("mh"):
    try:
        if state["mh"].is_object_added_for_editing(state["character"]):
            state["mh"].remove_object_to_edit(state["character"])
    except Exception:  # noqa: BLE001
        pass
report["ok"] = bool(report["blueprint"]) and not report["errors"]
with open(os.environ["KRATOS_REPORT"], "w", encoding="utf-8") as f:
    json.dump(report, f, indent=2, ensure_ascii=False)
unreal.log(f"KRATOS_METAHUMAN ok={report['ok']} needs={report['needs']} blueprint={report['blueprint']}")
