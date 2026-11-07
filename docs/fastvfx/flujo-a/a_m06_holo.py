# Flujo A (Python a mano, desde cero) · M06: holograma cian. Fresnel, líneas de barrido que se desplazan, parpadeo suave.
import json, time, unreal

EAL = unreal.EditorAssetLibrary
MEL = unreal.MaterialEditingLibrary
TOOLS = unreal.AssetToolsHelpers.get_asset_tools()
RUTA = "/Game/BenchA/M06/M_A_HoloCian"
t0 = time.perf_counter()
if EAL.does_asset_exist(RUTA):
    m = EAL.load_asset(RUTA)
    MEL.delete_all_material_expressions(m)
else:
    m = TOOLS.create_asset("M_A_HoloCian", "/Game/BenchA/M06", unreal.Material, unreal.MaterialFactoryNew())
m.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
m.set_editor_property("blend_mode", unreal.BlendMode.BLEND_ADDITIVE)
m.set_editor_property("two_sided", True)
ok = []


def n(cls, x, y, **kw):
    e = MEL.create_material_expression(m, cls, x, y)
    for k, v in kw.items():
        e.set_editor_property(k, v)
    return e


def c(a, sa, b, sb):
    ok.append(MEL.connect_material_expressions(a, sa, b, sb))


color = n(unreal.MaterialExpressionVectorParameter, -1000, -300, parameter_name="Color", default_value=unreal.LinearColor(0.1, 0.8, 1, 1))
inten = n(unreal.MaterialExpressionScalarParameter, -1000, -150, parameter_name="Intensidad", default_value=3.0)
fres = n(unreal.MaterialExpressionFresnel, -1000, 0, exponent=2.5)
rim = n(unreal.MaterialExpressionLinearInterpolate, -800, 0, const_a=0.15, const_b=1.0)
c(fres, "", rim, "Alpha")
wp = n(unreal.MaterialExpressionWorldPosition, -1400, 250)
z = n(unreal.MaterialExpressionComponentMask, -1250, 250, r=False, g=False, b=True, a=False)
c(wp, "", z, "")
dens = n(unreal.MaterialExpressionMultiply, -1100, 250, const_b=0.4)
c(z, "", dens, "A")
tiempo = n(unreal.MaterialExpressionTime, -1250, 400)
vel = n(unreal.MaterialExpressionMultiply, -1100, 400, const_b=0.6)
c(tiempo, "", vel, "A")
suma = n(unreal.MaterialExpressionAdd, -950, 300)
c(dens, "", suma, "A")
c(vel, "", suma, "B")
frac = n(unreal.MaterialExpressionFrac, -800, 300)
c(suma, "", frac, "")
pot = n(unreal.MaterialExpressionPower, -650, 300, const_exponent=3.0)
c(frac, "", pot, "Base")
lineas = n(unreal.MaterialExpressionLinearInterpolate, -500, 300, const_a=1.0, const_b=0.0)
c(pot, "", lineas, "B")
alfa = n(unreal.MaterialExpressionConstant, -650, 450, r=0.6)
c(alfa, "", lineas, "Alpha")
sv = n(unreal.MaterialExpressionMultiply, -950, 550, const_b=14.0)
c(tiempo, "", sv, "A")
seno = n(unreal.MaterialExpressionSine, -800, 550)
c(sv, "", seno, "")
flick = n(unreal.MaterialExpressionMultiply, -650, 550, const_b=-0.075)
c(seno, "", flick, "A")
flick2 = n(unreal.MaterialExpressionAdd, -500, 550, const_b=0.925)
c(flick, "", flick2, "A")
f1 = n(unreal.MaterialExpressionMultiply, -350, 100)
c(rim, "", f1, "A")
c(lineas, "", f1, "B")
f2 = n(unreal.MaterialExpressionMultiply, -200, 150)
c(f1, "", f2, "A")
c(flick2, "", f2, "B")
ci = n(unreal.MaterialExpressionMultiply, -700, -250)
c(color, "", ci, "A")
c(inten, "", ci, "B")
em = n(unreal.MaterialExpressionMultiply, -50, -100)
c(ci, "", em, "A")
c(f2, "", em, "B")
ok.append(MEL.connect_material_property(em, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR))
op = n(unreal.MaterialExpressionMultiply, -50, 150, const_b=0.6)
c(f2, "", op, "A")
ok.append(MEL.connect_material_property(op, "", unreal.MaterialProperty.MP_OPACITY))
t1 = time.perf_counter()
MEL.recompile_material(m)
s = MEL.get_statistics(m)
t2 = time.perf_counter()
guardado = EAL.save_loaded_asset(m, only_if_is_dirty=False)
t3 = time.perf_counter()
unreal.log("A_RESULTADO " + json.dumps({"ruta": RUTA, "conexiones_ok": all(ok), "fallos": ok.count(False), "guardado": guardado,
                                        "ps": s.num_pixel_shader_instructions, "ms_construccion": round((t1 - t0) * 1000),
                                        "ms_compilacion": round((t2 - t1) * 1000), "ms_guardado": round((t3 - t2) * 1000)}))
