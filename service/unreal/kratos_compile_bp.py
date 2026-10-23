"""Kratos · editor sin GUI: carga y compila los Blueprints tocados y comprueba que sus referencias existen.

KRATOS_ASSETS: lista JSON de paquetes `/Game/...`. Escribe en KRATOS_REPORT {ok, engine, compiled: [{package, status}], errors}.
"""
import json, os, unreal

ASSETS = json.loads(os.environ.get("KRATOS_ASSETS") or "[]")
registry = unreal.AssetRegistryHelpers.get_asset_registry()
report = {"engine": str(unreal.SystemLibrary.get_engine_version()), "compiled": [], "errors": []}

for package in ASSETS:
    found = registry.get_assets_by_package_name(package)
    if not found:
        report["errors"].append(f"{package}: no existe o no está guardado")
        continue
    for data in found:
        asset = unreal.load_asset(f"{data.package_name}.{data.asset_name}")
        if asset is None:
            report["errors"].append(f"{package}: no carga")
            continue
        if isinstance(asset, unreal.Blueprint):
            unreal.BlueprintEditorLibrary.compile_blueprint(asset)
            status = str(getattr(asset, "status", "desconocido")).split(".")[-1]
            report["compiled"].append({"package": package, "status": status})
            if "ERROR" in status.upper():
                report["errors"].append(f"{package}: el Blueprint no compila ({status})")
        deps = registry.get_dependencies(data.package_name, unreal.AssetRegistryDependencyOptions(
            include_soft_package_references=True, include_hard_package_references=True))
        for dep in deps or []:
            dep = str(dep)
            if dep.startswith("/Game/") and "/__External" not in dep and not registry.get_assets_by_package_name(dep):
                report["errors"].append(f"{package}: referencia inexistente {dep}")

report["ok"] = not report["errors"]
with open(os.environ["KRATOS_REPORT"], "w", encoding="utf-8") as f:
    json.dump(report, f, indent=2, ensure_ascii=False)
unreal.log(f"KRATOS_COMPILE_BP ok={report['ok']} compiled={len(report['compiled'])}")
