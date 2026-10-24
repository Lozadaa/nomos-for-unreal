"""Nomos · prendas, pelo y cara de un personaje siguiendo al cuerpo durante la captura (Review Focus 10 del hito 5b).
Lo importa nomos_anim_capture.py dentro del juego.
"""
import unreal

# cadera: el hueso pelvis (si mide ~0 es que el retarget no le da movimiento: Review Focus 10)
HIPS = "pelvis"
BONES = (HIPS, "head", "foot_l", "foot_r", "hand_l", "hand_r")


def followers(actor, body):
    """Review Focus 10: prendas, pelo y cara siguen al cuerpo. Las prendas (sin AnimInstance propia) van con leader pose al
    cuerpo y sin tela: la tela Chaos del jersey de un MetaHuman se queda colgada como una tienda cuando el clip salta de pose
    en pose (visto en la sonda, 2026-10-24); con la tela desactivada la prenda va skinneada al cuerpo."""
    out = []
    for comp in actor.get_components_by_class(unreal.SkeletalMeshComponent):
        if comp == body:
            continue
        own = comp.get_anim_instance() is not None and comp.get_editor_property("leader_pose_component") is None
        if not own:
            comp.set_leader_pose_component(body, True)
        # en el juego, nada de set_editor_property: re-ejecuta el construction script y deja los componentes como TRASH_
        comp.set_cloth_max_distance_scale(0.0)  # la tela queda pegada a la malla skinneada (la desactiva nomos_character.py)
        comp.force_cloth_next_update_teleport_and_reset()
        leader = comp.get_editor_property("leader_pose_component")
        out.append({"name": comp.get_name(), "comp": comp, "leader": bool(leader) and leader == body, "anim": own, "centers": []})
    return out


def center(comp):
    origin = unreal.SystemLibrary.get_component_bounds(comp)[0]
    return [origin.x, origin.y, origin.z]


def follow_report(entries, body):
    """Cada componente: leader pose al cuerpo o AnimInstance propia, y su caja se mueve con la del cuerpo entre instantes."""
    moved = lambda pts: max((sum((a - b) ** 2 for a, b in zip(p, pts[0])) ** 0.5 for p in pts), default=0)
    body_move = moved(body)
    rows = []
    for f in entries:
        move = moved(f["centers"])
        follows = (f["leader"] or f["anim"]) and (body_move < 1 or move >= 0.1 * body_move)
        rows.append({"name": f["name"], "leader": f["leader"], "anim": f["anim"], "cloth": "desactivada en el mapa" if f["comp"].get_editor_property("disable_cloth_simulation") else "pegada (distancia 0)",
                     "move_cm": round(move, 1), "body_move_cm": round(body_move, 1), "follows": follows})
    return rows


def stretch(body, actor, entries):
    """Review Focus 10 ampliado: malla estirada hacia la raíz. La pelvis del cuerpo por encima de 50 cm y el punto más bajo
    de cada prenda no más de 10 cm por debajo del punto más bajo del cuerpo (los pies)."""
    base = actor.get_actor_location().z
    pelvis = round(body.get_socket_location("pelvis").z - base, 1)
    low = lambda comp: (lambda o, e: o.z - e.z)(*unreal.SystemLibrary.get_component_bounds(comp)[:2])
    floor, errors = low(body), []
    if pelvis <= 50:
        errors.append(f"malla estirada hacia la raíz: pelvis a {pelvis} cm")
    for f in entries:
        drop = round(floor - low(f["comp"]), 1)
        if drop > 10:
            errors.append(f"malla estirada hacia la raíz: {f['name']} baja {drop} cm por debajo del cuerpo")
    return {"pelvis_cm": pelvis, "errors": errors}


def pose(comp, actor, rest):
    """Altura de cada hueso de BONES dividida por la de la cadera en reposo (independiente de la estatura)."""
    if not rest:
        return None
    base = actor.get_actor_location().z
    return {b: round((comp.get_socket_location(b).z - base) / rest, 3) for b in BONES}
