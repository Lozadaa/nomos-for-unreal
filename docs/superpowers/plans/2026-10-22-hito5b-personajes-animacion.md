# Kratos · Hito 5b «personajes y animación» · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> Se refina antes de despachar con el editor administrado del hito 5 funcionando y el adaptador de Meshy del hito 4 probado.

**Goal:** Que una petición como «un héroe de hielo con animación de ataque» produzca un personaje riggeado y animado reproducido en PIE con captura, eligiendo entre Meshy (criaturas y objetos), MetaHuman (humanos realistas, ya en tu motor 5.8.3) y assets del catálogo, y que el retargeting a los esqueletos del proyecto quede verificado.

**Architecture:** Dos rutas sobre la infraestructura existente: Meshy (`meshy_rig`, `meshy_animate`, text-to-motion) como trabajos externos con presupuesto que terminan en FBX/GLB importados por el editor administrado y retargeteados con IK Retargeter por script; MetaHuman por el toolset `MetaHumanGenerator` del motor (create, set_body_shape, set_skin_tone, set_eye_color, finalize) a través del MCP, con la Python API de `MetaHumanCharacterEditorSubsystem` solo para lo que el toolset no cubra (esculpir, conformar, auto-rig). Las alternativas creativas (candidatos) se presentan como Decisión con miniaturas (plan v2 §5.3).

**Tech Stack:** Lo de los hitos 4 y 5; skills `ue-animation-system`, `rigging`, `animation`, `hair-groom`, `cloth-sim`, `character-artist`, `creature-artist`; Game Animation Sample como base de locomoción; Mixamo solo por archivos exportados a mano (Decisión «Exporta de Mixamo y deja el FBX en …»).

**Spec:** `docs/plan-v2.md` §3.5, §4 (fila «Personaje y animación»), hito 5b de §6, prueba 30 de §7.

## Global Constraints

- MetaHuman solo si Capacidades marca el plugin y el toolset disponibles (en este equipo: 5.8.3, disponibles); con motor < 5.8, ausente y ninguna tarea lo promete (prueba 30).
- Partes del flujo MetaHuman dependen de servicios en la nube de Epic (auto-rig, texturas): se registran como pasos externos con tiempo máximo y Decisión si fallan; gap conocido en 5.8.0 (`RemoveBodyRig` no expuesto): comprobar en 5.8.3 en la primera tarea.
- Todo clip Meshy pasa por presupuesto (créditos por clip); `ai_forbidden` del catálogo bloquea usar ese asset como referencia de imagen.
- Verificación obligatoria: personaje cargado en PIE con la animación reproduciéndose, captura por resolución y comprobación de deformaciones básicas (bounding box estable, sin huesos a escala 0) por script.

## Review Focus

1. Esqueleto de Meshy incompatible con el del proyecto: el retarget por script debe producir un informe con los huesos sin mapear y abrir Decisión, no una animación rota aprobada. (Tarea 2.)
2. MetaHuman auto-rig en la nube tarda más de 10 min: el job queda `esperando_externo` con reintento, la tarea no se bloquea sola. (Tarea 3.)
3. Tres candidatos de personaje presentados: la Decisión lleva miniatura, origen, licencia y coste de cada uno; elegir uno cancela los otros jobs si estaban en preview. (Tarea 1.)
4. Clip de 10 s pedido con presupuesto para 3 s: Decisión antes de generar, con el coste exacto. (Tarea 2.)
5. Personaje importado sin materiales (texturas vencidas en Meshy): la verificación falla con «sin texturas» y la copia propia se usa si existe. (Tarea 2.)

---

### Task 1: Candidatos como Decisión
**Interfaces:** `asset.candidates {taskId, query, kinds: ['catalog','meshy_preview','metahuman_preset']}` → hasta 3 por tipo, Decisión con miniaturas (catálogo: `thumbnail_path`; Meshy: preview de bajo coste; MetaHuman: presets de Megascans Library ya indexados); elegir → encola la ruta correspondiente. Pruebas con MCP falso. Commit.

### Task 2: Ruta Meshy → rig → animación → retarget
**Interfaces:** `character.meshy {taskId, source: entryId|prompt, animations: [{prompt, seconds}]}`: `meshy_rig` → `meshy_animate`/text-to-motion → descarga a `.kratos/artifacts` → `importFile` → `kratos_retarget.py` (IK Retargeter al esqueleto declarado en `.kratos/config.json: targetSkeleton`, informe de huesos) → `kratos_play_anim.py` (PIE con la animación, captura, comprobación de deformación) → `TestRun animation`. Pruebas: Review Focus 1, 4, 5. Commit.

### Task 3: Ruta MetaHuman
**Interfaces:** `character.metahuman {taskId, preset?, body, skin, eyes, name}` por `callTool` del toolset `MetaHumanGenerator` (`create`, `set_*`, `finalize`); auto-rig y ensamblado por `MetaHumanCharacterEditorSubsystem` en `kratos_metahuman.py` con tiempo máximo y estado `esperando_externo` (Review Focus 2); verificación como en Tarea 2. Prueba real una vez en `KratosFabTest` con un preset. Commit.

### Task 4: Skill y aceptación
- [ ] `SKILL.md` sección «Personajes»: cuándo catálogo, Meshy o MetaHuman; siempre candidatos primero; eval `09-heroe-de-hielo.md`.
- [ ] Aceptación: «Un héroe de hielo con animación de ataque» → candidatos → Meshy → rig → clip → retarget → PIE con captura; «Un guardia humano de 50 años» → MetaHuman por toolset → PIE. `docs/aceptacion-hito5b.md`; commit.

## Self-review
- Cobertura: §3.5 completa salvo DeepMotion/Cascadeur/Rokoko (fuera de v1 por §9 del plan v2); fila de §4 → brief con `ue-animation-system`, `rigging`; prueba 30 → Global Constraints y Capacidades.
- Review Focus 1, 4, 5 → Tarea 2; 2 → Tarea 3; 3 → Tarea 1.
