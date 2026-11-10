# Monta el contenido mínimo de la semilla en el editor: /Game/Juego/M_Suelo y /Game/Juego/L_Principal (suelo de 30 × 30 m,
# sol, cielo, luz de cielo, exposición manual y una cámara mirando el patio). Las fuentes (FF_*) ya vienen importadas.
# Uso (editor caliente, compila materiales en 5.9): nomos ue py Scripts/montar_contenido.py
# Idempotente: si L_Principal ya existe no hace nada.
import unreal

eas = unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
acs = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
mel = unreal.MaterialEditingLibrary
MAPA, SUELO = "/Game/Juego/L_Principal", "/Game/Juego/M_Suelo"

if eas.does_asset_exist(MAPA):
    unreal.log(f"MONTAR ya existe {MAPA}")
else:
    if not eas.does_asset_exist(SUELO):
        m = unreal.AssetToolsHelpers.get_asset_tools().create_asset("M_Suelo", "/Game/Juego", unreal.Material, unreal.MaterialFactoryNew())
        color = mel.create_material_expression(m, unreal.MaterialExpressionConstant3Vector, -400, 0)
        color.set_editor_property("constant", unreal.LinearColor(0.045, 0.040, 0.036, 1.0))
        rugosidad = mel.create_material_expression(m, unreal.MaterialExpressionConstant, -400, 200)
        rugosidad.set_editor_property("r", 0.85)
        mel.connect_material_property(color, "", unreal.MaterialProperty.MP_BASE_COLOR)
        mel.connect_material_property(rugosidad, "", unreal.MaterialProperty.MP_ROUGHNESS)
        mel.recompile_material(m)
        eas.save_loaded_asset(m)

    les.new_level(MAPA)
    rot = lambda pitch, yaw=0.0: unreal.Rotator(roll=0.0, pitch=pitch, yaw=yaw)

    suelo = acs.spawn_actor_from_object(unreal.load_asset("/Engine/BasicShapes/Plane"), unreal.Vector(0, 0, 0), rot(0))
    suelo.set_actor_scale3d(unreal.Vector(30, 30, 1))
    suelo.set_actor_label("Suelo")
    suelo.static_mesh_component.set_material(0, unreal.load_asset(SUELO))

    sol = acs.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 800), rot(-38, 35))
    luz = sol.get_component_by_class(unreal.DirectionalLightComponent)
    luz.set_editor_property("intensity", 6.0)
    luz.set_editor_property("atmosphere_sun_light", True)
    acs.spawn_actor_from_class(unreal.SkyAtmosphere, unreal.Vector(0, 0, 0), rot(0))
    cielo = acs.spawn_actor_from_class(unreal.SkyLight, unreal.Vector(0, 0, 400), rot(0))
    cielo.get_component_by_class(unreal.SkyLightComponent).set_editor_property("real_time_capture", True)

    ppv = acs.spawn_actor_from_class(unreal.PostProcessVolume, unreal.Vector(0, 0, 0), rot(0))
    ppv.set_editor_property("unbound", True)
    ajustes = ppv.get_editor_property("settings")
    for nombre, valor in (("override_auto_exposure_method", True), ("auto_exposure_method", unreal.AutoExposureMethod.AEM_MANUAL),
                          ("override_auto_exposure_apply_physical_camera_exposure", True), ("auto_exposure_apply_physical_camera_exposure", False),
                          ("override_auto_exposure_bias", True), ("auto_exposure_bias", 0.0),
                          ("override_motion_blur_amount", True), ("motion_blur_amount", 0.0)):
        ajustes.set_editor_property(nombre, valor)
    ppv.set_editor_property("settings", ajustes)

    camara = acs.spawn_actor_from_class(unreal.CameraActor, unreal.Vector(-2200, 0, 1900), rot(-40))
    camara.set_actor_label("Camara")
    acs.spawn_actor_from_class(unreal.PlayerStart, unreal.Vector(0, 0, 100), rot(0))

    les.save_current_level()
    unreal.log(f"MONTAR creado {MAPA}")
