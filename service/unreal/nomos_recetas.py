"""Nomos · recetas de editor (acelera C): escena, sondeo y bp_datos (UE 5.8, editor caliente o -ExecutePythonScript).

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


t0 = time.perf_counter()
try:
    {"escena": escena, "sondeo": sondeo, "bp_datos": bp_datos}[RECETA["plantilla"]](RECETA)
    report["ok"] = not report["errores"]
except Exception:  # noqa: BLE001
    report["errores"].append(traceback.format_exc())
report["ms_editor"] = round((time.perf_counter() - t0) * 1000, 1)
with open(REPORT, "w", encoding="utf-8") as f:
    json.dump(report, f, indent=1, ensure_ascii=False)
