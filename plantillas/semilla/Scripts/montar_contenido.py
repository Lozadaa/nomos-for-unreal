# Monta el contenido mínimo de la semilla en el editor: /Game/Juego/M_Suelo, M_Horizonte, M_Base y L_Principal (escena de
# 20 × 20 m con la etiqueta «Escena», suelo que llega al horizonte, sol de día suave, cielo, niebla ligera, exposición manual
# con bloom y una cámara que el juego coloca con EncuadrarEscena). Las fuentes (FF_*) ya vienen importadas.
# M_Base lleva los parámetros Color y Brillo (emisivo) que usa FSemillaAspecto::Vestir.
# Uso (editor caliente, compila materiales en 5.9): nomos ue py Scripts/montar_contenido.py
# Idempotente: si L_Principal ya existe no hace nada.
import unreal

eas = unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
acs = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
mel = unreal.MaterialEditingLibrary
herramientas = unreal.AssetToolsHelpers.get_asset_tools()
MAPA = "/Game/Juego/L_Principal"


def material(nombre, color, rugosidad=0.85, parametros=False):
    ruta = f"/Game/Juego/{nombre}"
    if eas.does_asset_exist(ruta):
        return unreal.load_asset(ruta)
    m = herramientas.create_asset(nombre, "/Game/Juego", unreal.Material, unreal.MaterialFactoryNew())
    if parametros:
        c = mel.create_material_expression(m, unreal.MaterialExpressionVectorParameter, -600, 0)
        c.set_editor_property("parameter_name", "Color")
        c.set_editor_property("default_value", unreal.LinearColor(*color, 1.0))
        b = mel.create_material_expression(m, unreal.MaterialExpressionScalarParameter, -600, 250)
        b.set_editor_property("parameter_name", "Brillo")
        b.set_editor_property("default_value", 0.0)
        e = mel.create_material_expression(m, unreal.MaterialExpressionMultiply, -300, 200)
        mel.connect_material_expressions(c, "", e, "A")
        mel.connect_material_expressions(b, "", e, "B")
        mel.connect_material_property(e, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    else:
        c = mel.create_material_expression(m, unreal.MaterialExpressionConstant3Vector, -400, 0)
        c.set_editor_property("constant", unreal.LinearColor(*color, 1.0))
    r = mel.create_material_expression(m, unreal.MaterialExpressionConstant, -400, 400)
    r.set_editor_property("r", rugosidad)
    mel.connect_material_property(c, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(r, "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.recompile_material(m)
    eas.save_loaded_asset(m)
    return m


if eas.does_asset_exist(MAPA):
    unreal.log(f"MONTAR ya existe {MAPA}")
else:
    # albedos medios: con la exposición manual en 0 un suelo casi negro (0,045) dejaba la escena a oscuras
    suelo_m = material("M_Suelo", (0.30, 0.27, 0.23))
    horizonte_m = material("M_Horizonte", (0.16, 0.16, 0.15), 0.95)
    material("M_Base", (0.5, 0.5, 0.5), 0.6, parametros=True)

    les.new_level(MAPA)
    rot = lambda pitch, yaw=0.0: unreal.Rotator(roll=0.0, pitch=pitch, yaw=yaw)
    plano = unreal.load_asset("/Engine/BasicShapes/Plane")

    suelo = acs.spawn_actor_from_object(plano, unreal.Vector(0, 0, 0), rot(0))
    suelo.set_actor_scale3d(unreal.Vector(20, 20, 1))
    suelo.set_actor_label("Suelo")
    suelo.tags = [unreal.Name("Escena")]  # la cámara del juego mete en cuadro todo lo que lleva esta etiqueta
    suelo.static_mesh_component.set_material(0, suelo_m)
    # el suelo sigue hasta la niebla: sin vacío negro alrededor de la escena
    horizonte = acs.spawn_actor_from_object(plano, unreal.Vector(0, 0, -2), rot(0))
    horizonte.set_actor_scale3d(unreal.Vector(2000, 2000, 1))
    horizonte.set_actor_label("Horizonte")
    horizonte.static_mesh_component.set_material(0, horizonte_m)

    # día suave y legible (iluminacion.md): sol a media altura, 6500 K, atmósfera, cielo en tiempo real y niebla ligera
    sol = acs.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 800), rot(-45, 35))
    sol.set_actor_label("Sol")
    luz = sol.get_component_by_class(unreal.DirectionalLightComponent)
    luz.set_editor_property("intensity", 8.0)
    luz.set_editor_property("atmosphere_sun_light", True)
    luz.set_editor_property("use_temperature", True)
    luz.set_editor_property("temperature", 6500.0)
    acs.spawn_actor_from_class(unreal.SkyAtmosphere, unreal.Vector(0, 0, 0), rot(0)).set_actor_label("Atmosfera")
    cielo = acs.spawn_actor_from_class(unreal.SkyLight, unreal.Vector(0, 0, 400), rot(0))
    cielo.set_actor_label("LuzCielo")
    cielo.get_component_by_class(unreal.SkyLightComponent).set_editor_property("real_time_capture", True)
    niebla = acs.spawn_actor_from_class(unreal.ExponentialHeightFog, unreal.Vector(0, 0, 0), rot(0))
    niebla.set_actor_label("Niebla")
    nc = niebla.get_component_by_class(unreal.ExponentialHeightFogComponent)
    nc.set_editor_property("fog_density", 0.004)
    nc.set_editor_property("fog_max_opacity", 0.7)
    nc.set_editor_property("start_distance", 4000.0)

    ppv = acs.spawn_actor_from_class(unreal.PostProcessVolume, unreal.Vector(0, 0, 0), rot(0))
    ppv.set_actor_label("PostExterior")
    ppv.set_editor_property("unbound", True)
    ajustes = ppv.get_editor_property("settings")
    for nombre, valor in (("override_auto_exposure_method", True), ("auto_exposure_method", unreal.AutoExposureMethod.AEM_MANUAL),
                          ("override_auto_exposure_apply_physical_camera_exposure", True), ("auto_exposure_apply_physical_camera_exposure", False),
                          ("override_auto_exposure_bias", True), ("auto_exposure_bias", 0.0),
                          ("override_bloom_intensity", True), ("bloom_intensity", 0.8),
                          ("override_motion_blur_amount", True), ("motion_blur_amount", 0.0)):
        ajustes.set_editor_property(nombre, valor)
    ppv.set_editor_property("settings", ajustes)

    camara = acs.spawn_actor_from_class(unreal.CameraActor, unreal.Vector(-1600, 0, 1800), rot(-55))
    camara.set_actor_label("Camara")
    camara.camera_component.set_editor_property("field_of_view", 50.0)
    acs.spawn_actor_from_class(unreal.PlayerStart, unreal.Vector(0, 0, 100), rot(0))

    les.save_current_level()
    unreal.log(f"MONTAR creado {MAPA}")
