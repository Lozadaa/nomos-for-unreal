"""Nomos · exporta un clip (AnimSequence) a FBX con su esqueleto, DENTRO del editor sin GUI, para llevarlo a Cascadeur.

Variables: NOMOS_REPORT, NOMOS_CLIP (/Game/...), NOMOS_FBX (ruta de salida).
"""
import json, os, unreal

CLIP, OUT = os.environ["NOMOS_CLIP"], os.environ["NOMOS_FBX"]
report = {"engine": str(unreal.SystemLibrary.get_engine_version()), "clip": CLIP, "fbx": OUT, "skeleton": None, "errors": [], "ok": False}
try:
    anim = unreal.load_asset(CLIP)
    if not isinstance(anim, unreal.AnimSequence):
        raise RuntimeError(f"{CLIP} no es un AnimSequence (un montaje se exporta por sus secuencias)")
    report["skeleton"] = anim.get_skeleton().get_path_name().split(".")[0]
    task = unreal.AssetExportTask()
    task.object = anim
    task.filename = OUT
    task.automated = True
    task.replace_identical = True
    task.prompt = False
    options = unreal.FbxExportOption()
    options.ascii = False
    options.export_morph_targets = False
    options.export_preview_mesh = False
    task.options = options
    task.exporter = unreal.AnimSequenceExporterFBX()
    if not unreal.Exporter.run_asset_export_task(task) or not os.path.exists(OUT):
        raise RuntimeError("El exportador FBX no escribió el archivo")
    report["ok"] = True
except Exception as e:  # noqa: BLE001
    report["errors"].append(str(e))
with open(os.environ["NOMOS_REPORT"], "w", encoding="utf-8") as f:
    json.dump(report, f, indent=2, ensure_ascii=False)
unreal.log(f"NOMOS_EXPORT_FBX ok={report['ok']} fbx={OUT}")
