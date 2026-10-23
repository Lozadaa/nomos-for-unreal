"""Kratos · editor sin GUI: Data Validation sobre los assets tocados por el diff, más dependencias rotas o sin guardar.

KRATOS_ASSETS: lista JSON de paquetes `/Game/...`. Escribe en KRATOS_REPORT {ok, engine, assets: [{package, result, errors}], errors}.
"""
import json, os, unreal

ASSETS = json.loads(os.environ.get("KRATOS_ASSETS") or "[]")
registry = unreal.AssetRegistryHelpers.get_asset_registry()
validator = unreal.get_editor_subsystem(unreal.EditorValidatorSubsystem)
report = {"engine": str(unreal.SystemLibrary.get_engine_version()), "assets": [], "errors": []}

for package in ASSETS:
    entry = {"package": package, "result": "missing", "errors": []}
    found = registry.get_assets_by_package_name(package)
    if not found:
        entry["errors"].append("El asset no existe o no está guardado")
    for data in found or []:
        try:
            result = validator.is_asset_valid(data, unreal.DataValidationUsecase.SCRIPT)
            verdict = result[0] if isinstance(result, tuple) else result
            entry["result"] = getattr(verdict, "name", str(verdict)).lower()
            for item in (result[1:] if isinstance(result, tuple) else []):
                entry["errors"].extend(str(e) for e in (item or []) if str(e))
            if entry["result"] == "invalid" and not entry["errors"]:
                entry["errors"].append("Data Validation lo marca como inválido")
        except Exception as e:  # noqa: BLE001
            entry["errors"].append(str(e))
        deps = registry.get_dependencies(data.package_name, unreal.AssetRegistryDependencyOptions(
            include_soft_package_references=True, include_hard_package_references=True))
        for dep in deps or []:
            dep = str(dep)
            if dep.startswith("/Game/") and "/__External" not in dep and not registry.get_assets_by_package_name(dep):
                entry["errors"].append(f"Dependencia rota: {dep}")
    report["assets"].append(entry)

report["ok"] = all(not a["errors"] and a["result"] != "invalid" for a in report["assets"]) and not report["errors"]
with open(os.environ["KRATOS_REPORT"], "w", encoding="utf-8") as f:
    json.dump(report, f, indent=2, ensure_ascii=False)
unreal.log(f"KRATOS_VALIDATE ok={report['ok']} assets={len(report['assets'])}")
