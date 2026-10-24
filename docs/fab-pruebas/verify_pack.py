"""Se ejecuta DENTRO del editor sin GUI (UnrealEditor-Cmd -ExecutePythonScript): comprueba que un pack
Fab copiado a Content/Fab carga, resuelve todas sus dependencias y describe sus mallas.

Escribe un JSON en la ruta de la variable de entorno NOMOS_REPORT (o Saved/nomos-verify.json).
"""
import json, os, unreal

ROOT = os.environ.get("NOMOS_ROOT", "/Game/Fab")  # p. ej. /Game/AdvancedCelShader para packs del Launcher
ALLOWED_PREFIXES = (ROOT + "/", "/Engine/", "/Fab/", "/Interchange/", "/InterchangeAssets/", "/Script/")
registry = unreal.AssetRegistryHelpers.get_asset_registry()
registry.scan_paths_synchronous([ROOT], True)
report = {"root": ROOT, "assets": [], "missing_dependencies": [], "external_dependencies": [], "errors": []}

for data in registry.get_assets_by_path(ROOT, recursive=True):
    path = str(data.package_name)
    entry = {"package": path, "class": str(data.asset_class_path.asset_name)}
    try:
        obj = unreal.load_asset(f"{path}.{data.asset_name}")
        entry["loaded"] = obj is not None
        if isinstance(obj, unreal.StaticMesh):
            entry["lods"] = obj.get_num_lods()
            entry["triangles_lod0"] = obj.get_num_triangles(0)
            entry["materials"] = [str(m.material_interface.get_path_name()) if m.material_interface else None
                                  for m in obj.static_materials]
            extent = obj.get_bounds().box_extent
            entry["bounds_cm"] = [round(2 * v, 1) for v in (extent.x, extent.y, extent.z)]
        elif isinstance(obj, unreal.Texture2D):
            entry["size"] = [obj.blueprint_get_size_x(), obj.blueprint_get_size_y()]
    except Exception as e:  # noqa: BLE001
        entry["loaded"] = False
        report["errors"].append(f"{path}: {e}")
    deps = registry.get_dependencies(data.package_name, unreal.AssetRegistryDependencyOptions(include_soft_package_references=True, include_hard_package_references=True))
    for dep in deps or []:
        dep = str(dep)
        if not dep.startswith(ALLOWED_PREFIXES):
            report["external_dependencies"].append({"from": path, "to": dep})
        if not dep.startswith("/Script/") and not registry.get_assets_by_package_name(dep):
            report["missing_dependencies"].append({"from": path, "to": dep})
    report["assets"].append(entry)

report["ok"] = bool(report["assets"]) and not report["errors"] and not report["missing_dependencies"] \
    and all(a.get("loaded") for a in report["assets"])
out = os.environ.get("NOMOS_REPORT") or os.path.join(unreal.Paths.project_saved_dir(), "nomos-verify.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(report, f, indent=2, ensure_ascii=False)
unreal.log(f"NOMOS_VERIFY ok={report['ok']} assets={len(report['assets'])} report={out}")
