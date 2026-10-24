"""Nomos · se ejecuta DENTRO del editor sin GUI: importa un archivo (FBX, GLB, PNG...) con AssetImportTask.

Entrada por variables de entorno: NOMOS_SOURCE (archivo en disco), NOMOS_DEST (/Game/...), NOMOS_NAME (nombre del asset).
Escribe {"ok", "assets", "errors"} en NOMOS_REPORT.
"""
import json, os, unreal

report = {"source": os.environ.get("NOMOS_SOURCE"), "dest": os.environ.get("NOMOS_DEST"), "assets": [], "errors": []}
try:
    task = unreal.AssetImportTask()
    task.filename = report["source"]
    task.destination_path = report["dest"]
    task.destination_name = os.environ.get("NOMOS_NAME", "")
    task.automated = True
    task.save = True
    task.replace_existing = False
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    report["assets"] = [str(p) for p in task.imported_object_paths]
except Exception as e:  # noqa: BLE001
    report["errors"].append(str(e))
report["ok"] = bool(report["assets"]) and not report["errors"]
with open(os.environ["NOMOS_REPORT"], "w", encoding="utf-8") as f:
    json.dump(report, f, indent=2, ensure_ascii=False)
unreal.log(f"NOMOS_IMPORT ok={report['ok']} assets={len(report['assets'])}")
