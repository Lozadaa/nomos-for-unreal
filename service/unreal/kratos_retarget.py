"""Kratos · retarget de animaciones entre esqueletos distintos, DENTRO del editor sin GUI (UnrealEditor-Cmd -ExecutePythonScript).

Se usa como módulo desde kratos_character.py (`retarget(...)`) o suelto con variables de entorno:
  KRATOS_REPORT       ruta del informe JSON
  KRATOS_ANIMATIONS   lista JSON de animaciones (/Game/...) del esqueleto origen
  KRATOS_SOURCE_MESH  malla con el esqueleto de las animaciones (opcional: si falta, la primera malla de ese esqueleto)
  KRATOS_TARGET_MESH  malla destino
  KRATOS_DEST         carpeta de salida (/Game/Kratos/Retarget/<destino> por defecto)
  KRATOS_TARGET_RIG   IK Rig del destino (opcional; p. ej. /MetaHumanCharacter/Animation/Retargeting/IK_MH_IKRig)

IK Rigs con definición de retarget autogenerada, IK Retargeter nuevo con cadenas mapeadas automáticamente y
`IKRetargetBatchOperation.run_batch_retarget` (DuplicateAndRetarget está deprecado en 5.8). Si queda sin mapear una cadena
principal (columna, cabeza, brazos, piernas) no se retargetea nada: la animación rota nunca se genera.
"""
import json, os, re, unreal

CRITICAL = re.compile(r"spine|neck|head|arm|leg", re.I)
assets = unreal.AssetToolsHelpers.get_asset_tools()
registry = unreal.AssetRegistryHelpers.get_asset_registry()


def short(path):
    return path.split("/")[-1].split(".")[0]


def mesh_for_skeleton(skeleton):
    """Primera malla esquelética del proyecto con ese esqueleto (la de vista previa del esqueleto si la hay)."""
    try:
        mesh = skeleton.get_preview_mesh()
    except Exception:  # noqa: BLE001  (no expuesto en todas las versiones)
        mesh = None
    if mesh:
        return mesh
    flt = unreal.ARFilter(class_paths=[unreal.TopLevelAssetPath("/Script/Engine", "SkeletalMesh")], recursive_paths=True)
    for data in registry.get_assets(flt):
        mesh = unreal.load_asset(str(data.package_name))
        if mesh and mesh.skeleton == skeleton:
            return mesh
    return None


def ensure_asset(path, cls, factory):
    existing = unreal.load_asset(path)
    if existing:
        return existing
    folder, name = path.rsplit("/", 1)
    return assets.create_asset(name, folder, cls, factory)


def auto_rig(mesh, dest):
    """IK Rig con la definición de retarget autogenerada (cadenas de columna, cabeza, brazos, piernas, dedos)."""
    rig = ensure_asset(f"{dest}/IK_{short(mesh.get_path_name())}", unreal.IKRigDefinition, unreal.IKRigDefinitionFactory())
    ctrl = unreal.IKRigController.get_controller(rig)
    ctrl.set_skeletal_mesh(mesh)
    ctrl.apply_auto_generated_retarget_definition()
    return rig


def chains_of(rig):
    return [str(c.chain_name) for c in unreal.IKRigController.get_controller(rig).get_retarget_chains()]


def retarget(animations, target_mesh_path, dest, source_mesh_path=None, target_rig_path=None):
    report = {"notes": [], "source_mesh": None, "retargeter": None, "source_rig": None, "target_rig": None, "chains": [], "unmapped_target_chains": [],
              "unmapped_source_chains": [], "critical_unmapped": [], "outputs": [], "errors": [], "ok": False}
    anims = [unreal.load_asset(a) for a in animations]
    if not all(anims):
        report["errors"].append("No cargan: " + ", ".join(a for a, o in zip(animations, anims) if not o))
        return report
    target_mesh = unreal.load_asset(target_mesh_path)
    source_mesh = unreal.load_asset(source_mesh_path) if source_mesh_path else mesh_for_skeleton(anims[0].get_skeleton())
    if not target_mesh or not source_mesh:
        report["errors"].append("Sin malla origen o destino para el retarget")
        return report
    report["source_mesh"] = source_mesh.get_path_name()
    source_rig = auto_rig(source_mesh, dest)
    target_rig = unreal.load_asset(target_rig_path) if target_rig_path else None
    # IK_MH_IKRig es del esqueleto de MetaHuman Creator: sobre un MetaHuman de Megascans/Bridge (metahuman_base_skel en
    # /Game/MetaHumans/Common) deja al personaje de rodillas (comprobado en 5.8.3 con Hudson); se usa un IK Rig propio
    if target_rig and "/MetaHumans/Common/" in target_mesh.skeleton.get_path_name():
        report["notes"] = [f"{short(target_rig_path)} no se usa con un MetaHuman de Megascans: IK Rig propio para {short(target_mesh_path)}"]
        target_rig = None
    if target_rig and not unreal.IKRigController.get_controller(target_rig).is_skeletal_mesh_compatible(target_mesh):
        report["errors"].append(f"{short(target_rig_path)} no es compatible con {short(target_mesh_path)}: se crea un IK Rig propio")
        target_rig = None
    target_rig = target_rig or auto_rig(target_mesh, dest)
    report["source_rig"], report["target_rig"] = source_rig.get_path_name(), target_rig.get_path_name()
    rtg = ensure_asset(f"{dest}/RTG_{short(source_mesh.get_path_name())}_{short(target_mesh.get_path_name())}",
                       unreal.IKRetargeter, unreal.IKRetargetFactory())
    ctrl = unreal.IKRetargeterController.get_controller(rtg)
    ctrl.set_ik_rig(unreal.RetargetSourceOrTarget.SOURCE, source_rig)
    ctrl.set_ik_rig(unreal.RetargetSourceOrTarget.TARGET, target_rig)
    ctrl.set_preview_mesh(unreal.RetargetSourceOrTarget.SOURCE, source_mesh)
    ctrl.set_preview_mesh(unreal.RetargetSourceOrTarget.TARGET, target_mesh)
    if ctrl.get_num_retarget_ops() == 0:
        ctrl.add_default_ops()
    ctrl.assign_ik_rig_to_all_ops(unreal.RetargetSourceOrTarget.SOURCE, source_rig)
    ctrl.assign_ik_rig_to_all_ops(unreal.RetargetSourceOrTarget.TARGET, target_rig)
    ctrl.auto_map_chains(unreal.AutoMapChainType.FUZZY, True)
    report["retargeter"] = rtg.get_path_name()
    mapped_sources = set()
    for target_chain in chains_of(target_rig):
        source_chain = str(ctrl.get_source_chain(unreal.Name(target_chain)) or "")
        if source_chain in ("", "None"):
            report["unmapped_target_chains"].append(target_chain)
        else:
            mapped_sources.add(source_chain)
            report["chains"].append({"target": target_chain, "source": source_chain})
    report["unmapped_source_chains"] = [c for c in chains_of(source_rig) if c not in mapped_sources]
    report["critical_unmapped"] = [c for c in report["unmapped_target_chains"] if CRITICAL.search(c)]
    if report["critical_unmapped"]:
        report["errors"].append("Cadenas principales sin mapear: " + ", ".join(report["critical_unmapped"]))
        unreal.EditorAssetLibrary.save_directory(dest)
        return report
    suffix = "_" + short(target_mesh.get_path_name())
    for anim in anims:  # repetir el retarget reemplaza la salida (si no, el lote crea «…1» al lado)
        old = f"{dest}/{short(anim.get_path_name())}{suffix}"
        if unreal.EditorAssetLibrary.does_asset_exist(old) and not unreal.EditorAssetLibrary.delete_loaded_asset(unreal.load_asset(old)):
            report["errors"].append(f"No se pudo reemplazar {short(old)}: se crea al lado")
    inputs = unreal.IKRetargetBatchOperationInputs()
    inputs.set_editor_property("assets_to_retarget", [registry.get_asset_by_object_path(a.get_path_name()) for a in anims])
    inputs.set_editor_property("ik_retarget_asset", rtg)
    inputs.set_editor_property("source_mesh", source_mesh)
    inputs.set_editor_property("target_mesh", target_mesh)
    inputs.set_editor_property("target_path", dest)
    inputs.set_editor_property("suffix", suffix)
    inputs.set_editor_property("include_referenced_assets", True)
    inputs.set_editor_property("overwrite_existing_files", True)
    created = unreal.IKRetargetBatchOperation.run_batch_retarget(inputs)
    report["outputs"] = sorted(str(d.package_name) for d in created or [])
    unreal.EditorAssetLibrary.save_directory(dest)
    report["ok"] = bool(report["outputs"]) and not report["critical_unmapped"]
    if not report["outputs"]:
        report["errors"].append("run_batch_retarget no creó ninguna animación")
    return report


if __name__ == "__main__":
    target = os.environ["KRATOS_TARGET_MESH"]
    out = retarget(json.loads(os.environ["KRATOS_ANIMATIONS"]), target,
                   os.environ.get("KRATOS_DEST") or f"/Game/Kratos/Retarget/{short(target)}",
                   os.environ.get("KRATOS_SOURCE_MESH") or None, os.environ.get("KRATOS_TARGET_RIG") or None)
    out["engine"] = str(unreal.SystemLibrary.get_engine_version())
    with open(os.environ["KRATOS_REPORT"], "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    unreal.log(f"KRATOS_RETARGET ok={out['ok']} outputs={len(out['outputs'])} critical={out['critical_unmapped']}")
