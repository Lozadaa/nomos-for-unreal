"""Nomos · recetas de editor (acelera C y harness): escena, sondeo, bp_datos, importar_malla,
camara_tercera_persona, post_exterior y poblar_pcg (UE 5.8, editor caliente o -ExecutePythonScript).

Lee una receta ya validada por el servicio (NOMOS_RECETA_JOB, ver service/src/editor/recetas.ts) y deja el informe en
NOMOS_REPORT. Solo datos: `plantilla` elige una función de este archivo y los valores se convierten aquí; nunca se ejecuta
texto de la receta. Son los patrones que los workers de Herbalist reescribían en cada tarea (docs/x10/acelera.md).
"""
import json, os, time, traceback, unreal

RECETA = json.load(open(os.environ["NOMOS_RECETA_JOB"], encoding="utf-8"))
REPORT = os.environ["NOMOS_REPORT"]
EAL = unreal.EditorAssetLibrary
report = {"engine": str(unreal.SystemLibrary.get_engine_version()), "plantilla": RECETA.get("plantilla"), "ok": False, "errores": [], "avisos": []}


def rot(x):
    return unreal.Rotator(roll=x[2], pitch=x[0], yaw=x[1])


def asset(ruta):
    a = unreal.load_asset(ruta)
    if a is None:
        raise RuntimeError(f"No existe el asset {ruta}")
    return a


def clase(nombre):
    """PointLight → unreal.PointLight; /Script/Modulo.Clase → load_class; /Game/.../BP_X → la clase generada del Blueprint."""
    if nombre.startswith("/Game/") or nombre.startswith("/Engine/"):
        c = EAL.load_blueprint_class(nombre)
    elif nombre.startswith("/Script/"):
        c = unreal.load_class(None, nombre)
    else:
        c = getattr(unreal, nombre, None)
    if c is None:
        raise RuntimeError(f"Clase desconocida: {nombre}")
    return c


def valor(v):
    if isinstance(v, dict):
        k, x = next(iter(v.items()))
        if k == "vector":
            return unreal.Vector(*x)
        if k == "rotador":
            return rot(x)
        if k == "color":
            return unreal.LinearColor(*(list(x) + [1.0])[:4])
        if k == "transform":
            return unreal.Transform(unreal.Vector(*x.get("pos", [0, 0, 0])), rot(x.get("rot", [0, 0, 0])), unreal.Vector(*x.get("escala", [1, 1, 1])))
    if isinstance(v, str) and (v.startswith("/Game/") or v.startswith("/Engine/")):
        return asset(v)
    return v


def poner(objetos, props, donde):
    """Cada propiedad en el primer objeto que la acepte (el actor y luego sus componentes)."""
    for k, v in (props or {}).items():
        x = valor(v)
        # un color puede ser FLinearColor o FColor (light_color de las luces es FColor): se prueban los dos
        intentos = [x, srgb(x)] if isinstance(x, unreal.LinearColor) else [x]
        for o in objetos:
            if any(_pon(o, k, y) for y in intentos):
                break
        else:
            report["errores"].append(f"{donde}: ninguna parte acepta la propiedad {k}")


def srgb(c):
    """FLinearColor → FColor sRGB (en UE 5.8 Python no hay to_fcolor). ponytail: gamma 2,2 aproximada."""
    a = lambda x: round(max(0.0, min(1.0, x)) ** (1 / 2.2) * 255)
    return unreal.Color(r=a(c.r), g=a(c.g), b=a(c.b), a=round(max(0.0, min(1.0, c.a)) * 255))


def _pon(o, k, v):
    try:
        o.set_editor_property(k, v)
        return True
    except Exception:  # noqa: BLE001  este objeto no la tiene (o no con ese tipo)
        return False


# --- escena ----------------------------------------------------------------------------------------------------------
BASE = [  # mapa nuevo con base: suelo, sol, cielo y cámara (como el nivel de preview de FASTVFX)
    {"nombre": "Suelo", "malla": "/Engine/BasicShapes/Plane", "pos": [0, 0, 0], "escala": [50, 50, 1]},
    {"nombre": "Sol", "clase": "DirectionalLight", "pos": [0, 0, 500], "rot": [-45, 30, 0]},
    {"nombre": "Cielo", "clase": "SkyLight", "pos": [0, 0, 300]},
    {"nombre": "Camara", "clase": "CameraActor", "pos": [-600, 0, 300], "rot": [-20, 0, 0]},
]


def escena(r):
    niveles = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actores = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    if r.get("nuevo") and not EAL.does_asset_exist(r["mapa"]):
        if not niveles.new_level(r["mapa"], False):
            raise RuntimeError(f"No se pudo crear el nivel {r['mapa']}")
    elif not niveles.load_level(r["mapa"]):
        raise RuntimeError(f"No se pudo cargar el nivel {r['mapa']}")
    etiqueta = r["etiqueta"]
    viejos = [a for a in actores.get_all_level_actors() if etiqueta in [str(t) for t in a.tags]]
    actores.destroy_actors(viejos)
    world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    hechos = []
    for d in (BASE if r.get("base") else []) + r["actores"]:
        pos, giro = unreal.Vector(*d["pos"]), rot(d.get("rot", [0, 0, 0]))
        try:
            if "malla" in d:
                a = actores.spawn_actor_from_object(asset(d["malla"]), pos, giro)
            else:
                a = actores.spawn_actor_from_class(clase(d.get("bp") or d["clase"]), pos, giro)
            if a is None:
                raise RuntimeError("spawn devolvió None")
            a.set_actor_label(d["nombre"])
            a.set_editor_property("tags", [unreal.Name(etiqueta)])
            if d.get("carpeta"):
                a.set_folder_path(d["carpeta"])
            if "escala" in d:
                e = d["escala"]
                a.set_actor_scale3d(unreal.Vector(*e) if isinstance(e, list) else unreal.Vector(e, e, e))
            if d.get("material"):
                for c in a.get_components_by_class(unreal.MeshComponent):
                    for i in range(max(1, c.get_num_materials())):
                        c.set_material(i, asset(d["material"]))
            if d.get("texto") is not None:
                for c in a.get_components_by_class(unreal.TextRenderComponent):
                    c.set_editor_property("text", d["texto"])
            poner([a, *a.get_components_by_class(unreal.ActorComponent)], d.get("propiedades"), d["nombre"])
            if d.get("apoyar"):
                apoyar(world, a)
            l = a.get_actor_location()
            hechos.append({"nombre": d["nombre"], "clase": a.get_class().get_name(), "pos": [round(l.x, 1), round(l.y, 1), round(l.z, 1)]})
        except Exception as e:  # noqa: BLE001  un actor que falla se anota y se siguen los demás
            report["errores"].append(f"{d['nombre']}: {e}")
    if not niveles.save_current_level():
        report["errores"].append("No se pudo guardar el nivel")
    report.update(mapa=r["mapa"], etiqueta=etiqueta, borrados=len(viejos), actores=hechos)


def apoyar(world, a):
    """Baja (o sube) el actor hasta que la base de su caja toca lo que hay debajo (traza vertical que lo ignora a él)."""
    # solo lo que colisiona: los iconos del editor y las luces no cuentan para la base (probado: si no, flota)
    origen, extension = a.get_actor_bounds(True)
    if extension.z <= 0:
        origen, extension = a.get_actor_bounds(False)
    l = a.get_actor_location()
    golpe = unreal.SystemLibrary.line_trace_single(world, unreal.Vector(l.x, l.y, origen.z + extension.z + 5000),
                                                   unreal.Vector(l.x, l.y, origen.z - 100000), unreal.TraceTypeQuery.TRACE_TYPE_QUERY1,
                                                   True, [a], unreal.DrawDebugTrace.NONE, True)
    if golpe is None:
        return report["avisos"].append(f"{a.get_actor_label()}: nada debajo para apoyarlo")
    z = golpe.to_tuple()[4].z  # impact_point
    a.set_actor_location(unreal.Vector(l.x, l.y, l.z + z - (origen.z - extension.z)), False, False)


# --- sondeo ----------------------------------------------------------------------------------------------------------
def malla_de(c):
    for p in ("static_mesh", "skeletal_mesh_asset", "skeletal_mesh"):
        try:
            m = c.get_editor_property(p)
            if m:
                return m.get_path_name()
        except Exception:  # noqa: BLE001
            continue
    return None


def componente(c):
    out = {"nombre": c.get_name(), "clase": c.get_class().get_name()}
    m = malla_de(c)
    if m:
        out["malla"] = m
    if isinstance(c, unreal.MeshComponent):
        out["materiales"] = [x.get_path_name() if x else None for x in c.get_materials()]
    return out


def sondeo(r):
    limite, clases = r.get("limite", 1000), set(r.get("clases") or [])
    reg = unreal.AssetRegistryHelpers.get_asset_registry()
    assets = []
    for carpeta in r.get("carpetas") or []:
        for d in reg.get_assets_by_path(carpeta, recursive=True):
            c = str(d.asset_class_path.asset_name)
            if clases and c not in clases:
                continue
            if len(assets) >= limite:
                report["avisos"].append(f"Cortado a {limite} assets")
                break
            item = {"ruta": str(d.package_name), "clase": c}
            if r.get("componentes") and c == "Blueprint":
                sds = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
                lib = unreal.SubobjectDataBlueprintFunctionLibrary
                objs = [lib.get_object(lib.get_data(h)) for h in sds.k2_gather_subobject_data_for_blueprint(d.get_asset())]
                # el gather de UE 5.8 repite cada componente añadido: uno por nombre, sin el sufijo de plantilla
                vistos = {}
                for o in objs:
                    if isinstance(o, unreal.ActorComponent):
                        c = componente(o)
                        c["nombre"] = c["nombre"].replace("_GEN_VARIABLE", "")
                        vistos.setdefault(c["nombre"], c)
                item["componentes"] = list(vistos.values())
            assets.append(item)
    report["assets"] = assets
    if r.get("mapa"):
        if not unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).load_level(r["mapa"]):
            raise RuntimeError(f"No se pudo cargar el nivel {r['mapa']}")
        lista = []
        for a in unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()[:limite]:
            l = a.get_actor_location()
            lista.append({"nombre": a.get_actor_label(), "clase": a.get_class().get_name(), "pos": [round(l.x, 1), round(l.y, 1), round(l.z, 1)],
                          "tags": [str(t) for t in a.tags], "carpeta": str(a.get_folder_path()),
                          "componentes": [componente(c) for c in a.get_components_by_class(unreal.MeshComponent)]})
        report["actores"] = lista


# --- bp_datos --------------------------------------------------------------------------------------------------------
def crear(ruta, factoria):
    if EAL.does_asset_exist(ruta):
        return asset(ruta), False
    carpeta, nombre = ruta.rsplit("/", 1)
    a = unreal.AssetToolsHelpers.get_asset_tools().create_asset(nombre, carpeta, None, factoria)
    if a is None:
        raise RuntimeError(f"No se pudo crear {ruta}")
    return a, True


def bp_datos(r):
    f = unreal.BlueprintFactory()
    f.set_editor_property("parent_class", clase(r["padre"]))
    bp, nuevo = crear(r["ruta"], f)
    sds = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
    lib = unreal.SubobjectDataBlueprintFunctionLibrary
    hechos = []
    for c in r.get("componentes") or []:
        handles = sds.k2_gather_subobject_data_for_blueprint(bp)
        existentes = {str(lib.get_variable_name(lib.get_data(h))): h for h in handles}
        h = existentes.get(c["nombre"])
        if h is None:
            h, motivo = sds.add_new_subobject(unreal.AddNewSubobjectParams(parent_handle=handles[0], new_class=clase(c["clase"]), blueprint_context=bp))
            if not lib.is_handle_valid(h):
                report["errores"].append(f"{c['nombre']}: {motivo}")
                continue
            sds.rename_subobject(h, unreal.Text(c["nombre"]))
        o = lib.get_object(lib.get_data(h))
        props = {"relative_location": {"vector": c["pos"]}} if "pos" in c else {}
        if "rot" in c:
            props["relative_rotation"] = {"rotador": c["rot"]}
        if "escala" in c:
            props["relative_scale3d"] = {"vector": c["escala"]}
        if "malla" in c:
            props["skeletal_mesh_asset" if isinstance(o, unreal.SkeletalMeshComponent) else "static_mesh"] = c["malla"]
        poner([o], props, c["nombre"])
        if "material" in c and isinstance(o, unreal.MeshComponent):
            o.set_material(0, asset(c["material"]))
        hechos.append(c["nombre"])
    unreal.BlueprintEditorLibrary.compile_blueprint(bp)
    if r.get("propiedades"):
        poner([unreal.get_default_object(bp.generated_class())], r["propiedades"], r["ruta"])
        unreal.BlueprintEditorLibrary.compile_blueprint(bp)
    if not EAL.save_loaded_asset(bp, only_if_is_dirty=False):
        report["errores"].append(f"No se pudo guardar {r['ruta']}")
    report.update(ruta=r["ruta"], creado=nuevo, componentes=hechos)
    if r.get("datos"):
        d = r["datos"]
        fd = unreal.DataAssetFactory()
        fd.set_editor_property("data_asset_class", clase(d["clase"]))
        da, nuevo_da = crear(d["ruta"], fd)
        poner([da], d.get("propiedades"), d["ruta"])
        if not EAL.save_loaded_asset(da, only_if_is_dirty=False):
            report["errores"].append(f"No se pudo guardar {d['ruta']}")
        report["datos"] = {"ruta": d["ruta"], "creado": nuevo_da}



# --- utilidades de las recetas del harness ----------------------------------------------------------------------------
def rot_(x):
    return x if isinstance(x, unreal.Rotator) else rot(x)


def transformar(o, pos=None, rot=None, escala=None):
    """Cambia solo lo pedido y conserva el resto del transform. Con un set_actor_transform a medias el motor deja
    escala 1 o rotación 0 en silencio (regla del harness: «escalas reseteadas»)."""
    t = o.get_actor_transform()
    o.set_actor_transform(unreal.Transform(unreal.Vector(*pos) if pos is not None else t.translation,
                                           rot_(rot) if rot is not None else t.rotation.rotator(),
                                           unreal.Vector(*escala) if escala is not None else t.scale3d), False, False)


def cargar_nivel(ruta):
    if not unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).load_level(ruta):
        raise RuntimeError(f"No se pudo cargar el nivel {ruta}")
    return unreal.get_editor_subsystem(unreal.EditorActorSubsystem)


def guardar_nivel():
    """Guarda el mapa abierto y lo comprueba en disco. Probado en UE 5.8.3: desde un tick (la espera de PCG) los dos
    guardados devuelven False tras un aviso de control de versiones y aun así el .umap se escribe; manda el archivo."""
    mundo = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    rel = mundo.get_outermost().get_name()[len("/Game/"):]
    umap = os.path.join(unreal.SystemLibrary.convert_to_absolute_path(unreal.Paths.project_content_dir()), rel + ".umap")
    antes = os.path.getmtime(umap) if os.path.exists(umap) else 0
    if not unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level():
        unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True, False)
    if not os.path.exists(umap) or os.path.getmtime(umap) <= antes:
        report["errores"].append("No se pudo guardar el nivel")


def de_clase(actores, c):
    return [a for a in actores.get_all_level_actors() if isinstance(a, c)]


# --- importar_malla ---------------------------------------------------------------------------------------------------
# texturas de datos (no color): sin sRGB. Las normales las detecta el importador solo.
DATOS = ("height", "_h.", "_h_", "mask", "rough", "_orm", "_arm", "_ao.", "metal", "opacity")


def importar_malla(r):
    t = unreal.AssetImportTask()
    t.filename = r["fuente"]
    t.destination_path = r["destino"]
    if r.get("nombre"):
        t.destination_name = r["nombre"]
    t.automated, t.save, t.replace_existing = True, True, True
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([t])
    rutas = [str(p) for p in t.imported_object_paths]
    if not rutas:
        raise RuntimeError(f"El importador no creó nada desde {r['fuente']}")
    hechos = []
    for ruta in rutas:
        a = unreal.load_asset(ruta)
        item = {"ruta": ruta.split(".")[0], "clase": a.get_class().get_name()}
        if isinstance(a, unreal.StaticMesh):
            caja = a.get_bounding_box()
            lo, hi = caja.min, caja.max
            tam = [round(hi.x - lo.x, 1), round(hi.y - lo.y, 1), round(hi.z - lo.z, 1)]
            item.update(tam=tam, base_z=round(lo.z, 1))
            if max(tam) > 5000:
                report["errores"].append(f"{item['ruta']} mide {max(tam) / 100:.0f} m: ¿exportado ×100 (cm sobre cm)?")
            elif max(tam) < 2:
                report["errores"].append(f"{item['ruta']} mide {max(tam):.2f} cm: ¿exportado en metros sin escalar (×0,01)?")
            alto = r.get("alto_cm")
            if alto and not alto[0] <= tam[2] <= alto[1]:
                report["errores"].append(f"{item['ruta']} mide {tam[2]} cm de alto; se esperaba entre {alto[0]} y {alto[1]}")
            if r.get("modulo") and abs(lo.z) > max(1.0, 0.02 * tam[2]):
                report["errores"].append(f"{item['ruta']}: el pivote no está en la base (base a {lo.z:.1f} cm); en un módulo va en Z = 0")
        elif isinstance(a, unreal.Texture2D) and any(k in ruta.lower().rsplit("/", 1)[-1] + "." for k in DATOS):
            if a.get_editor_property("srgb"):
                a.set_editor_property("srgb", False)
                EAL.save_loaded_asset(a, only_if_is_dirty=False)
                item["srgb"] = "apagado (textura de datos)"
        hechos.append(item)
    report["assets"] = hechos


# --- camara_tercera_persona -------------------------------------------------------------------------------------------
def camara_tercera_persona(r):
    """Brazo y cámara del pawn. Si el Blueprint ya los tiene (también heredados de C++) los ajusta en su objeto por
    defecto; si no, los añade. Deja una sola cámara activa y comprueba que la lente quede fuera de la malla."""
    bp = asset(r["bp"])
    cdo = unreal.get_default_object(bp.generated_class())
    brazos = cdo.get_components_by_class(unreal.SpringArmComponent)
    camaras = cdo.get_components_by_class(unreal.CameraComponent)
    if not brazos or not camaras:
        sds = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
        lib = unreal.SubobjectDataBlueprintFunctionLibrary
        handles = sds.k2_gather_subobject_data_for_blueprint(bp)
        padre = handles[0]
        if not brazos:
            h, motivo = sds.add_new_subobject(unreal.AddNewSubobjectParams(parent_handle=padre, new_class=unreal.SpringArmComponent, blueprint_context=bp))
            if not lib.is_handle_valid(h):
                raise RuntimeError(f"No se pudo añadir el brazo: {motivo}")
            sds.rename_subobject(h, unreal.Text("Brazo"))
            padre = h
        if not camaras:
            h, motivo = sds.add_new_subobject(unreal.AddNewSubobjectParams(parent_handle=padre, new_class=unreal.CameraComponent, blueprint_context=bp))
            if not lib.is_handle_valid(h):
                raise RuntimeError(f"No se pudo añadir la cámara: {motivo}")
            sds.rename_subobject(h, unreal.Text("Camara"))
        unreal.BlueprintEditorLibrary.compile_blueprint(bp)
        cdo = unreal.get_default_object(bp.generated_class())
        brazos = cdo.get_components_by_class(unreal.SpringArmComponent)
        camaras = cdo.get_components_by_class(unreal.CameraComponent)
    brazo, cam = brazos[0], camaras[0]
    largo, offset = float(r.get("brazo", 400)), r.get("offset", [0, 0, 60])
    brazo.set_editor_property("target_arm_length", largo)
    brazo.set_editor_property("socket_offset", unreal.Vector(*offset))
    brazo.set_editor_property("use_pawn_control_rotation", bool(r.get("sigue_raton", True)))
    brazo.set_editor_property("do_collision_test", bool(r.get("colision", True)))
    lag = float(r.get("lag", 0))
    brazo.set_editor_property("enable_camera_lag", lag > 0)
    if lag > 0:
        brazo.set_editor_property("camera_lag_speed", lag)
    cam.set_editor_property("field_of_view", float(r.get("fov", 90)))
    cam.set_editor_property("use_pawn_control_rotation", False)  # la gira el brazo; las dos a la vez pelean
    activas = [c for c in camaras if c.get_editor_property("auto_activate")]
    for c in activas[1:]:
        c.set_editor_property("auto_activate", False)
        report["avisos"].append(f"{c.get_name()}: desactivada; el pawn usa la primera cámara activa")
    radio = 0.0
    for m in cdo.get_components_by_class(unreal.SkeletalMeshComponent):
        malla = m.get_editor_property("skeletal_mesh_asset")
        if malla:
            radio = max(radio, malla.get_bounds().sphere_radius)
    distancia = (largo ** 2 + sum(x * x for x in offset)) ** 0.5
    if radio and distancia < radio * 1.1:
        report["errores"].append(f"La lente queda dentro de la malla: {distancia:.0f} cm de brazo con una malla de {radio:.0f} cm de radio")
    unreal.BlueprintEditorLibrary.compile_blueprint(bp)
    if not EAL.save_loaded_asset(bp, only_if_is_dirty=False):
        report["errores"].append(f"No se pudo guardar {r['bp']}")
    report.update(bp=r["bp"], brazo=largo, fov=float(r.get("fov", 90)), camaras=len(camaras), radio_malla=round(radio, 1))


# --- post_exterior ----------------------------------------------------------------------------------------------------
def pon_pp(ajustes, campo, valor):
    ajustes.set_editor_property("override_" + campo, True)
    ajustes.set_editor_property(campo, valor)


def post_exterior(r):
    actores = cargar_nivel(r["mapa"])
    hechos = []
    if r.get("cielo", True):
        for c, nombre, pos in ((unreal.DirectionalLight, "Sol", [0, 0, 600]), (unreal.SkyAtmosphere, "Atmosfera", [0, 0, 0]),
                               (unreal.SkyLight, "LuzCielo", [0, 0, 400]), (unreal.ExponentialHeightFog, "Niebla", [0, 0, 100])):
            if not de_clase(actores, c):
                a = actores.spawn_actor_from_class(c, unreal.Vector(*pos), unreal.Rotator(roll=0, pitch=-40, yaw=0) if c is unreal.DirectionalLight else unreal.Rotator())
                a.set_actor_label(nombre)
                hechos.append(f"añadido {nombre}")
    soles, atmosferas, nieblas = de_clase(actores, unreal.DirectionalLight), de_clase(actores, unreal.SkyAtmosphere), de_clase(actores, unreal.ExponentialHeightFog)
    for nombre, lista in (("SkyAtmosphere", atmosferas), ("ExponentialHeightFog", nieblas), ("DirectionalLight", soles)):
        if len(lista) > 1:
            report["avisos"].append(f"Hay {len(lista)} {nombre}: dos a la vez dan neblina o doble sol")
    for a in de_clase(actores, unreal.SkyLight):
        a.light_component.set_editor_property("real_time_capture", bool(atmosferas))
    ppvs = [v for v in de_clase(actores, unreal.PostProcessVolume) if v.get_editor_property("unbound")]
    if not ppvs:
        v = actores.spawn_actor_from_class(unreal.PostProcessVolume, unreal.Vector(0, 0, 0), unreal.Rotator())
        v.set_actor_label("PostExterior")
        v.set_editor_property("unbound", True)
        ppvs = [v]
        hechos.append("añadido PostExterior sin límites")
    for v in ppvs:  # todos los sin límites: si no, se pelean
        aj = v.get_editor_property("settings")
        pon_pp(aj, "auto_exposure_method", unreal.AutoExposureMethod.AEM_MANUAL)
        pon_pp(aj, "auto_exposure_apply_physical_camera_exposure", False)
        pon_pp(aj, "auto_exposure_bias", float(r.get("exposicion", 0)))
        pon_pp(aj, "motion_blur_amount", 0.0)
        v.set_editor_property("settings", aj)
    sol = r.get("sol") or {}
    for a in soles[:1]:
        luz = a.light_component
        luz.set_editor_property("atmosphere_sun_light", True)
        if "pitch" in sol or "yaw" in sol:
            g = a.get_actor_rotation()
            transformar(a, rot=[sol.get("pitch", g.pitch), sol.get("yaw", g.yaw), 0])
        if "intensidad" in sol:
            luz.set_editor_property("intensity", float(sol["intensidad"]))
        if "kelvin" in sol:
            luz.set_editor_property("use_temperature", True)
            luz.set_editor_property("temperature", float(sol["kelvin"]))
        pitch = a.get_actor_rotation().pitch
        if not atmosferas and pitch > -15:
            report["avisos"].append(f"Sol bajo (pitch {pitch:.0f}) sin SkyAtmosphere: con la niebla por defecto sale todo blanco")
    niebla = r.get("niebla") or {}
    for a in nieblas[:1]:
        c = a.get_component_by_class(unreal.ExponentialHeightFogComponent)
        for clave, prop in (("densidad", "fog_density"), ("opacidad_max", "fog_max_opacity"), ("inicio", "start_distance")):
            if clave in niebla:
                c.set_editor_property(prop, float(niebla[clave]))
        if c.get_editor_property("fog_max_opacity") > 0.9:
            report["avisos"].append("FogMaxOpacity > 0,9: franja gris en el horizonte a contraluz")
    guardar_nivel()
    report.update(mapa=r["mapa"], hechos=hechos, volumenes=len(ppvs), exposicion=float(r.get("exposicion", 0)))


# --- poblar_pcg -------------------------------------------------------------------------------------------------------
def grafo_esparcir(r):
    """Grafo propio: rejilla de puntos en el volumen, desplazamiento, giro y escala al azar, spawner con la paleta."""
    ruta = "/Game/Nomos/PCG/PCG_" + r["etiqueta"].replace(".", "_").replace("-", "_")
    if EAL.does_asset_exist(ruta):
        EAL.delete_asset(ruta)  # se rehace entero: cambiar la paleta de un spawner existente no se aplica al reejecutar
    carpeta, nombre = ruta.rsplit("/", 1)
    g = unreal.AssetToolsHelpers.get_asset_tools().create_asset(nombre, carpeta, unreal.PCGGraph, unreal.PCGGraphFactory())
    if g is None:
        raise RuntimeError(f"No se pudo crear el grafo {ruta}")
    sep = float(r.get("separacion", 300))
    rejilla, s1 = g.add_node_of_type(unreal.PCGCreatePointsGridSettings)
    s1.set_editor_property("grid_extents", unreal.Vector(r["extension"][0], r["extension"][1], 0))
    s1.set_editor_property("cell_size", unreal.Vector(sep, sep, 100))
    s1.set_editor_property("coordinate_space", unreal.PCGCoordinateSpace.ORIGINAL_COMPONENT)
    var, s2 = g.add_node_of_type(unreal.PCGTransformPointsSettings)
    e = r.get("escala", [0.6, 1.4])
    s2.set_editor_property("offset_min", unreal.Vector(-sep * 0.45, -sep * 0.45, 0))
    s2.set_editor_property("offset_max", unreal.Vector(sep * 0.45, sep * 0.45, 0))
    s2.set_editor_property("rotation_max", unreal.Rotator(roll=0, pitch=0, yaw=360))
    s2.set_editor_property("uniform_scale", True)
    s2.set_editor_property("scale_min", unreal.Vector(e[0], e[0], e[0]))
    s2.set_editor_property("scale_max", unreal.Vector(e[1], e[1], e[1]))
    spawner, s3 = g.add_node_of_type(unreal.PCGStaticMeshSpawnerSettings)
    sel = s3.get_editor_property("mesh_selector_parameters")
    entradas = []
    for p in r["paleta"]:
        en = unreal.PCGMeshSelectorWeightedEntry()
        d = en.get_editor_property("descriptor")
        d.set_editor_property("static_mesh", asset(p["malla"]))
        if p.get("material"):
            d.set_editor_property("override_materials", [asset(p["material"])])
        en.set_editor_property("descriptor", d)
        en.set_editor_property("weight", int(p.get("peso", 1)))
        entradas.append(en)
    sel.set_editor_property("mesh_entries", entradas)
    g.add_edge(rejilla, "Out", var, "In")
    g.add_edge(var, "Out", spawner, "In")
    g.add_edge(spawner, "Out", g.get_output_node(), "In")
    EAL.save_loaded_asset(g, only_if_is_dirty=False)
    return g


def instancias(a):
    return sum(c.get_instance_count() for c in a.get_components_by_class(unreal.InstancedStaticMeshComponent))


def poblar_pcg(r):
    if os.environ.get("NOMOS_CALIENTE") in (None, "", "off"):
        raise RuntimeError("poblar_pcg necesita el editor caliente: la generación de PCG es asíncrona y en frío no hay ticks")
    actores = cargar_nivel(r["mapa"])
    viejos = [a for a in actores.get_all_level_actors() if r["etiqueta"] in [str(t) for t in a.tags]]
    actores.destroy_actors(viejos)  # se recrea el volumen: cambiar material o descriptor no se aplica al reejecutar
    grafo = asset(r["grafo"]) if r.get("grafo") else grafo_esparcir(r)
    v = actores.spawn_actor_from_class(unreal.PCGVolume, unreal.Vector(*r["pos"]), unreal.Rotator())
    v.set_actor_label("PCG_" + r["etiqueta"])
    v.set_editor_property("tags", [unreal.Name(r["etiqueta"])])
    transformar(v, escala=[max(x, 1) / 100 for x in r["extension"]])  # el pincel del volumen mide 200 cm
    c = v.get_component_by_class(unreal.PCGComponent)
    c.set_graph(grafo)
    c.set_editor_property("seed", int(r.get("semilla", 42)))
    c.generate(True)
    estado = {"t": time.time(), "n": -1, "quieto": time.time()}
    report.update(mapa=r["mapa"], etiqueta=r["etiqueta"], grafo=grafo.get_path_name().split(".")[0], borrados=len(viejos))

    def esperar():
        # el aviso modal del guardado procesa ticks y volvería a entrar aquí (probado: errores duplicados)
        if estado.get("dentro"):
            return False
        estado["dentro"] = True
        try:
            return esperar_()
        finally:
            estado["dentro"] = False

    def esperar_():
        n = instancias(v)
        if n != estado["n"]:
            estado.update(n=n, quieto=time.time())
        if n > 0 and time.time() - estado["quieto"] > 1.5:
            report["instancias"] = n
            guardar_nivel()
            return True
        if time.time() - estado["t"] > 60:
            report["instancias"] = n
            report["errores"].append("0 instancias tras 60 s: el grafo no generó nada (fallo silencioso típico de PCG)" if n == 0
                                     else f"La generación no se estabilizó en 60 s ({n} instancias)")
            return True
        return False
    return esperar


def cerrar():
    report["ok"] = not report["errores"]
    report["ms_editor"] = round((time.perf_counter() - t0) * 1000, 1)
    with open(REPORT, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=1, ensure_ascii=False)


PLANTILLAS = {"escena": escena, "sondeo": sondeo, "bp_datos": bp_datos, "importar_malla": importar_malla,
              "camara_tercera_persona": camara_tercera_persona, "post_exterior": post_exterior, "poblar_pcg": poblar_pcg}
t0 = time.perf_counter()
pendiente = None
try:
    pendiente = PLANTILLAS[RECETA["plantilla"]](RECETA)
except Exception:  # noqa: BLE001
    report["errores"].append(traceback.format_exc())
if callable(pendiente):
    def nomos_pendiente():
        """Editor caliente (nomos_caliente.py): se llama en cada tick hasta True; entonces se escribe el informe."""
        try:
            hecho = pendiente()
        except Exception:  # noqa: BLE001
            report["errores"].append(traceback.format_exc())
            hecho = True
        if hecho:
            cerrar()
        return hecho
else:
    cerrar()
