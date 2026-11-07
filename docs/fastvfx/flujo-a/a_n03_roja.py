# Flujo A (Python a mano, desde cero) · N03: estallido de energía rojo, 200 chispas, vida 1,2 (destello, onda, chispas, secundarias), 120 chispas.
# Color, número de partículas y vida ajustables (User.Color, User.Chispas, User.Vida).
import json, os, time, unreal

EAL = unreal.EditorAssetLibrary
MEL = unreal.MaterialEditingLibrary
FXU = unreal.FXConverterUtilitiesLibrary
TOOLS = unreal.AssetToolsHelpers.get_asset_tools()
CARPETA = os.environ.get("A_CARPETA", "/Game/BenchA/N03")
NOMBRE = os.environ.get("A_NOMBRE", "NS_A_EnergiaRoja")
COLOR = json.loads(os.environ.get("A_COLOR", "[1, 0.15, 0.05, 1]"))
CHISPAS = int(os.environ.get("A_CHISPAS", "200"))
VIDA = float(os.environ.get("A_VIDA", "1.2"))
BRILLO = float(os.environ.get("A_BRILLO", "10"))
t0 = time.perf_counter()

# material de sprite: disco suave, color de partícula × brillo, aditivo
mruta = CARPETA + "/M_A_Sprite"
if EAL.does_asset_exist(mruta):
    m = EAL.load_asset(mruta)
    MEL.delete_all_material_expressions(m)
else:
    m = TOOLS.create_asset("M_A_Sprite", CARPETA, unreal.Material, unreal.MaterialFactoryNew())
m.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
m.set_editor_property("blend_mode", unreal.BlendMode.BLEND_ADDITIVE)
m.set_editor_property("used_with_niagara_sprites", True)
ok = []
pc = MEL.create_material_expression(m, unreal.MaterialExpressionParticleColor, -800, 0)
grad = MEL.create_material_expression(m, unreal.MaterialExpressionTextureSample, -800, 250)
grad.set_editor_property("texture", EAL.load_asset("/Engine/EngineMaterials/DefaultBokeh"))
br = MEL.create_material_expression(m, unreal.MaterialExpressionScalarParameter, -800, -150)
br.set_editor_property("parameter_name", "Brillo")
br.set_editor_property("default_value", BRILLO)
m1 = MEL.create_material_expression(m, unreal.MaterialExpressionMultiply, -500, 0)
ok.append(MEL.connect_material_expressions(pc, "", m1, "A"))
ok.append(MEL.connect_material_expressions(br, "", m1, "B"))
m2 = MEL.create_material_expression(m, unreal.MaterialExpressionMultiply, -300, 100)
ok.append(MEL.connect_material_expressions(m1, "", m2, "A"))
ok.append(MEL.connect_material_expressions(grad, "R", m2, "B"))
ok.append(MEL.connect_material_property(m2, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR))
m3 = MEL.create_material_expression(m, unreal.MaterialExpressionMultiply, -300, 300)
ok.append(MEL.connect_material_expressions(pc, "A", m3, "A"))
ok.append(MEL.connect_material_expressions(grad, "R", m3, "B"))
ok.append(MEL.connect_material_property(m3, "", unreal.MaterialProperty.MP_OPACITY))
MEL.recompile_material(m)
st = MEL.get_statistics(m)
EAL.save_loaded_asset(m, only_if_is_dirty=False)
t1 = time.perf_counter()

ruta = CARPETA + "/" + NOMBRE
if EAL.does_asset_exist(ruta):
    raise RuntimeError(ruta + " ya existe: bórralo con el editor cerrado para rehacerlo")
system = TOOLS.create_asset(NOMBRE, CARPETA, unreal.NiagaraSystem, unreal.NiagaraSystemFactoryNew())
ctx = FXU.create_system_conversion_context(system)
F, I, V, LC = (unreal.NiagaraScriptInputType.FLOAT, unreal.NiagaraScriptInputType.INT, unreal.NiagaraScriptInputType.VEC3,
               unreal.NiagaraScriptInputType.LINEAR_COLOR)
EU, PS, PU = unreal.ScriptExecutionCategory.EMITTER_UPDATE, unreal.ScriptExecutionCategory.PARTICLE_SPAWN, unreal.ScriptExecutionCategory.PARTICLE_UPDATE
fallos = []


def sc(path, ver=None):
    d = FXU.create_asset_data(path)
    return unreal.CreateScriptContextArgs(d, ver) if ver else unreal.CreateScriptContextArgs(d)


def put(mod, nombre, valor):
    if not mod.set_parameter(nombre, valor):
        fallos.append(nombre)


def rnd(a, b):
    c = FXU.create_script_context(sc("/Niagara/DynamicInputs/UniformRange/V2/RandomRangeFloat.RandomRangeFloat"))
    put(c, "Minimum", FXU.create_script_input_float(a))
    put(c, "Maximum", FXU.create_script_input_float(b))
    return FXU.create_script_input_dynamic(c, F)


def vida(base):
    c = FXU.create_script_context(sc("/Niagara/DynamicInputs/Multiply/Multiply_Float.Multiply_Float"))
    put(c, "A", FXU.create_script_input_float(VIDA))
    put(c, "A", FXU.create_script_input_linked_parameter("User.Vida", F))
    put(c, "B", base)
    return FXU.create_script_input_dynamic(c, F)


def emisor(nombre, n, life, size, vel=None, drag=0.0, grav=False):
    em = ctx.add_empty_emitter(nombre)
    em.set_local_space(True)
    s = em.find_or_add_module_script("EmitterState", sc("/Niagara/Modules/Emitter/EmitterState.EmitterState"), EU)
    put(s, "Loop Behavior", FXU.create_script_input_enum("/Niagara/Enums/ENiagara_EmitterStateOptions.ENiagara_EmitterStateOptions", "Once"))
    put(s, "Loop Duration", FXU.create_script_input_float(2.0))
    b = em.find_or_add_module_script("SpawnBurst", sc("/Niagara/Modules/Emitter/SpawnBurst_Instantaneous.SpawnBurst_Instantaneous"), EU)
    for v in n:
        put(b, "Spawn Count", v)
    i = em.find_or_add_module_script("InitializeParticle", sc("/Niagara/Modules/Spawn/Initialization/V2/InitializeParticle.InitializeParticle"), PS)
    put(i, "Lifetime", life)
    put(i, "Color", FXU.create_script_input_linear_color(unreal.LinearColor(*COLOR)))
    put(i, "Color", FXU.create_script_input_linked_parameter("User.Color", LC))
    put(i, "Sprite Size Mode", FXU.create_script_input_enum("/Niagara/Enums/ENiagara_SizeScaleMode.ENiagara_SizeScaleMode", "Uniform"))
    put(i, "Uniform Sprite Size", size)
    if vel:
        a = em.find_or_add_module_script("AddVelocity", sc("/Niagara/Modules/Spawn/Velocity/AddVelocity.AddVelocity"), PS)
        put(a, "Velocity", vel)
    if grav:
        em.find_or_add_module_script("Gravity", sc("/Niagara/Modules/Update/Forces/GravityForce.GravityForce"), PU)
    if drag:
        d = em.find_or_add_module_script("Drag", sc("/Niagara/Modules/Update/Forces/Drag.Drag"), PU)
        put(d, "Drag", FXU.create_script_input_float(drag))
    if vel or grav:
        em.find_or_add_module_script("Solve", sc("/Niagara/Modules/Solvers/SolveForcesAndVelocity.SolveForcesAndVelocity"), PU)
    em.find_or_add_module_script("ParticleState", sc("/Niagara/Modules/Update/Lifetime/ParticleState.ParticleState", [1, 1]), PU)
    r = unreal.NiagaraSpriteRendererProperties()
    r.set_editor_property("material", m)
    em.add_renderer("Sprites", r)


def rvec(lo, hi):
    c = FXU.create_script_context(sc("/Niagara/DynamicInputs/UniformRange/V2/RandomRangeVector.RandomRangeVector"))
    put(c, "Minimum", FXU.create_script_input_vector(unreal.Vector(*lo)))
    put(c, "Maximum", FXU.create_script_input_vector(unreal.Vector(*hi)))
    return FXU.create_script_input_dynamic(c, V)


uno = [FXU.create_script_input_int(1)]
emisor("Destello", uno, vida(FXU.create_script_input_float(0.3)), FXU.create_script_input_float(220))
emisor("Onda", uno, vida(FXU.create_script_input_float(0.6)), FXU.create_script_input_float(500))
emisor("Chispas", [FXU.create_script_input_int(CHISPAS), FXU.create_script_input_linked_parameter("User.Chispas", I)],
       vida(rnd(0.35, 0.9)), rnd(5, 11), vel=rvec((-700, -700, -300), (700, 700, 700)), drag=2.5, grav=True)
emisor("Secundarias", [FXU.create_script_input_int(24)], vida(rnd(0.8, 1.6)), rnd(14, 26), vel=rvec((-90, -90, 20), (90, 90, 140)), drag=1.0)
ctx.finalize()
ctx.cleanup()
t2 = time.perf_counter()
guardado = EAL.save_loaded_asset(system, only_if_is_dirty=False)
t3 = time.perf_counter()
unreal.log("A_RESULTADO " + json.dumps({"ruta": ruta, "conexiones_ok": all(ok), "entradas_fallidas": fallos, "guardado": guardado,
                                        "ps_sprite": st.num_pixel_shader_instructions, "ms_material": round((t1 - t0) * 1000),
                                        "ms_sistema": round((t2 - t1) * 1000), "ms_guardado": round((t3 - t2) * 1000),
                                        "existe": EAL.does_asset_exist(ruta)}))
