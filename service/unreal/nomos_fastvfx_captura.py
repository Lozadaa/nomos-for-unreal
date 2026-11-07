"""Nomos · FASTVFX: capturas de preview en el EDITOR caliente (-RenderOffscreen), sin lanzar el juego.

Mismo trabajo e informe que nomos_fastvfx_preview.py (NOMOS_FASTVFX_PREVIEW: {"calentar", "mapa", "items"}), pero en el
mundo del editor: carga el nivel de preview, pone un SceneCapture2D en la cámara del nivel y exporta el render target a
PNG. El mundo del editor no simula Niagara por sí solo (sin viewport en tiempo real), así que cada sistema se lleva a
su edad con advance_simulation; el tiempo del mundo sí avanza, y con él el de los materiales.
Corre en varios ticks: deja `nomos_pendiente` para nomos_caliente.py. Al terminar vuelve a cargar el nivel que había
(los actores de la captura no se guardan).
"""
import json, os, time, unreal

REPORT = os.environ["NOMOS_REPORT"]
JOB = json.load(open(os.environ["NOMOS_FASTVFX_PREVIEW"], encoding="utf-8"))
EAL = unreal.EditorAssetLibrary
ACT = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
NIV = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
ORIGEN = unreal.Vector(0, 0, 40)
report = {"engine": str(unreal.SystemLibrary.get_engine_version()), "items": [], "errores": [], "ok": False, "modo": "editor"}
st = {"fase": "calentar", "t": time.time(), "i": -1, "inicio": time.time(), "vivos": [], "n": 0}


def mundo():
    return unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()


previo = mundo().get_outermost().get_name()
if not NIV.load_level(JOB["mapa"]):
    raise RuntimeError(f"No se pudo cargar {JOB['mapa']}")
actores = ACT.get_all_level_actors()
camara = next((a for a in actores if isinstance(a, unreal.CameraActor)), None)
esfera = next((a for a in actores if "FastVfxEsfera" in [str(t) for t in a.tags]), None)
if camara is None:
    raise RuntimeError(f"{JOB['mapa']} no tiene cámara")
ancho, alto = JOB.get("ancho", 960), JOB.get("alto", 540)
rt = unreal.RenderingLibrary.create_render_target2d(mundo(), ancho, alto, unreal.TextureRenderTargetFormat.RTF_RGBA8)
captura = ACT.spawn_actor_from_class(unreal.SceneCapture2D, camara.get_actor_location(), camara.get_actor_rotation())
cc = captura.capture_component2d
cc.texture_target = rt
cc.capture_source = unreal.SceneCaptureSource.SCS_FINAL_COLOR_LDR
cc.capture_every_frame = False
cc.fov_angle = camara.camera_component.field_of_view
materiales = [i for i in JOB["items"] if i["tipo"] == "material"]


def ver(actor, visible):
    actor.set_actor_hidden_in_game(not visible)
    actor.set_is_temporarily_hidden_in_editor(not visible)


def lanzar(item):
    na = ACT.spawn_actor_from_class(unreal.NiagaraActor, ORIGEN)
    comp = na.niagara_component
    comp.set_asset(EAL.load_asset(item["asset"]))
    # [tipo, valor]: con un entero en un parámetro float, set_variable_int crea otra variable y el sistema no pinta nada
    for k, (tipo, v) in (item.get("usuario") or {}).items():
        if tipo == "int":
            comp.set_variable_int(k, int(v))
        elif tipo == "float":
            comp.set_variable_float(k, float(v))
        elif tipo == "color":
            comp.set_variable_linear_color(k, unreal.LinearColor(*v))
    st["vivos"].append(na)
    return comp


def limpiar():
    for a in st["vivos"]:
        ACT.destroy_actor(a)
    st["vivos"] = []


def terminar():
    limpiar()
    ACT.destroy_actor(captura)
    if previo:
        NIV.load_level(previo)  # descarta los actores de la captura sin preguntar
    report["ms_total"] = round((time.time() - st["inicio"]) * 1000)
    report["ok"] = not report["errores"] and all(i.get("png") for i in report["items"])
    with open(REPORT, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    return True


# un sistema creado o duplicado en esta sesión no llega a activarse (is_active False, la captura sale vacía) hasta que
# se recarga del disco lo que guardó el generador (probado en UE 5.8.3); recargar uno ya bueno cuesta décimas
niagaras = sorted({i["asset"] for i in JOB["items"] if i["tipo"] == "niagara"})
if niagaras:
    unreal.EditorLoadingAndSavingUtils.reload_packages([EAL.load_asset(a).get_outermost() for a in niagaras])

# calentar: todo a la vez y una captura por tick, para que se compilen las permutaciones de shader que falten
for item in JOB["items"]:
    if item["tipo"] == "niagara":
        lanzar(item).activate(True)
if esfera is None and materiales:
    report["errores"].append("El nivel de preview no tiene la esfera FastVfxEsfera")


def siguiente():
    limpiar()
    st["i"] += 1
    if st["i"] >= len(JOB["items"]):
        return terminar()
    item = JOB["items"][st["i"]]
    if item["tipo"] == "niagara":
        if esfera:
            ver(esfera, False)
        comp = lanzar(item)
        comp.activate(True)
        frame = float(item.get("frame", 0.3))
        comp.advance_simulation(max(1, round(frame * 60)), 1.0 / 60)
        espera = 0  # el proxy recibe las partículas al final de este tick: se captura en el siguiente
    else:
        ver(esfera, True)
        esfera.static_mesh_component.set_material(0, EAL.load_asset(item["asset"]))
        espera = max(float(item.get("frame", 0.3)), 0.4)
    st.update(fase="esperar", t=time.time(), item=item, espera=espera)
    return False


def nomos_pendiente():
    ahora = time.time()
    if report["errores"]:
        return terminar()
    if st["fase"] == "calentar":
        if esfera and materiales:
            esfera.static_mesh_component.set_material(0, EAL.load_asset(materiales[st["n"] % len(materiales)]["asset"]))
        st["n"] += 1
        cc.capture_scene()
        if ahora - st["t"] >= float(JOB.get("calentar", 6)):
            report["ms_calentar"] = round((ahora - st["t"]) * 1000)
            return siguiente()
        return False
    if ahora - st["t"] < st["espera"]:
        return False
    item = st["item"]
    destino = item["png"]
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    cc.capture_scene()
    unreal.RenderingLibrary.export_render_target(mundo(), rt, os.path.dirname(destino), os.path.basename(destino))
    png = destino if os.path.isfile(destino) else None
    if png is None:
        report["errores"].append(f"La captura de {item['asset']} no se escribió")
    report["items"].append({"asset": item["asset"], "png": png, "frame": item.get("frame"),
                            "ms_item": round((time.time() - st["t"]) * 1000), "ms_desde_inicio": round((time.time() - st["inicio"]) * 1000)})
    return siguiente()
