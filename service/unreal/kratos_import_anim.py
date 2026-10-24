"""Kratos · importa el FBX que devuelve Cascadeur como AnimSequence sobre un esqueleto existente, DENTRO del editor sin GUI.

Variables: KRATOS_REPORT, KRATOS_FBX, KRATOS_SKELETON (/Game/...), KRATOS_DEST (carpeta), KRATOS_NAME (nombre del clip).
La distorsión típica de un FBX externo (flujo oficial MetaHuman ↔ Cascadeur) se corrige en el esqueleto: `root` y `pelvis`
con traslación de la animación y el resto del esqueleto; si la API no lo expone, se dice en el informe.
"""
import json, os, unreal

FBX, SKELETON, DEST, NAME = (os.environ[k] for k in ("KRATOS_FBX", "KRATOS_SKELETON", "KRATOS_DEST", "KRATOS_NAME"))
report = {"engine": str(unreal.SystemLibrary.get_engine_version()), "clip": None, "length": 0, "fixed_bones": [], "notes": [],
          "errors": [], "ok": False}
try:
    skeleton = unreal.load_asset(SKELETON)
    if not isinstance(skeleton, unreal.Skeleton):
        raise RuntimeError(f"{SKELETON} no es un Skeleton")
    ui = unreal.FbxImportUI()
    ui.import_mesh = False
    ui.import_animations = True
    ui.import_materials = False
    ui.import_textures = False
    ui.skeleton = skeleton
    ui.mesh_type_to_import = unreal.FBXImportType.FBXIT_ANIMATION
    ui.anim_sequence_import_data.set_editor_property("import_bone_tracks", True)
    task = unreal.AssetImportTask()
    task.filename, task.destination_path, task.destination_name = FBX, DEST, NAME
    task.automated, task.replace_existing, task.save = True, True, True
    task.options = ui
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    anims = [p for p in task.imported_object_paths if isinstance(unreal.load_asset(p), unreal.AnimSequence)]
    if not anims:
        raise RuntimeError("La importación no creó ningún AnimSequence")
    clip = unreal.load_asset(anims[0])
    report["clip"], report["length"] = anims[0].split(".")[0], round(clip.get_play_length(), 3)
    for bone in ("root", "pelvis"):
        try:
            skeleton.set_bone_translation_retargeting_mode(bone, unreal.BoneTranslationRetargetingMode.ANIMATION)
            report["fixed_bones"].append(bone)
        except Exception as e:  # noqa: BLE001
            report["notes"].append(f"{bone}: modo de retarget de traslación no expuesto a Python ({e})")
    report["ok"] = report["length"] > 0
except Exception as e:  # noqa: BLE001
    report["errors"].append(str(e))
with open(os.environ["KRATOS_REPORT"], "w", encoding="utf-8") as f:
    json.dump(report, f, indent=2, ensure_ascii=False)
unreal.log(f"KRATOS_IMPORT_ANIM ok={report['ok']} clip={report['clip']}")
