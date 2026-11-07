"""Nomos · lo que hay en una captura, en JSON, para que el revisor razone posiciones sin abrir otra sonda.

`escena(world, png)` escribe `<png>.json` con la cámara del jugador, el pawn y hasta MAX actores que caen dentro de
la imagen (nombre, clase, posición en el mundo en cm, tamaño, altura de la base, distancia a la cámara y píxel en la captura). Se llama con el juego
pausado, justo antes de capturar, así que la pose es la de la imagen. Idea de per-simmons/unreal-agent-harness (capturas
anotadas con XYZ); el código es propio.
"""
import json, unreal

MAX = 40
# lo que no es «algo que se ve»: controladores, managers, volúmenes de postproceso, etc.
SKIP = ("Controller", "Manager", "GameMode", "GameState", "PlayerState", "HUD", "Info", "Volume", "Brush", "Note",
        "WorldSettings", "LevelScriptActor", "AbstractNavData", "NavigationData", "ParticleEventManager",
        "Debug", "Replicator")  # ChaosDebugDrawActor y GameplayDebuggerCategoryReplicator salen en -game (UE 5.8.3)


def _v(v):
    return [round(v.x, 1), round(v.y, 1), round(v.z, 1)]


def _screen(controller, location):
    """Píxel de un punto del mundo en el viewport, o None si queda detrás de la cámara. La firma Python de
    project_world_to_screen devuelve el Vector2D o (bool, Vector2D) según la versión: se aceptan las dos."""
    out = unreal.GameplayStatics.project_world_to_screen(controller, location, False)
    if isinstance(out, tuple):
        ok, point = (out[0], out[1]) if len(out) > 1 else (True, out[0])
        if not ok:
            return None
        out = point
    return None if out is None else [round(out.x), round(out.y)]


def _hidden(actor):
    """Oculto en el juego. Probado en UE 5.8.3 -game: los actores no exponen `get_actor_hidden_in_game` a Python; la
    propiedad `hidden` (bHidden) sí se lee con get_editor_property."""
    for read in (lambda: actor.is_hidden(), lambda: actor.get_editor_property("hidden")):
        try:
            return bool(read())
        except Exception:  # noqa: BLE001
            continue
    return False


def escena(world, png):
    try:
        controller = unreal.GameplayStatics.get_player_controller(world, 0)
        manager = unreal.GameplayStatics.get_player_camera_manager(world, 0)
        cam = manager.get_camera_location()
        size = controller.get_viewport_size() if hasattr(controller, "get_viewport_size") else None
        width, height = (size[0], size[1]) if isinstance(size, tuple) and len(size) >= 2 else (0, 0)
        pawn = unreal.GameplayStatics.get_player_pawn(world, 0)
        data = {"camara": {"pos": _v(cam), "rot": [round(r, 1) for r in (manager.get_camera_rotation().pitch, manager.get_camera_rotation().yaw,
                                                                          manager.get_camera_rotation().roll)],
                           "fov": round(manager.get_fov_angle(), 1)},
                "imagen": [width, height],
                "pawn": {"clase": pawn.get_class().get_name(), "pos": _v(pawn.get_actor_location())} if pawn else None,
                "actores": []}
        seen = []
        for actor in unreal.GameplayStatics.get_all_actors_of_class(world, unreal.Actor):
            cls = actor.get_class().get_name()
            if actor == pawn:
                continue
            if any(word in cls for word in SKIP) or _hidden(actor):
                continue
            pos = actor.get_actor_location()
            pixel = _screen(controller, pos)
            if pixel is None or (width and not (0 <= pixel[0] <= width and 0 <= pixel[1] <= height)):
                continue
            item = {"nombre": actor.get_name(), "clase": cls, "pos": _v(pos), "dist": round((pos - cam).length()), "px": pixel}
            # tamaño y altura de la base (cm): con ellos el revisor ve escalas ×100 y objetos flotando sin abrir el editor
            try:
                origin, extent = actor.get_actor_bounds(False)
                if not (extent.x or extent.y or extent.z):
                    continue  # sin geometría (ChaosDebugDrawActor es un Actor a secas): no es algo que se vea
                item.update(tam=[round(2 * extent.x), round(2 * extent.y), round(2 * extent.z)], base_z=round(origin.z - extent.z, 1))
            except Exception:  # noqa: BLE001
                pass
            seen.append(item)
        seen.sort(key=lambda a: a["dist"])
        data["actores"] = seen[:MAX]
        if len(seen) > MAX:
            data["fuera"] = len(seen) - MAX
        path = png + ".json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        return path
    except Exception as e:  # noqa: BLE001  el JSON es una ayuda: si falla, la captura sigue
        # no va a `errors`: eso suspendería la comprobación por una ayuda; queda en el log y en el informe
        unreal.log_warning(f"NOMOS_ESCENA no se pudo escribir: {e}")
        return None
