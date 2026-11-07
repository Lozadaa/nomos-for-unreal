"""Nomos · FASTVFX: generadores deterministas de materiales y Niagara (UE 5.8, editor sin GUI).

Lee un trabajo JSON (NOMOS_FASTVFX_JOB) que escribe el servicio a partir de recetas ya validadas y ejecuta sus acciones
en UNA apertura del editor. El JSON solo trae datos: el tipo de acción elige una función de este archivo y los valores se
vuelven a comprobar aquí; nunca se ejecuta texto de una receta.

Acciones:
  maestro    construye un material maestro (M_Master_VFX, M_Master_Hologram) desde cero, compila y guarda
  mi         crea o actualiza una Material Instance: solo parámetros (escalares, vectores, switches estáticos)
  niagara    construye FX_Energy_Base UNA vez con el convertidor de Cascade (FXConverterUtilitiesLibrary) a partir del
             emisor vacío y los módulos que trae el motor, con parámetros de usuario expuestos
  variante   duplica un sistema base y le cambia los materiales de los renderers por MIs propias (sin tocar el grafo)
  escenario  crea el nivel de preview (cámara fija, suelo, luz y una esfera para materiales)
  borrar     borra un asset dentro del editor (editor caliente: un Niagara cargado no se rehace, pero borrado sí)

Medidas: cada acción anota ms de construcción, compilación (recompile + FinishCompilation que hace get_statistics),
guardado y las estadísticas que da MaterialEditingLibrary.get_statistics. En Niagara, los parámetros de usuario se leen
de vuelta con un NiagaraComponent (get_variable_*), que es la comprobación de que quedaron expuestos con su valor.
"""
import json, os, time, traceback, unreal

JOB = json.load(open(os.environ["NOMOS_FASTVFX_JOB"], encoding="utf-8"))
REPORT = os.environ["NOMOS_REPORT"]
EAL = unreal.EditorAssetLibrary
MEL = unreal.MaterialEditingLibrary
TOOLS = unreal.AssetToolsHelpers.get_asset_tools()
GENERADOR = 1  # versión del generador: si cambia, la caché lo trata como cambio estructural

report = {"engine": str(unreal.SystemLibrary.get_engine_version()), "generador": GENERADOR, "acciones": [], "errores": [], "ok": False}
NOISE = "/Engine/EngineMaterials/Good64x64TilingNoiseHighFreq"


def ms(t0):
    return round((time.perf_counter() - t0) * 1000, 1)


def carpeta(ruta):
    return ruta.rsplit("/", 1)[0]


def nombre(ruta):
    return ruta.rsplit("/", 1)[1]


def guardar(asset, medida):
    t0 = time.perf_counter()
    ok = EAL.save_loaded_asset(asset, only_if_is_dirty=False)
    medida["ms_guardado"] = ms(t0)
    if not ok:
        raise RuntimeError(f"No se pudo guardar {asset.get_path_name()}")


def estadisticas(material):
    s = MEL.get_statistics(material)
    return {"instrucciones_vs": s.num_vertex_shader_instructions, "instrucciones_ps": s.num_pixel_shader_instructions,
            "samplers": s.num_samplers, "muestras_textura_ps": s.num_pixel_texture_samples}


# --- materiales -------------------------------------------------------------------------------------------------------
class Grafo:
    """Ayudante mínimo: crea nodos y comprueba cada conexión (una conexión fallida es un error, no un aviso)."""

    def __init__(self, material):
        self.m = material
        self.fallos = []
        self.nodos = 0

    def nodo(self, cls, x=0, y=0, **props):
        e = MEL.create_material_expression(self.m, cls, x, y)
        if e is None:
            raise RuntimeError(f"No se pudo crear {cls.__name__}")
        for k, v in props.items():
            e.set_editor_property(k, v)
        self.nodos += 1
        return e

    def escalar(self, nombre_, valor, x=-1600, y=0, grupo="FASTVFX"):
        return self.nodo(unreal.MaterialExpressionScalarParameter, x, y, parameter_name=nombre_, default_value=float(valor), group=grupo)

    def vector(self, nombre_, valor, x=-1600, y=0, grupo="FASTVFX"):
        return self.nodo(unreal.MaterialExpressionVectorParameter, x, y, parameter_name=nombre_,
                         default_value=unreal.LinearColor(*valor), group=grupo)

    def conecta(self, desde, salida, hacia, entrada):
        if not MEL.connect_material_expressions(desde, salida, hacia, entrada):
            self.fallos.append(f"{desde.get_class().get_name()}.{salida or '0'} -> {hacia.get_class().get_name()}.{entrada}")

    def op(self, cls, a, b, x=0, y=0, sa="", sb=""):
        n = self.nodo(cls, x, y)
        self.conecta(a, sa, n, "A")
        self.conecta(b, sb, n, "B")
        return n

    def mul(self, a, b, x=0, y=0, sa="", sb=""):
        return self.op(unreal.MaterialExpressionMultiply, a, b, x, y, sa, sb)

    def lerp(self, a, b, alfa, x=0, y=0):
        n = self.nodo(unreal.MaterialExpressionLinearInterpolate, x, y)
        self.conecta(a, "", n, "A")
        self.conecta(b, "", n, "B")
        self.conecta(alfa, "", n, "Alpha")
        return n

    def uno(self, cls, entrada, x=0, y=0, sa="", **props):
        n = self.nodo(cls, x, y, **props)
        self.conecta(entrada, sa, n, "")
        return n

    def const(self, v, x=0, y=0):
        return self.nodo(unreal.MaterialExpressionConstant, x, y, r=float(v))

    def switch(self, nombre_, defecto, si, no, x=0, y=0):
        """Parámetro estático: cada combinación es una permutación de shader (la MI que lo cambia compila la suya)."""
        n = self.nodo(unreal.MaterialExpressionStaticSwitchParameter, x, y, parameter_name=nombre_, default_value=bool(defecto), group="FASTVFX")
        self.conecta(si, "", n, "True")
        self.conecta(no, "", n, "False")
        return n

    def salida(self, n, propiedad):
        if not MEL.connect_material_property(n, "", propiedad):
            self.fallos.append(f"{n.get_class().get_name()} -> {propiedad}")


def material_nuevo(ruta):
    """Un maestro se construye desde cero: si existe se vacía (no se borra el asset, que puede estar referenciado)."""
    if EAL.does_asset_exist(ruta):
        m = EAL.load_asset(ruta)
        MEL.delete_all_material_expressions(m)
    else:
        m = TOOLS.create_asset(nombre(ruta), carpeta(ruta), unreal.Material, unreal.MaterialFactoryNew())
    m.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    m.set_editor_property("blend_mode", unreal.BlendMode.BLEND_ADDITIVE)
    m.set_editor_property("two_sided", True)
    for uso in ("used_with_niagara_sprites", "used_with_niagara_mesh_particles", "used_with_niagara_ribbons", "used_with_static_lighting"):
        try:
            m.set_editor_property(uso, True)
        except Exception:  # noqa: BLE001 - used_with_static_lighting no existe en todas las versiones
            pass
    return m


def master_vfx(g, d):
    """Emisivo · color · opacidad · máscara radial (disco/anillo que crece con la edad) · Fresnel · ruido animado ·
    desvanecido por edad · distorsión opcional. Todo lo opcional va tras un switch estático."""
    color = g.vector("Color", d["Color"], y=-600)
    intensidad = g.escalar("Intensidad", d["Intensidad"], y=-450)
    opacidad = g.escalar("Opacidad", d["Opacidad"], y=-350)
    uno_ = g.const(1, -1200, 900)
    # partícula: color y alfa del emisor (blanco en mallas)
    pc = g.nodo(unreal.MaterialExpressionParticleColor, -1600, -200)
    edad = g.nodo(unreal.MaterialExpressionParticleRelativeTime, -1600, 100)
    # máscara radial en UV: d = 2·|uv − 0,5|; radio = lerp(RadioInicio, RadioFin, edad)
    uv = g.nodo(unreal.MaterialExpressionTextureCoordinate, -1600, 300)
    centro = g.nodo(unreal.MaterialExpressionConstant2Vector, -1600, 400, r=0.5, g=0.5)
    dist = g.op(unreal.MaterialExpressionDistance, uv, centro, -1400, 350)
    d2 = g.mul(dist, g.const(2, -1400, 450), -1250, 350)
    r0 = g.escalar("RadioInicio", d["RadioInicio"], -1400, 550)
    r1 = g.escalar("RadioFin", d["RadioFin"], -1400, 650)
    radio = g.lerp(r0, r1, edad, -1250, 550)
    suav = g.escalar("Suavidad", d["Suavidad"], -1250, 700)
    disco = g.uno(unreal.MaterialExpressionSaturate, g.op(unreal.MaterialExpressionDivide,
                  g.op(unreal.MaterialExpressionSubtract, radio, d2, -1100, 450), suav, -950, 450), -800, 450)
    ancho = g.escalar("AnchoAnillo", d["AnchoAnillo"], -1250, 800)
    distancia_anillo = g.uno(unreal.MaterialExpressionAbs, g.op(unreal.MaterialExpressionSubtract, d2, radio, -1100, 600), -950, 600)
    anillo = g.uno(unreal.MaterialExpressionSaturate, g.uno(unreal.MaterialExpressionOneMinus,
                   g.op(unreal.MaterialExpressionDivide, distancia_anillo, ancho, -850, 600), -700, 600), -550, 600)
    mezcla = g.escalar("Anillo", d["Anillo"], -800, 750)
    mascara_raw = g.lerp(disco, anillo, mezcla, -400, 500)
    mascara = g.switch("UsarMascaraRadial", True, mascara_raw, uno_, -250, 500)
    # desvanecido con la edad: (1 − edad)^Caida
    caida = g.escalar("Caida", d["Caida"], -800, 200)
    fade_raw = g.nodo(unreal.MaterialExpressionPower, -600, 150)
    g.conecta(g.uno(unreal.MaterialExpressionOneMinus, edad, -800, 100), "", fade_raw, "Base")
    g.conecta(caida, "", fade_raw, "Exp")
    fade = g.switch("DesvanecerConEdad", True, fade_raw, uno_, -400, 150)
    # Fresnel (en sprites encarados vale ~0; pensado para mallas)
    fexp = g.escalar("FresnelExp", d["FresnelExp"], -1000, -900)
    fpeso = g.escalar("FresnelPeso", d["FresnelPeso"], -1000, -800)
    fres = g.nodo(unreal.MaterialExpressionFresnel, -800, -900)
    g.conecta(fexp, "", fres, "ExponentIn")
    fresnel = g.switch("UsarFresnel", False, g.lerp(uno_, fres, fpeso, -600, -850), uno_, -400, -850)
    # ruido animado: textura de ruido del motor desplazada con el tiempo
    escala = g.escalar("RuidoEscala", d["RuidoEscala"], -1600, 1000)
    vel = g.escalar("RuidoVelocidad", d["RuidoVelocidad"], -1600, 1100)
    tiempo = g.nodo(unreal.MaterialExpressionTime, -1600, 1200)
    uv_ruido = g.op(unreal.MaterialExpressionAdd, g.mul(uv, escala, -1400, 1000), g.mul(tiempo, vel, -1400, 1150), -1200, 1050)
    muestra = g.nodo(unreal.MaterialExpressionTextureSample, -1000, 1050, texture=EAL.load_asset(NOISE))
    g.conecta(uv_ruido, "", muestra, "UVs")
    rpeso = g.escalar("RuidoPeso", d["RuidoPeso"], -1000, 1250)
    ruido_raw = g.lerp(uno_, g.mul(muestra, g.const(2, -800, 1150), -700, 1100, sa="R"), rpeso, -550, 1100)
    ruido = g.switch("UsarRuido", True, ruido_raw, uno_, -350, 1100)
    # emisivo = Color·Intensidad·color de partícula·máscara·Fresnel·ruido·edad
    base = g.mul(g.mul(color, intensidad, -1300, -550), pc, -1100, -500)
    factor = g.mul(g.mul(g.mul(mascara, fresnel, -100, 0), ruido, 50, 100), fade, 200, 150)
    g.salida(g.mul(base, factor, 400, -200), unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    alfa = g.mul(g.mul(opacidad, pc, -1100, -300, sb="A"), factor, 400, 0)
    g.salida(g.uno(unreal.MaterialExpressionSaturate, alfa, 550, 0), unreal.MaterialProperty.MP_OPACITY)
    # distorsión opcional: índice de refracción 1 + fuerza·ruido (switch apagado = 1, sin refracción)
    fuerza = g.escalar("DistorsionFuerza", d["DistorsionFuerza"], -800, 1400)
    ior = g.op(unreal.MaterialExpressionAdd, uno_, g.mul(fuerza, muestra, -600, 1400, sb="R"), -400, 1400)
    g.salida(g.switch("UsarDistorsion", False, ior, uno_, -200, 1400), unreal.MaterialProperty.MP_REFRACTION)


def master_hologram(g, d):
    """Holograma: borde Fresnel, líneas de barrido en Z del mundo que se desplazan, parpadeo senoidal."""
    color = g.vector("Color", d["Color"], y=-600)
    intensidad = g.escalar("Intensidad", d["Intensidad"], y=-450)
    opacidad = g.escalar("Opacidad", d["Opacidad"], y=-350)
    uno_ = g.const(1, -1200, 900)
    fexp = g.escalar("FresnelExp", d["FresnelExp"], -1200, -200)
    fres = g.nodo(unreal.MaterialExpressionFresnel, -1000, -200)
    g.conecta(fexp, "", fres, "ExponentIn")
    borde = g.lerp(g.escalar("BrilloInterior", d["BrilloInterior"], -1000, -50), uno_, fres, -800, -150)
    wp = g.nodo(unreal.MaterialExpressionWorldPosition, -1600, 200)
    z = g.uno(unreal.MaterialExpressionComponentMask, wp, -1400, 200, r=False, g=False, b=True, a=False)
    densidad = g.escalar("LineasDensidad", d["LineasDensidad"], -1400, 300)
    tiempo = g.nodo(unreal.MaterialExpressionTime, -1600, 400)
    vel = g.escalar("LineasVelocidad", d["LineasVelocidad"], -1400, 450)
    fase = g.op(unreal.MaterialExpressionAdd, g.mul(z, densidad, -1200, 250), g.mul(tiempo, vel, -1200, 420), -1000, 300)
    lineas = g.nodo(unreal.MaterialExpressionPower, -700, 300)
    g.conecta(g.uno(unreal.MaterialExpressionFrac, fase, -850, 300), "", lineas, "Base")
    g.conecta(g.const(3, -850, 400), "", lineas, "Exp")
    lpeso = g.escalar("LineasPeso", d["LineasPeso"], -700, 450)
    lineas_f = g.lerp(uno_, lineas, lpeso, -500, 350)
    pvel = g.escalar("ParpadeoVelocidad", d["ParpadeoVelocidad"], -1200, 650)
    seno = g.uno(unreal.MaterialExpressionSine, g.mul(tiempo, pvel, -1000, 650), -850, 650)
    parpadeo = g.escalar("Parpadeo", d["Parpadeo"], -850, 750)
    # 1 − Parpadeo·(0,5 + 0,5·sen)
    onda = g.op(unreal.MaterialExpressionAdd, g.const(0.5, -700, 600), g.mul(seno, g.const(0.5, -700, 700), -600, 650), -500, 650)
    flicker = g.uno(unreal.MaterialExpressionOneMinus, g.mul(parpadeo, onda, -400, 700), -250, 700)
    factor = g.mul(g.mul(borde, lineas_f, -300, 0), flicker, -100, 100)
    g.salida(g.mul(g.mul(color, intensidad, -1300, -550), factor, 200, -200), unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    g.salida(g.uno(unreal.MaterialExpressionSaturate, g.mul(opacidad, factor, 200, 0), 350, 0), unreal.MaterialProperty.MP_OPACITY)


MAESTROS = {"M_Master_VFX": master_vfx, "M_Master_Hologram": master_hologram}


def accion_maestro(a, medida):
    constructor = MAESTROS[a["plantilla"]]  # KeyError = plantilla desconocida: la receta ya se validó en el servicio
    t0 = time.perf_counter()
    m = material_nuevo(a["ruta"])
    g = Grafo(m)
    constructor(g, a["defectos"])
    medida.update(ms_construccion=ms(t0), nodos=g.nodos, conexiones_fallidas=g.fallos)
    if g.fallos:
        raise RuntimeError(f"Conexiones fallidas en {a['ruta']}: {g.fallos}")
    t0 = time.perf_counter()
    MEL.recompile_material(m)
    medida["estadisticas"] = estadisticas(m)  # get_statistics espera a FinishCompilation
    medida["ms_compilacion"] = ms(t0)
    guardar(m, medida)


def distinto(a, b):
    if isinstance(b, unreal.LinearColor):
        return max(abs(a.r - b.r), abs(a.g - b.g), abs(a.b - b.b), abs(a.a - b.a)) > 1e-4
    return abs(a - b) > 1e-4 if isinstance(b, float) else a != b


def accion_mi(a, medida):
    t0 = time.perf_counter()
    ruta = a["ruta"]
    padre = EAL.load_asset(a["padre"])
    if padre is None:
        raise RuntimeError(f"Falta el padre {a['padre']}")
    nueva = not EAL.does_asset_exist(ruta)
    mi = (TOOLS.create_asset(nombre(ruta), carpeta(ruta), unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
          if nueva else EAL.load_asset(ruta))
    if mi.get_editor_property("parent") != padre:
        MEL.set_material_instance_parent(mi, padre)
    # MaterialEditingLibrary.set_material_instance_*_parameter_value devuelve siempre False en 5.8 (el .cpp nunca pone
    # bResult): se comprueba que el padre tiene el parámetro y se relee el valor
    fallos = []
    nombres = {"escalares": set(map(str, MEL.get_scalar_parameter_names(padre))),
               "vectores": set(map(str, MEL.get_vector_parameter_names(padre))),
               "switches": set(map(str, MEL.get_static_switch_parameter_names(padre)))}
    for grupo, poner, leer, conv in (
            ("escalares", MEL.set_material_instance_scalar_parameter_value, MEL.get_material_instance_scalar_parameter_value, float),
            ("vectores", MEL.set_material_instance_vector_parameter_value, MEL.get_material_instance_vector_parameter_value,
             lambda v: unreal.LinearColor(*[float(x) for x in v])),
            ("switches", MEL.set_material_instance_static_switch_parameter_value, MEL.get_material_instance_static_switch_parameter_value, bool)):
        for k, v in a.get(grupo, {}).items():
            if k not in nombres[grupo]:
                fallos.append(k)
                continue
            valor = conv(v)
            poner(mi, k, valor)
            leido = leer(mi, k)
            if distinto(leido, valor):
                fallos.append(f"{k} (releído {leido})")
    medida.update(ms_construccion=ms(t0), nueva=nueva, parametros_fallidos=fallos)
    if fallos:
        raise RuntimeError(f"Parámetros que el padre no tiene en {ruta}: {fallos}")
    t0 = time.perf_counter()
    MEL.update_material_instance(mi)
    if a.get("medir", True):
        medida["estadisticas"] = estadisticas(mi)
    medida["ms_compilacion"] = ms(t0)
    guardar(mi, medida)


# --- Niagara ----------------------------------------------------------------------------------------------------------
FXU = unreal.FXConverterUtilitiesLibrary
I, F, V = unreal.NiagaraScriptInputType.INT, unreal.NiagaraScriptInputType.FLOAT, unreal.NiagaraScriptInputType.VEC3
EU, PS, PU = (unreal.ScriptExecutionCategory.EMITTER_UPDATE, unreal.ScriptExecutionCategory.PARTICLE_SPAWN,
              unreal.ScriptExecutionCategory.PARTICLE_UPDATE)


def script(path, version=None):
    data = FXU.create_asset_data(path)
    return unreal.CreateScriptContextArgs(data, version) if version else unreal.CreateScriptContextArgs(data)


class Niagara:
    def __init__(self):
        self.fallos = []
        self.modulos = 0

    def pon(self, modulo, etiqueta, entradas):
        for k, v in entradas:  # lista, no dict: la misma entrada puede ir dos veces (valor local y después enlace)
            if not modulo.set_parameter(k, v):
                self.fallos.append(f"{etiqueta}.{k}")

    def dinamica(self, path, entradas, tipo):
        ctx = FXU.create_script_context(script(path))
        self.pon(ctx, path.rsplit("/", 1)[-1], entradas)
        return FXU.create_script_input_dynamic(ctx, tipo)

    def mod(self, em, nombre_, path, cat, entradas=(), version=None):
        m = em.find_or_add_module_script(nombre_, script(path, version), cat)
        self.modulos += 1
        self.pon(m, nombre_, entradas)
        return m

    def rango(self, a, b):
        return self.dinamica("/Niagara/DynamicInputs/UniformRange/V2/RandomRangeFloat.RandomRangeFloat",
                             [("Minimum", FXU.create_script_input_float(a)), ("Maximum", FXU.create_script_input_float(b))], F)

    def por_usuario(self, usuario, valor):
        """valor · User.<usuario> (Multiply_Float): el parámetro de usuario escala lo que diseñó la plantilla."""
        return self.dinamica("/Niagara/DynamicInputs/Multiply/Multiply_Float.Multiply_Float",
                             [("A", FXU.create_script_input_float(1.0)),
                              ("A", FXU.create_script_input_linked_parameter("User." + usuario, F)), ("B", valor)], F)


def emisor(n, ctx, nombre_, material, rafaga, vida, tamano, velocidad=None, drag=0.0, gravedad=False, duracion=2.0):
    em = ctx.add_empty_emitter(nombre_)
    em.set_local_space(True)
    em.set_sim_target(unreal.NiagaraSimTarget.CPU_SIM)
    n.mod(em, "EmitterState", "/Niagara/Modules/Emitter/EmitterState.EmitterState", EU, [
        ("Loop Behavior", FXU.create_script_input_enum("/Niagara/Enums/ENiagara_EmitterStateOptions.ENiagara_EmitterStateOptions", "Once")),
        ("Loop Duration", FXU.create_script_input_float(duracion))])
    n.mod(em, "SpawnBurst", "/Niagara/Modules/Emitter/SpawnBurst_Instantaneous.SpawnBurst_Instantaneous", EU, [("Spawn Count", rafaga)])
    n.mod(em, "InitializeParticle", "/Niagara/Modules/Spawn/Initialization/V2/InitializeParticle.InitializeParticle", PS, [
        ("Lifetime", vida),
        ("Color", FXU.create_script_input_linear_color(unreal.LinearColor(1, 1, 1, 1))),
        ("Sprite Size Mode", FXU.create_script_input_enum("/Niagara/Enums/ENiagara_SizeScaleMode.ENiagara_SizeScaleMode", "Uniform")),
        ("Uniform Sprite Size", tamano)])
    if velocidad is not None:
        n.mod(em, "AddVelocity", "/Niagara/Modules/Spawn/Velocity/AddVelocity.AddVelocity", PS, [("Velocity", velocidad)])
    if gravedad:
        n.mod(em, "Gravity", "/Niagara/Modules/Update/Forces/GravityForce.GravityForce", PU)
    if drag:
        n.mod(em, "Drag", "/Niagara/Modules/Update/Forces/Drag.Drag", PU, [("Drag", FXU.create_script_input_float(drag))])
    if velocidad is not None or gravedad:
        n.mod(em, "SolveForcesAndVelocity", "/Niagara/Modules/Solvers/SolveForcesAndVelocity.SolveForcesAndVelocity", PU)
    n.mod(em, "ParticleState", "/Niagara/Modules/Update/Lifetime/ParticleState.ParticleState", PU, version=[1, 1])
    sprites = unreal.NiagaraSpriteRendererProperties()
    sprites.set_editor_property("material", material)
    em.add_renderer("SpriteRenderer", sprites)
    return em


def accion_niagara(a, medida):
    """FX_Energy_Base: núcleo, onda expansiva, chispas y partículas secundarias. Se construye una vez; las variantes
    duplican el resultado. Los parámetros de usuario (Particulas, Vida, Escala) se crean con el valor por defecto de la
    receta: primero se pone el valor local y después se enlaza (el editor copia el valor local al parámetro nuevo)."""
    d = a["defectos"]
    mats = {k: EAL.load_asset(v) for k, v in a["materiales"].items()}
    faltan = [k for k, v in mats.items() if v is None]
    if faltan:
        raise RuntimeError(f"Faltan los materiales {faltan}")
    ruta = a["ruta"]
    if EAL.does_asset_exist(ruta):
        # un sistema cargado no se puede rehacer en la misma sesión (Block Kings J1.9): se borra antes de abrir el editor
        raise RuntimeError(f"{ruta} ya existe; el servicio lo borra del disco antes de reconstruirlo")
    t0 = time.perf_counter()
    system = TOOLS.create_asset(nombre(ruta), carpeta(ruta), unreal.NiagaraSystem, unreal.NiagaraSystemFactoryNew())
    ctx = FXU.create_system_conversion_context(system)
    n = Niagara()
    vida = lambda base: n.por_usuario("Vida", base)  # noqa: E731
    escala = lambda base: n.por_usuario("Escala", base)  # noqa: E731
    uno = FXU.create_script_input_int(1)
    emisor(n, ctx, "Nucleo", mats["Nucleo"], uno, vida(FXU.create_script_input_float(0.45)), escala(FXU.create_script_input_float(160)))
    emisor(n, ctx, "Onda", mats["Onda"], uno, vida(FXU.create_script_input_float(0.7)), escala(FXU.create_script_input_float(520)))
    # chispas: cuántas = User.Particulas (valor local primero = valor por defecto del parámetro de usuario)
    chispas = emisor(n, ctx, "Chispas", mats["Chispas"], FXU.create_script_input_int(int(d["Particulas"])),
                     vida(n.rango(0.35, 0.9)), escala(n.rango(5, 11)),
                     velocidad=n.dinamica("/Niagara/DynamicInputs/Multiply/Multiply_VectorByFloat.Multiply_VectorByFloat", [
                         ("Vector", n.dinamica("/Niagara/DynamicInputs/UniformRange/V2/RandomRangeVector.RandomRangeVector", [
                             ("Minimum", FXU.create_script_input_vector(unreal.Vector(-700, -700, -300))),
                             ("Maximum", FXU.create_script_input_vector(unreal.Vector(700, 700, 700)))], V)),
                         ("Float", n.por_usuario("Escala", FXU.create_script_input_float(1.0)))], V),
                     drag=2.5, gravedad=True)
    n.pon(chispas.find_module_script("SpawnBurst"), "SpawnBurst", [("Spawn Count", FXU.create_script_input_linked_parameter("User.Particulas", I))])
    emisor(n, ctx, "Secundarias", mats["Secundarias"], FXU.create_script_input_int(24), vida(n.rango(0.8, 1.6)), escala(n.rango(14, 26)),
           velocidad=n.dinamica("/Niagara/DynamicInputs/UniformRange/V2/RandomRangeVector.RandomRangeVector", [
               ("Minimum", FXU.create_script_input_vector(unreal.Vector(-90, -90, 20))),
               ("Maximum", FXU.create_script_input_vector(unreal.Vector(90, 90, 140)))], V), drag=1.0)
    # una sola vez: el finalize del sistema pega los módulos de cada emisor (Block Kings: con em.finalize() se duplican)
    ctx.finalize()
    ctx.cleanup()
    medida.update(ms_construccion=ms(t0), emisores=4, modulos=n.modulos, entradas_fallidas=n.fallos)
    if n.fallos:
        raise RuntimeError(f"Entradas de módulo que no se pudieron fijar: {n.fallos}")
    guardar(system, medida)
    medida["parametros_usuario"] = leer_usuario(system, ["Particulas"], ["Vida", "Escala"])


def leer_usuario(system, enteros, reales):
    """Lee los parámetros de usuario con un NiagaraComponent transitorio: confirma que existen y su valor por defecto."""
    actores = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    actor = actores.spawn_actor_from_class(unreal.NiagaraActor, unreal.Vector(0, 0, -100000))
    comp = actor.get_editor_property("niagara_component")
    comp.set_asset(system)
    salida = {}
    for k in enteros:
        valor, valido = comp.get_variable_int(k)
        salida[k] = valor if valido else None
    for k in reales:
        valor, valido = comp.get_variable_float(k)
        salida[k] = round(valor, 4) if valido else None
    actores.destroy_actor(actor)
    return salida


def renderers(system):
    """Renderers de sprites que cuelgan de este sistema, por nombre de emisor."""
    prefijo = system.get_path_name() + ":"
    salida = {}
    for r in unreal.ObjectIterator(unreal.NiagaraSpriteRendererProperties):
        p = r.get_path_name()
        if p.startswith(prefijo):
            emisor_ = p[len(prefijo):].split(".")[0]
            base, _, n = emisor_.rpartition("_")
            salida.setdefault(base if n.isdigit() and base else emisor_, []).append(r)
    return salida


def accion_variante(a, medida):
    """Duplica el sistema base (si hace falta) y fija sus materiales: el grafo no se reconstruye ni se recompila."""
    t0 = time.perf_counter()
    ruta = a["ruta"]
    nueva = not EAL.does_asset_exist(ruta)
    system = EAL.duplicate_asset(a["base"], ruta) if nueva else EAL.load_asset(ruta)
    if system is None:
        raise RuntimeError(f"No se pudo duplicar {a['base']} en {ruta}")
    por_emisor = renderers(system)
    cambiados, faltan = 0, []
    for emisor_, mi_ruta in a["materiales"].items():
        mi = EAL.load_asset(mi_ruta)
        if mi is None or emisor_ not in por_emisor:
            faltan.append(emisor_)
            continue
        for r in por_emisor[emisor_]:
            if r.get_editor_property("material") != mi:
                r.set_editor_property("material", mi)
                cambiados += 1
    medida.update(ms_construccion=ms(t0), nueva=nueva, renderers_cambiados=cambiados, emisores=sorted(por_emisor))
    if faltan:
        raise RuntimeError(f"Emisores o MIs que faltan en {ruta}: {faltan}")
    system.modify()
    guardar(system, medida)
    medida["parametros_usuario"] = leer_usuario(system, ["Particulas"], ["Vida", "Escala"])


def accion_escenario(a, medida):
    """Nivel de preview: fondo negro, suelo oscuro, luz, cámara fija (Player0) mirando al origen, esfera para materiales."""
    t0 = time.perf_counter()
    niveles = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actores = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    if EAL.does_asset_exist(a["ruta"]):
        niveles.load_level(a["ruta"])
        for actor in actores.get_all_level_actors():
            actores.destroy_actor(actor)
    elif not niveles.new_level(a["ruta"]):
        raise RuntimeError(f"No se pudo crear {a['ruta']}")
    suelo = actores.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(0, 0, -120))
    suelo.static_mesh_component.set_static_mesh(EAL.load_asset("/Engine/BasicShapes/Plane"))
    suelo.set_actor_scale3d(unreal.Vector(40, 40, 1))
    suelo.static_mesh_component.set_material(0, EAL.load_asset("/Engine/EngineMaterials/DefaultMaterial"))
    luz = actores.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 500), unreal.Rotator(0, -50, 30))
    luz.light_component.set_intensity(2.0)
    esfera = actores.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(0, 0, 0))
    esfera.static_mesh_component.set_static_mesh(EAL.load_asset("/Engine/BasicShapes/Sphere"))
    esfera.set_actor_scale3d(unreal.Vector(2, 2, 2))
    esfera.static_mesh_component.set_mobility(unreal.ComponentMobility.MOVABLE)
    esfera.tags = ["FastVfxEsfera"]
    camara = actores.spawn_actor_from_class(unreal.CameraActor, unreal.Vector(-650, 0, 120), unreal.Rotator(0, -8, 0))
    camara.set_editor_property("auto_activate_for_player", unreal.AutoReceiveInput.PLAYER0)
    medida["ms_construccion"] = ms(t0)
    t0 = time.perf_counter()
    if not niveles.save_current_level():
        raise RuntimeError("No se pudo guardar el nivel de preview")
    medida["ms_guardado"] = ms(t0)


def accion_borrar(a, medida):
    """Con el editor caliente el sistema puede estar cargado: se borra aquí, no del disco (probado en UE 5.8.3)."""
    if EAL.does_asset_exist(a["ruta"]) and not EAL.delete_asset(a["ruta"]):
        raise RuntimeError(f"No se pudo borrar {a['ruta']}")


ACCIONES = {"borrar": accion_borrar, "maestro": accion_maestro, "mi": accion_mi, "niagara": accion_niagara, "variante": accion_variante, "escenario": accion_escenario}

inicio = time.perf_counter()
for accion in JOB["acciones"]:
    medida = {"tipo": accion["tipo"], "ruta": accion["ruta"], "receta": accion.get("receta"), "ok": False}
    t0 = time.perf_counter()
    try:
        ACCIONES[accion["tipo"]](accion, medida)
        medida["ok"] = True
    except Exception as e:  # noqa: BLE001 - el informe dice qué acción falló; el resto del lote sigue
        medida["error"] = str(e)
        report["errores"].append(f"{accion['ruta']}: {e}")
        unreal.log_error(traceback.format_exc())
    medida["ms_total"] = ms(t0)
    report["acciones"].append(medida)
    unreal.log(f"NOMOS_FASTVFX {medida['tipo']} {medida['ruta']} ok={medida['ok']} ms={medida['ms_total']}")
report["ms_script"] = ms(inicio)
report["ok"] = not report["errores"]
with open(REPORT, "w", encoding="utf-8") as f:
    json.dump(report, f, indent=2, ensure_ascii=False)
