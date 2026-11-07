# Flujo A (Python a mano, desde cero) · M01: escudo de energía azul. Emisivo aditivo, Fresnel, ruido animado suave.
import json, os, time, unreal

EAL = unreal.EditorAssetLibrary
MEL = unreal.MaterialEditingLibrary
TOOLS = unreal.AssetToolsHelpers.get_asset_tools()
RUTA = "/Game/BenchA/M01/M_A_EscudoAzul"
INTENSIDAD = float(os.environ.get("A_INTENSIDAD", "7"))  # M02: de 5 a 7
t0 = time.perf_counter()

if EAL.does_asset_exist(RUTA):
    m = EAL.load_asset(RUTA)
    MEL.delete_all_material_expressions(m)
else:
    m = TOOLS.create_asset("M_A_EscudoAzul", "/Game/BenchA/M01", unreal.Material, unreal.MaterialFactoryNew())
m.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
m.set_editor_property("blend_mode", unreal.BlendMode.BLEND_ADDITIVE)
m.set_editor_property("two_sided", True)


def n(cls, x, y, **kw):
    e = MEL.create_material_expression(m, cls, x, y)
    for k, v in kw.items():
        e.set_editor_property(k, v)
    return e


ok = []
color = n(unreal.MaterialExpressionVectorParameter, -900, -200, parameter_name="Color", default_value=unreal.LinearColor(0.1, 0.45, 1, 1))
inten = n(unreal.MaterialExpressionScalarParameter, -900, -50, parameter_name="Intensidad", default_value=INTENSIDAD)
fres = n(unreal.MaterialExpressionFresnel, -900, 100)
fexp = n(unreal.MaterialExpressionScalarParameter, -1100, 100, parameter_name="FresnelExp", default_value=2.5)
ok.append(MEL.connect_material_expressions(fexp, "", fres, "ExponentIn"))
uv = n(unreal.MaterialExpressionTextureCoordinate, -1300, 300, u_tiling=2.0, v_tiling=2.0)
pan = n(unreal.MaterialExpressionPanner, -1100, 300, speed_x=0.1, speed_y=0.15)
ok.append(MEL.connect_material_expressions(uv, "", pan, "Coordinate"))
tex = n(unreal.MaterialExpressionTextureSample, -900, 300, texture=EAL.load_asset("/Engine/EngineMaterials/Good64x64TilingNoiseHighFreq"))
ok.append(MEL.connect_material_expressions(pan, "", tex, "UVs"))
mezcla = n(unreal.MaterialExpressionLinearInterpolate, -700, 300, const_a=1.0)
ok.append(MEL.connect_material_expressions(tex, "R", mezcla, "B"))
peso = n(unreal.MaterialExpressionScalarParameter, -900, 500, parameter_name="RuidoPeso", default_value=0.35)
ok.append(MEL.connect_material_expressions(peso, "", mezcla, "Alpha"))
borde = n(unreal.MaterialExpressionAdd, -700, 100, const_b=0.15)
ok.append(MEL.connect_material_expressions(fres, "", borde, "A"))
a = n(unreal.MaterialExpressionMultiply, -500, -150)
ok.append(MEL.connect_material_expressions(color, "", a, "A"))
ok.append(MEL.connect_material_expressions(inten, "", a, "B"))
b = n(unreal.MaterialExpressionMultiply, -350, 0)
ok.append(MEL.connect_material_expressions(borde, "", b, "A"))
ok.append(MEL.connect_material_expressions(mezcla, "", b, "B"))
c = n(unreal.MaterialExpressionMultiply, -200, -100)
ok.append(MEL.connect_material_expressions(a, "", c, "A"))
ok.append(MEL.connect_material_expressions(b, "", c, "B"))
ok.append(MEL.connect_material_property(c, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR))
sat = n(unreal.MaterialExpressionSaturate, -200, 100)
ok.append(MEL.connect_material_expressions(b, "", sat, ""))
ok.append(MEL.connect_material_property(sat, "", unreal.MaterialProperty.MP_OPACITY))
t1 = time.perf_counter()
MEL.recompile_material(m)
s = MEL.get_statistics(m)
t2 = time.perf_counter()
guardado = EAL.save_loaded_asset(m, only_if_is_dirty=False)
t3 = time.perf_counter()
unreal.log("A_RESULTADO " + json.dumps({"ruta": RUTA, "conexiones_ok": all(ok), "fallos": ok.count(False), "guardado": guardado,
                                        "ps": s.num_pixel_shader_instructions, "vs": s.num_vertex_shader_instructions,
                                        "ms_construccion": round((t1 - t0) * 1000), "ms_compilacion": round((t2 - t1) * 1000),
                                        "ms_guardado": round((t3 - t2) * 1000), "existe": EAL.does_asset_exist(RUTA)}))
