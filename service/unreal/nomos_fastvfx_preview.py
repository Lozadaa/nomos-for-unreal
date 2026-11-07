"""Nomos · FASTVFX: capturas de preview DENTRO del juego lanzado desde el editor (`-game L_FastVfxPreview`, con
`-ExecCmds="py …"`, como nomos_pie_capture.py).

Lee NOMOS_FASTVFX_PREVIEW (JSON: {"calentar": s, "items": [{"tipo": "niagara"|"material", "asset", "frame", "png",
"usuario": {...}}]}). Primero pone todo a la vista a la vez `calentar` segundos (el editor compila en ese rato las
permutaciones de shader que falten: sprites de Niagara, mallas); después, uno a uno:
  niagara   lo lanza en el origen con la edad fija (AgeUpdateMode = DesiredAge, SeekDelta 1/60) en `frame` segundos y
            los parámetros de usuario de la receta (set_variable_*): el fotograma es el mismo en cada corrida
  material  lo pone en la esfera del nivel y espera `frame` segundos de juego (el tiempo del material es el del mundo)
y captura con `Shot` (HighResShot colgó la GPU en Block Kings J2.2).
"""
import json, os, shutil, time, unreal

REPORT = os.environ["NOMOS_REPORT"]
JOB = json.load(open(os.environ["NOMOS_FASTVFX_PREVIEW"], encoding="utf-8"))
SHOTS = os.path.join(unreal.Paths.project_saved_dir(), "Screenshots")
ORIGEN = unreal.Vector(0, 0, 40)
report = {"engine": str(unreal.SystemLibrary.get_engine_version()), "items": [], "errores": [], "ok": False}
st = {"fase": "arranque", "t": time.time(), "i": -1, "handle": None, "world": None, "vivos": [], "inicio": time.time()}


def pngs():
    return {os.path.join(r, f) for r, _, fs in os.walk(SHOTS) for f in fs if f.lower().endswith(".png")} if os.path.isdir(SHOTS) else set()


def mundo():
    for w in unreal.ObjectIterator(unreal.World):
        try:
            if unreal.GameplayStatics.get_player_controller(w, 0):
                return w
        except Exception:  # noqa: BLE001
            continue
    return None


def consola(cmd):
    unreal.SystemLibrary.execute_console_command(st["world"], cmd)


def esfera():
    actores = unreal.GameplayStatics.get_all_actors_with_tag(st["world"], "FastVfxEsfera")
    return actores[0] if actores else None


def lanzar(item, edad=None):
    sistema = unreal.load_asset(item["asset"])  # en -game, EditorAssetLibrary dentro de un tick cierra el juego (Herbalist H6.4)
    comp = unreal.NiagaraFunctionLibrary.spawn_system_at_location(st["world"], sistema, ORIGEN, unreal.Rotator(0, 0, 0),
                                                                   unreal.Vector(1, 1, 1), False, True, unreal.NCPoolMethod.NONE, False)
    for k, v in (item.get("usuario") or {}).items():
        if isinstance(v, int) and not isinstance(v, bool):
            comp.set_variable_int(k, v)
        elif isinstance(v, (int, float)):
            comp.set_variable_float(k, float(v))
        elif isinstance(v, list):
            comp.set_variable_linear_color(k, unreal.LinearColor(*v))
    if edad is not None:
        comp.set_age_update_mode(unreal.NiagaraAgeUpdateMode.DESIRED_AGE)
        comp.set_seek_delta(1.0 / 60)
        comp.set_desired_age(float(edad))
    return comp


def limpiar():
    for c in st["vivos"]:
        try:
            c.destroy_component(c)
        except Exception:  # noqa: BLE001
            pass
    st["vivos"] = []


def terminar():
    report["ms_total"] = round((time.time() - st["inicio"]) * 1000)
    report["ok"] = not report["errores"] and all(i.get("png") for i in report["items"])
    with open(REPORT, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    unreal.log(f"NOMOS_FASTVFX_PREVIEW ok={report['ok']} items={len(report['items'])}")
    if st["handle"] is not None:
        unreal.unregister_slate_post_tick_callback(st["handle"])
        st["handle"] = None
    consola("quit")


def siguiente():
    limpiar()
    st["i"] += 1
    if st["i"] >= len(JOB["items"]):
        return terminar()
    item = JOB["items"][st["i"]]
    bola = esfera()
    if item["tipo"] == "niagara":
        if bola:
            bola.set_actor_hidden_in_game(True)
        st["vivos"].append(lanzar(item, item.get("frame", 0.3)))
    else:
        if not bola:
            report["errores"].append("El nivel de preview no tiene la esfera FastVfxEsfera")
            return terminar()
        bola.set_actor_hidden_in_game(False)
        bola.static_mesh_component.set_material(0, unreal.load_asset(item["asset"]))
    st.update(fase="esperar", t=time.time(), item=item, t_item=time.time())


def tick(_dt):
    try:
        ahora = time.time()
        if st["fase"] == "arranque":
            st["world"] = mundo()
            if st["world"] is None:
                if ahora - st["t"] > 60:
                    report["errores"].append("El juego no arrancó en 60 s")
                    terminar()
                return
            report["ms_arranque_juego"] = round((ahora - st["inicio"]) * 1000)
            consola("r.MotionBlurQuality 0")
            pawn = unreal.GameplayStatics.get_player_pawn(st["world"], 0)
            if pawn:
                pawn.set_actor_hidden_in_game(True)  # el DefaultPawn es una esfera gris en el origen
            bola = esfera()
            # calentar: todo a la vez para que se compilen las permutaciones que falten
            for item in JOB["items"]:
                if item["tipo"] == "niagara":
                    st["vivos"].append(lanzar(item))
                elif bola:
                    bola.static_mesh_component.set_material(0, unreal.load_asset(item["asset"]))
            st.update(fase="calentar", t=ahora)
        elif st["fase"] == "calentar" and ahora - st["t"] >= float(JOB.get("calentar", 6)):
            report["ms_calentar"] = round((ahora - st["t"]) * 1000)
            siguiente()
        elif st["fase"] == "esperar":
            item = st["item"]
            espera = float(item.get("frame", 0.3)) if item["tipo"] == "material" else 0.4
            if ahora - st["t"] >= max(espera, 0.4):
                st.update(antes=pngs(), fase="disparo", t=ahora)
                consola("Shot")
        elif st["fase"] == "disparo":
            nuevos = sorted(pngs() - st["antes"], key=os.path.getmtime)
            if nuevos and os.path.getsize(nuevos[-1]) > 0 and ahora - os.path.getmtime(nuevos[-1]) > 0.3:
                destino = st["item"]["png"]
                os.makedirs(os.path.dirname(destino), exist_ok=True)
                shutil.move(nuevos[-1], destino)
                report["items"].append({"asset": st["item"]["asset"], "png": destino, "frame": st["item"].get("frame"),
                                        "ms_item": round((ahora - st["t_item"]) * 1000),
                                        "ms_desde_inicio": round((ahora - st["inicio"]) * 1000)})
                siguiente()
            elif ahora - st["t"] > 20:
                report["errores"].append(f"La captura de {st['item']['asset']} no se escribió en 20 s")
                report["items"].append({"asset": st["item"]["asset"], "png": None})
                siguiente()
    except Exception as e:  # noqa: BLE001
        report["errores"].append(f"{type(e).__name__}: {e}")
        terminar()


st["handle"] = unreal.register_slate_post_tick_callback(tick)
