# Kratos · Hito 6 «integración y cierre» · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> Se refina antes de despachar con los hitos 0-5 en `main`.

**Goal:** Que DONE signifique lo que dice el plan: cambios en commits recuperables integrados en la rama objetivo y recomprobados, criterios y pruebas satisfechos, conversación, autores, commits y artefactos preservados fuera del worktree, procesos detenidos y worktrees temporales retirados sin forzar; y que «pídele al responsable que ajuste esto» después de DONE cree una continuación con el contexto y la atribución anteriores.

**Architecture:** Un rol integrador (run del servicio, no de un modelo) ejecuta `integrate_task`: rebase o merge del worktree sobre la rama objetivo, recomprobación de las comprobaciones afectadas si la base cambió, commit de integración; `finalize_task` verifica las siete condiciones de cierre (plan v1 §6), preserva (`.kratos/archive/<task>/` con transcripción, eventos, diff final, informes, referencias de sesión) y retira el worktree por Orca sin `--force`; `Cerrando` es un estado visible con motivo de fallo recuperable. Las continuaciones reabren con `parent_task_id` y reutilizan la sesión del proveedor cuando es posible (Orca `terminal send` si el terminal sigue vivo) o entregan el historial útil a una nueva.

**Tech Stack:** Git (merge `--no-ff` en el worktree de integración, `rebase` opcional por config), Orca `worktree rm` sin `--force`, el ejecutor de comprobaciones del hito 5, la bandeja del hito 1b.

**Spec:** `docs/plan-v2.md` hito 6 de §6, pruebas 10-13 y 14 parcial del plan v1 §13 (10 integración detecta cambios en destino; 11 fallo al preservar impide retirar; 12 DONE elimina workspace sin perder datos; 13 continuación con contexto); plan v1 §6 (cierre y «pedir cambios después de DONE») y §10 (`integrate_task`, `finalize_task`).

## Global Constraints

- Nunca `git worktree remove --force` ni `orca worktree rm --force` para ocultar cambios pendientes: si el worktree tiene cambios sin registrar, `Cerrando` falla con la lista y Decisión («Descartar», «Commitear al run», «Esperar»).
- Un workspace de integración por proyecto (`.kratos/integration/<proyecto>`), con su propio ciclo; nunca se retira con la tarea.
- Si la rama objetivo cambió desde la base del worktree, se vuelve a ejecutar `selectChecks` sobre el diff integrado antes de aprobar (prueba 10).
- Preservación antes que retirada: la carpeta de archivo se escribe y se verifica (recuento de archivos y hash) antes del `rm` (prueba 11).
- Las tareas puramente remotas (Meshy sin código) cierran sin worktree.
- Atribución: `implementó`, `revisó`, `generó`, `integró`, `verificó` se guardan por run en `task.attribution` (JSON) y se muestran en el Drawer.

## Review Focus

1. Conflicto de merge en un `.uasset` (binario): la integración no intenta resolver; abre Decisión con las dos versiones y quién las tocó. (Tarea 1.)
2. El terminal del worker murió antes de la continuación: `worker.send` falla → se arranca un run nuevo con el historial útil (`.kratos/archive/<task>/resumen.md` + diff) y `attempt + 1`, misma tarea, misma atribución previa. (Tarea 3.)
3. Un proceso hijo del worker sigue vivo (p. ej. un `node` de pruebas): `finalize_task` lo detecta por el árbol de procesos del terminal de Orca y lo detiene antes de retirar; si no puede, `Cerrando` con motivo. (Tarea 2.)
4. Disco lleno al preservar: el fallo se registra, el worktree no se toca, la tarjeta dice «No se pudo preservar: espacio insuficiente». (Tarea 2.)
5. Dos tareas integran casi a la vez sobre la misma rama: la integración es una cola (reserva `integration:<proyecto>`), la segunda rebasa sobre el resultado de la primera. (Tarea 1.)

---

### Task 1: Integrador
**Interfaces:** `integrate.run {taskId, runId, targetBranch}`: reserva `integration:<proyecto>`; en el workspace de integración `fetch` del worktree, `merge --no-ff` (o `rebase` por config); conflicto en texto → Decisión con el `diff3`; en binario → Decisión (Review Focus 1); si la base cambió → `checks.run` de `selectChecks(diffIntegrado)`; éxito → commit de integración, `moveTask(cerrando)`, evento `integration.completed`. Pruebas con repos temporales (conflicto texto, binario, base cambiada, cola). Commit.

### Task 2: Finalizador
**Interfaces:** `finalize.run {taskId}`: comprueba las siete condiciones (commits recuperables y revisión de la versión final; criterios y pruebas; integrado; comprobaciones sobre el integrado; preservación; procesos detenidos; worktrees limpios) y devuelve la primera que falla con motivo; preserva en `.kratos/archive/<task>/` (`conversacion.jsonl`, `eventos.jsonl`, `diff-final.patch`, `informes/`, `sesiones.json`, `resumen.md`), verifica, detiene procesos (Review Focus 3), `orca worktree rm` sin force, `moveTask(done)`, evento `task.done`. Pruebas: cambios sin registrar → `Cerrando` con lista; Review Focus 3 y 4; tarea remota sin worktree cierra. Commit.

### Task 3: Continuación después de DONE
**Interfaces:** `POST /tasks/:id/continue {text}` → crea tarea hija (`parent_task_id`, copia de atribución), worktree nuevo sobre la versión integrada vigente, y o bien `worker.send` al terminal vivo del responsable original o un run nuevo con `resumen.md` + diff como contexto (Review Focus 2). Botón «Pedir cambios al responsable» funciona también en tarjetas `done`. Pruebas con `orca` falso (terminal vivo / muerto). Commit.

### Task 4: Skill, panel y aceptación
- [ ] `SKILL.md` sección «Cerrar»: Kratos pide integración cuando `probando passed` y revisión aprobada (`kratos task integrate`), pide cierre (`kratos task finalize`) y nunca concede DONE él mismo; `/kratos pausar|reanudar` (detiene despachos nuevos, mantiene escucha; ahora sí hay despachos que pausar). Panel: columnas Cerrando con motivo y acción, Drawer con atribución por rol, archivo consultable (`GET /tasks/:id/archive`).
- [ ] Aceptación en `KratosFabTest`: tarea completa hasta DONE; comprobar `orca worktree list` sin el temporal, `.kratos/archive/<task>/` completo, Drawer con historial; «ajusta esto» sobre la tarea DONE → continuación. Pruebas 10-13 del plan v1 y 20 del v2. `docs/aceptacion-hito6.md`; commit.

## Self-review
- Cobertura: plan v1 §6 (siete condiciones, Cerrando, continuación) → Tareas 2-3; §10 `integrate_task`/`finalize_task` → Tareas 1-2; hito 6 criterios → Tarea 4; pruebas 10-13, 20.
- Review Focus 1, 5 → Tarea 1; 2 → Tarea 3; 3, 4 → Tarea 2.
