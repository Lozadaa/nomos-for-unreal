"""Kratos · job de Cascadeur. Se ejecuta DENTRO de Cascadeur sin ventana:
`cascadeur.exe --run-python-code "import sys; sys.path.insert(0, r'<esta carpeta>'); import kratos_job; kratos_job.main(r'<job>.json')"`.
Comprobado en 2026.2.3: corre con la plataforma qoffscreen, `csc` disponible, y Cascadeur se cierra al terminar.

El job (JSON) dice: action (cleanup | author | fix-retarget), input_fbx, output_fbx, report.
- import: escena nueva y el FBX de Unreal (esqueleto y clip) con `FbxLoader.import_scene`.
- cleanup / fix-retarget: el clip se reexporta horneado y con filtro de Euler (quita saltos de 360° y giros espurios).
  AutoPhysics necesita un personaje con rig de Cascadeur (Quick Rigging Tool): sin él, este paso no se hace y se dice.
- export: `export_joints` (solo huesos, sin mallas), FbxUpAxis Z, binario: lo que pide el flujo oficial MetaHuman ↔ Cascadeur.
"""
import json, os, re, traceback

import csc


LOG = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Nekki Limited", "Cascadeur", "logs", "cascadeur_log.log")


def log_size():
    return os.path.getsize(LOG) if os.path.exists(LOG) else 0


def log_since(mark):
    try:
        with open(LOG, encoding="utf-8", errors="replace") as f:
            f.seek(mark)
            return f.read()
    except OSError:
        return ""


def main(job_path):
    with open(job_path, encoding="utf-8") as f:
        job = json.load(f)
    report = {"ok": False, "needs": None, "steps": [], "errors": [], "output": None,
              "settings": {"up_axis": "Z", "mode": "Binary", "meshes": False}}

    def step(name, fn):
        try:
            detail = fn()
            report["steps"].append({"step": name, "ok": True, "detail": str(detail or "ok")})
            return True
        except Exception as e:  # noqa: BLE001
            text = str(e) or traceback.format_exc(limit=1)
            report["steps"].append({"step": name, "ok": False, "detail": text})
            report["errors"].append(f"{name}: {text}")
            if re.search(r"licen|subscri|not available|upgrade|\.CASC", text, re.I):
                report["needs"] = "license"
            return False

    app = csc.app.get_application()
    state = {}

    def open_scene():
        manager = app.get_scene_manager()
        scene = manager.create_application_scene()
        manager.set_current_scene(scene)
        state["loader"] = app.get_tools_manager().get_tool("FbxSceneLoader").get_fbx_loader(scene)
        state["loader"].import_scene(job["input_fbx"])
        return job["input_fbx"]

    def settings(clean):
        s = csc.fbx.FbxSettings()
        s.mode = csc.fbx.FbxSettingsMode.Binary
        s.up_axis = csc.fbx.FbxSettingsAxis.Z
        s.bake_animation = True
        s.apply_euler_filter = clean
        state["loader"].set_settings(s)
        return "euler + horneado" if clean else "horneado"

    def export():
        mark = log_size()
        state["loader"].export_joints(job["output_fbx"])
        if not os.path.exists(job["output_fbx"]):
            # la licencia gratuita no lanza excepción: lo escribe en el registro de eventos (comprobado en 2026.2.3)
            blocked = re.search(r"Feature not available\.?\s*(.+?only support \.CASC[^\n]*)", log_since(mark), re.S)
            raise RuntimeError(f"licencia: {' '.join(blocked.group(1).split())}" if blocked else "export_joints no escribió el FBX")
        report["output"] = job["output_fbx"]
        return job["output_fbx"]

    if step("import", open_scene) and step(job["action"], lambda: settings(job["action"] != "author")):
        step("export", export)
    report["ok"] = bool(report["output"]) and not report["errors"]
    with open(job["report"], "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
