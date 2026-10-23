# Kratos · Hito 6 «integración y cierre» · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Refinado 2026-10-23** con el código real de los hitos 0-4, 8 y 9 en `main` y los contratos del hito 5 (en curso: `checks.run`, `selectChecks`, guarda `probando → integrando`). Se despacha cuando el hito 5 esté en `main`; si algún nombre del hito 5 cambió, el implementador lo adapta y lo anota. Reglas del usuario: **ningún worker Codex**; hito 5b pausado.

**Goal:** Que DONE signifique lo que dice el plan: cambios en commits recuperables integrados en la rama objetivo y recomprobados, criterios y pruebas satisfechos, conversación, autores, commits y artefactos preservados fuera del worktree, procesos detenidos y worktrees temporales retirados sin forzar; y que «pídele al responsable que ajuste esto» después de DONE cree una continuación con el contexto y la atribución anteriores.

**Architecture:** Dos handlers de la bandeja que no ejecutan ningún modelo: `integrate.run` (merge `--no-ff` de la rama del worktree sobre la rama objetivo dentro de un **workspace de integración** por proyecto, recomprobación con `checks.run` si la base cambió, estado `cerrando`) y `finalize.run` (siete condiciones de cierre, preservación en `<dataDir>/archive/<taskId>/`, cierre del terminal y retirada del worktree por Orca sin `--force`, estado `done`). La continuación después de DONE crea una tarea hija con `parentTaskId` y atribución heredada, y reutiliza el terminal del responsable si sigue vivo o arranca un run nuevo con el resumen archivado. El planificador respeta `director.paused` (hoy la ruta existe pero el planificador no la consulta).

**Tech Stack:** Git por `adapters/git.ts` (ampliado con `merge`, `conflicts`, `abortMerge`, `worktreeAdd`), Orca por `adapters/orca.ts` (ampliado con `terminalClose`), bandeja y runner existentes, `checks.run` del hito 5, panel del hito 8-9.

**Spec:** `docs/plan-v2.md` hito 6 de §6; plan v1 §6 (cierre y «pedir cambios después de DONE»), §10 (`integrate_task`, `finalize_task`), pruebas 10-13 del plan v1 §13 y 20 del v2.

## Contratos reales que este plan usa (no reescribir)

- **Modelo**: `Task` ya tiene `parentTaskId`, `worktreeId`, `dependsOn`, `leases`, `scope`, `reviewApproved`, `waitReason`; `Worktree {taskId, path, branch, baseCommit, state: active|closing|closed, closedReason}`; `Run {taskId, role, provider, attempt, state, sessionRef, metadata}` con `metadata.worktreeId`, `metadata.cursor`, `metadata.lastLines`. Este hito añade por migración `tasks.attribution text not null default '{}'` y `tasks.archive_path text`.
- **Estados**: `moveTask(db, id, state, reason?)` en `repo/tasks.ts`; guardas: `cerrando → done` (existe), `probando → integrando` (hito 5). Este hito añade `integrando → cerrando` solo desde `integrate.run` y `cerrando → done` solo desde `finalize.run` (las dos con `reason`). `worker-poll.ts` mueve a `revisando` al terminar el implementador; `review-finish.ts` aprueba (`reviewApproved=1`). Los handlers de assets (`asset-migrate.ts`, `asset-download.ts`) hoy hacen `cerrando → done` directamente porque son tareas sin worktree: siguen así (son las «tareas puramente remotas»).
- **Reservas**: `acquire(db, runId, taskId, paths)` / `release(db, runId)`; `normalizedPaths` rechaza `:`, por lo que la cola de integración se reserva con **`integration/<NombreProyecto>`**.
- **Git** `adapters/git.ts`: `isRepo, currentBranch, excludeLocal, head, renameBranch, diff(dir, base) → {stat, patch}, log(dir, base)`; `run(dir, args)` interno. Se añaden `merge(dir, branch, {noFf: true}) → {ok, conflicts: string[]}`, `conflictKinds(dir) → {text: string[], binary: string[]}` (por `git diff --numstat` con `-` en binarios), `abortMerge(dir)`, `worktreeAdd(repoDir, path, branch)`, `worktreeRemove(repoDir, path)` (sin `--force`; falla si hay cambios), `status(dir) → {clean: boolean, files: string[]}`.
- **Orca** `adapters/orca.ts`: `repoAdd, worktreeCreate, terminalWaitIdle, terminalIsIdle, terminalSend, terminalRead, worktreeRemove(worktreeId, force=false)`; `tests/fakes/orca.ts` con modo claude. Se añade `terminalClose(handle)` (CLI `orca terminal close --terminal <h> --json`) y `terminalAlive(handle)` (un `terminalRead` que falla = muerto).
- **Bandeja y runner**: `enqueue`, handlers que devuelven `{deferred, reason}` para esperar; `commandRun(ctx, command, {...})` de `handlers/asset-run.ts` para crear el run de una orden sin modelo (`provider: 'kratos'`, `role: 'integrador'`); `createXHandlers()` combinados en `server.ts`.
- **Comprobaciones (hito 5)**: `checks.run {taskId, runId, files?}` y `selectChecks(files)`; `TestRun` por `recordTestRun`.
- **Director**: `POST /director/pause|resume` escribe `director.paused` y emite `director.paused|resumed`; `scheduler.tick` **no lo consulta todavía**.
- **Eventos del worker**: `worker.output` (líneas), `worker.message_sent`, `worker.waiting`, `run.*`, `task.*`, `lease.*`, `review.*`, `test.*`, `command.*`; `GET /runs/:id/output?since=` devuelve la salida; los eventos viven en la tabla `events` (cursor `seq`).
- **Skill y CLI**: `skills/kratos/scripts/kratos.ts` con `task create|show|review`, `worker start|send|stop`, `run diff|output`, `decision list|open|resolve`, `asset …`; `SKILL.md` secciones «Dirigir», «Repartir», «Assets» (y «Pruebas y UI» del hito 5).
- **Panel**: `Produccion.tsx` agrupa por estado con `StageStepper`; `TaskSheet.tsx` + `TaskTabs.tsx` (Resumen, Chat, Cambios, Pruebas, Assets, Línea de tiempo); el botón «Pedir cambios al responsable» existe en la pestaña Chat y llama `POST /runs/:id/message`.

## Global Constraints

- Nunca `git worktree remove --force` ni `orca worktree rm --force` para ocultar cambios pendientes: si el worktree tiene cambios sin registrar, `cerrando` falla con la lista y Decisión («Descartar», «Commitear al run», «Esperar»); «Descartar» es la única vía al `--force` y queda registrada con quién la eligió.
- Un workspace de integración por proyecto: `<dataDir>/integration/<NombreProyecto>` es un `git worktree` del repo del juego sobre la rama objetivo (`config.json: targetBranch`, defecto la rama actual del juego al arrancar el servicio); nunca se retira con la tarea; reserva `integration/<proyecto>` para serializar integraciones.
- Si la rama objetivo cambió desde `worktree.baseCommit`, se vuelve a ejecutar `checks.run` con `selectChecks(diff integrado)` antes de `cerrando` (prueba 10); si una comprobación obligatoria falla, la tarea vuelve a `probando` con motivo y evento.
- Preservación antes que retirada: la carpeta de archivo se escribe y se verifica (recuento de archivos y hash SHA-256 por archivo en `manifest.json`) antes del `rm` (prueba 11).
- Las tareas sin worktree (assets remotos) cierran por el mismo `finalize.run` saltando las condiciones de worktree.
- Atribución: `implemento`, `reviso`, `genero`, `integro`, `verifico` → `task.attribution = {rol: [{runId, provider, agentName, at}]}`; el panel la muestra con los avatares del hito 9.
- Lo demás, como los hitos anteriores: cero dependencias npm en el servicio; TypeScript borrable; archivos de ≤ 200 líneas; `127.0.0.1` y token; copy en español; LF; `npm test`, `npm run test:panel`, `npm run build` y Playwright en verde por commit; sin push ni merge; `.kratos-brief.md` fuera de los commits.

## Review Focus

1. Conflicto de merge en un `.uasset` (binario): la integración no intenta resolver; `abortMerge`, Decisión con los archivos, las dos versiones (sha del lado de cada rama) y quién las tocó (atribución de la otra tarea si la hay). (Tarea 1.)
2. El terminal del worker murió antes de la continuación: `terminalAlive` falso → run nuevo con `resumen.md` + `diff-final.patch` como contexto en el brief, `attempt + 1`, misma tarea hija, atribución heredada. (Tarea 3.)
3. Un proceso hijo del worker sigue vivo (p. ej. un `node` de pruebas): `finalize.run` cierra el terminal por Orca (`terminalClose`, que mata el árbol del shell) y luego comprueba que `git worktree remove` sin `--force` tiene éxito; si el sistema de archivos sigue bloqueado (`EBUSY`), `cerrando` con motivo «archivos en uso» y reintento diferido a 30 s hasta 5 veces. (Tarea 2.)
4. Disco lleno al preservar (`ENOSPC`): el fallo se registra, el worktree no se toca, la tarjeta dice «No se pudo preservar: espacio insuficiente», y el archivo parcial se borra. (Tarea 2.)
5. Dos tareas integran casi a la vez sobre la misma rama: la segunda espera por la reserva `integration/<proyecto>` (`deferred`) y al entrar encuentra la base cambiada → recomprobación. (Tarea 1.)
6. Director pausado: el planificador no encola `worker.start` nuevos, las integraciones y cierres en curso terminan, y Capacidades/franja muestran «Pausado». (Tarea 4.)

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `service/src/adapters/git.ts` (ampliar) | `merge`, `conflictKinds`, `abortMerge`, `worktreeAdd`, `worktreeRemove`, `status` |
| `service/src/adapters/orca.ts` (ampliar), `tests/fakes/orca.ts` (ampliar) | `terminalClose`, `terminalAlive` |
| `service/src/integration/workspace.ts` | `integrationWorkspace(ctx, project) → {dir, branch}` (crea el worktree de integración si falta) |
| `service/src/handlers/integrate.ts` | `integrate.run` |
| `service/src/handlers/finalize.ts`, `service/src/archive.ts` | `finalize.run`; `preserveTask(ctx, task) → {dir, manifest}` |
| `service/src/handlers/continue.ts` | `task.continue` |
| `service/src/handlers/closing.ts` | `createClosingHandlers()` = integrate + finalize + continue |
| `service/src/attribution.ts` | `attribute(db, taskId, role, run)` y lectura |
| `service/src/scheduler.ts` (ampliar) | respeta `director.paused` |
| `service/src/repo/tasks.ts` (ampliar), `migrations.ts` (`migrateClosing`) | guardas `integrando → cerrando`, `cerrando → done`; columnas `attribution`, `archive_path` |
| `service/src/routes/tasks.ts` (ampliar) | `POST /tasks/:id/integrate`, `POST /tasks/:id/finalize`, `POST /tasks/:id/continue`, `GET /tasks/:id/archive` (índice) y `GET /tasks/:id/archive/:file` |
| `service/src/routes/commands.ts` (ampliar) | validadores `integrate.run`, `finalize.run`, `task.continue` |
| `skills/kratos/scripts/kratos.ts`, `SKILL.md` («Cerrar»), `references/cierre.md`, `evals/10-cierre.md`, `11-continuacion.md` | `task integrate|finalize|continue`, `pausar|reanudar` |
| `panel/src/views/Produccion.tsx`, `TaskSheet.tsx`, `TaskTabs.tsx`, `shell/Header.tsx` | Grupo «Cerrando» con motivo y acción; atribución con avatares; pestaña Archivo; «Pedir cambios» en tareas `done`; «Pausado» |
| `tests/service/{git-merge,integrate,finalize,archive,continue,scheduler-paused}.test.ts` | Pruebas con repos Git temporales y el Orca falso |

---

### Task 1: Integrador

**Files:** Modify `service/src/adapters/git.ts`; Create `service/src/integration/workspace.ts`, `service/src/handlers/integrate.ts`, `service/src/handlers/closing.ts`; Modify `service/src/repo/tasks.ts`, `migrations.ts`, `routes/tasks.ts`, `routes/commands.ts`, `server.ts`; Test `tests/service/{git-merge,integrate}.test.ts`.

**Interfaces:**
- `git.merge(dir, branch, {noFf: true}) → {ok: true, commit} | {ok: false, conflicts}`; `conflictKinds(dir)`; `abortMerge(dir)`; `worktreeAdd(repoDir, path, branch)`; `status(dir)`.
- `integrationWorkspace(ctx, project)`: `<dataDir>/integration/<name>`; si no existe, `git worktree add <path> <targetBranch>`; si existe, `git checkout <targetBranch>` + `git merge --ff-only` del repo principal si procede. Nunca se borra.
- `integrate.run {taskId, runId}`: exige `task.state === 'integrando'` y `reviewApproved === 1`; run de la orden con `commandRun(ctx, cmd, {title: 'Integrar <título>', provider: 'kratos', role: 'integrador'})` reutilizando `task` (no crea tarea nueva: `commandRun` admite `taskId` explícito, añadir esa opción); reserva `integration/<proyecto>` (`deferred` si ocupada; Review Focus 5); en el workspace: `fetch` implícito (mismo repo), `merge --no-ff <worktree.branch>`; conflicto en texto → `abortMerge` + Decisión «Resolver en el worktree / Descartar la integración» con el `diff3` de cada archivo; conflicto binario → `abortMerge` + Decisión (Review Focus 1); si `git.head(workspace)` antes del merge ≠ `worktree.baseCommit` → `enqueue('checks.run', {taskId, runId, files: diff integrado})` y espera (`deferred` hasta `test.*` final; si falla, `moveTask(probando)` con motivo); éxito → evento `integration.completed {commit}`, `attribute(db, task, 'integro', run)`, `moveTask(cerrando, 'Integrado en <rama>@<commit>')`, `release`.
- Rutas: `POST /tasks/:id/integrate` encola con clave `integrate:<taskId>:<runId>`; validador en `POST /commands`.

- [ ] Pruebas con repos Git temporales (crear repo, rama de worktree con commits, rama objetivo): merge limpio; conflicto de texto → Decisión y `abortMerge` deja el workspace limpio; conflicto binario (archivo `.uasset` con bytes) → Decisión con shas; base cambiada → `checks.run` encolado; dos integraciones → la segunda `deferred`; estados y eventos.
- [ ] Commit `feat: integrador con workspace por proyecto`.

### Task 2: Finalizador

**Files:** Modify `service/src/adapters/orca.ts`, `tests/fakes/orca.ts`; Create `service/src/handlers/finalize.ts`, `service/src/archive.ts`, `service/src/attribution.ts`; Modify `service/src/repo/tasks.ts`, `routes/tasks.ts`; Test `tests/service/{finalize,archive}.test.ts`.

**Interfaces:**
- `finalize.run {taskId}`: exige `task.state === 'cerrando'`. Condiciones en orden, cada una con un motivo textual: (1) commits recuperables: `worktree.branch` existe en el repo y el commit de integración está en la rama objetivo; (2) criterios y revisión: `reviewApproved === 1` y último run implementador `done`; (3) integrado: evento `integration.completed` para la generación vigente; (4) comprobaciones sobre el integrado: últimos `TestRun` obligatorios `passed`; (5) preservación: `preserveTask`; (6) procesos: `terminalClose(run.sessionRef)` de todos los runs de la tarea con terminal; (7) worktree limpio: `git.status(worktree.path).clean` y `orca.worktreeRemove(worktreeId)` sin force (Review Focus 3). La primera que falla deja `task.state = 'cerrando'`, `waitReason = motivo`, evento `task.closing_blocked {condition, reason}` y, si es recuperable por el usuario (cambios sin registrar, archivos en uso), Decisión; `finalize.run` devuelve `{deferred, reason}` para «archivos en uso» (hasta 5 intentos de 30 s). Éxito → `attribute('verifico')`, `moveTask(done)`, `archive_path`, evento `task.done`, `worktree.state = 'closed'`.
- `preserveTask(ctx, task)`: `<dataDir>/archive/<taskId>/` con `conversacion.jsonl` (eventos `worker.output`, `worker.message_sent`, `worker.waiting`, `message.*` y `reply` de la tarea, en orden de `seq`), `eventos.jsonl` (todos los eventos con `taskId`), `diff-final.patch` (`git.diff(worktree, baseCommit)`), `informes/` (copias de los artefactos `report` y `screenshot` de la tarea), `sesiones.json` (runs con `sessionRef`, `metadata.worktreeId`, proveedor, nombre de agente), `resumen.md` (título, spec, criterios, runs por rol con atribución, commits `git.log`, pruebas), `manifest.json` (archivo → sha256 y tamaño). Escritura a `.tmp` y renombrado; verificación releyendo el manifest; `ENOSPC` → borrar `.tmp`, motivo «espacio insuficiente» (Review Focus 4).
- `attribution.ts`: `attribute(db, taskId, role, run)` añade `{runId, provider, agentName: agentName(run.role, task.area), at}` sin duplicar; `agentName` reproduce la regla del panel (`{Área} {Rol}`) en el servicio (función de ≤ 20 líneas; el panel sigue con la suya).
- Rutas: `POST /tasks/:id/finalize`; `GET /tasks/:id/archive` (lista de archivos del manifest) y `GET /tasks/:id/archive/:file` (servido como `/artifacts/:id/file`, solo dentro de la carpeta de archivo).

- [ ] Pruebas: cambios sin registrar → `cerrando` con lista y Decisión; terminal con proceso vivo (Orca falso que falla el `worktreeRemove` dos veces) → diferido y éxito al tercero; `ENOSPC` simulado (escritor inyectable) → sin archivo parcial y motivo; tarea sin worktree (asset) cierra; manifest verificado; `GET /tasks/:id/archive/..` → 400.
- [ ] Commit `feat: finalizador con preservación y retirada sin forzar`.

### Task 3: Continuación después de DONE

**Files:** Create `service/src/handlers/continue.ts`; Modify `service/src/routes/tasks.ts`, `routes/commands.ts`, `handlers/worker-start.ts` (contexto de continuación en el brief), `skills/kratos/references/brief-worker.md` (sección opcional «Continuación»); Test `tests/service/continue.test.ts`.

**Interfaces:**
- `POST /tasks/:id/continue {text}` (tarea `done`) → `task.continue {taskId, text}`: crea tarea hija (`parentTaskId`, `title: 'Ajuste: <título>'`, `spec` = texto + referencia al archivo, `acceptance` heredada, `area`, `scope`, `leases`, `attribution` copiada), estado `preparada`; si el run implementador original tiene `sessionRef` y `terminalAlive` → `worker.send` al terminal con el texto y `metadata.continuationOf`; si no → el planificador arranca un run nuevo (`attempt + 1`) cuyo brief incluye `resumen.md` y `diff-final.patch` del archivo (Review Focus 2). Evento `task.continued {parentTaskId, taskId, reused: boolean}`.
- Panel: «Pedir cambios al responsable» en la pestaña Chat de una tarea `done` llama a `POST /tasks/:id/continue` y abre la tarea hija con `withViewTransition`.

- [ ] Pruebas con el Orca falso: terminal vivo → `worker.send` y sin run nuevo; terminal muerto → run nuevo con contexto; atribución heredada; tarea no `done` → 409.
- [ ] Commit `feat: continuación después de DONE`.

### Task 4: Skill, panel, pausa y aceptación

**Files:** Modify `service/src/scheduler.ts`, `skills/kratos/scripts/kratos.ts`, `skills/kratos/SKILL.md`; Create `skills/kratos/references/cierre.md`, `skills/kratos/evals/{10-cierre,11-continuacion}.md`; Modify `panel/src/views/Produccion.tsx`, `TaskSheet.tsx`, `TaskTabs.tsx`, `shell/Header.tsx`; Create `docs/aceptacion-hito6.md`; Modify `docs/estado-entregas.md`; Test `tests/service/scheduler-paused.test.ts`, `panel/src/views/Cierre.test.tsx`.

- `scheduler.tick`: si `director.paused`, no encola `worker.start` (las tareas quedan `preparada` con `waitReason: 'Director en pausa'`); evento `scheduler.paused` una vez por pausa (Review Focus 6). `kratos pausar|reanudar` llama a las rutas; `/kratos pausar` en la skill.
- Skill `SKILL.md` sección «Cerrar» (≤ 12 líneas que remiten a `references/cierre.md`): tras `review.finished` aprobado y `probando` en verde, `kratos task integrate <id>`; ante `integration.completed`, `kratos task finalize <id>`; ante `task.closing_blocked`, leer el motivo y abrir/atender la Decisión; Kratos **nunca** concede DONE él mismo; «ajusta esto» sobre una tarea `done` → `kratos task continue <id> --file`.
- Panel: grupo «Cerrando» con el motivo (`waitReason`) y la acción que corresponde (Decisión en línea o «Reintentar cierre» → `POST /tasks/:id/finalize`, `useAction`); `TaskSheet` muestra la atribución por rol con `AgentAvatar` + nombre corto; pestaña «Archivo» (lista del manifest con enlaces; solo en `done`); franja del director muestra «Pausado» con el glifo `directorState/esperando` y el botón Reanudar (ya existe).
- Aceptación real en `KratosFabTest` con workers Claude: una tarea completa hasta `done` (implementación → revisión → pruebas → integración → cierre); comprobar `orca worktree list` sin el temporal, `<dataDir>/archive/<task>/` completo y verificado, pestaña Archivo; «ajusta esto» sobre la tarea `done` → continuación con el terminal vivo y, matando el terminal, con run nuevo; conflicto binario provocado con un `.uasset` tocado en la rama objetivo → Decisión; `/kratos pausar` detiene un arranque. Pruebas 10-13 del plan v1 y 20 del v2.
- [ ] `docs/aceptacion-hito6.md` con comandos, seqs y capturas en `docs/capturas-6/`; commit `docs: cierre del hito 6, integración y cierre`.

---

## Self-review

- Cobertura: plan v1 §6 (siete condiciones, Cerrando, continuación) → Tareas 2-3; §10 `integrate_task`/`finalize_task` → Tareas 1-2; hito 6 criterios → Tarea 4; pruebas 10-13, 20; la pausa del director (pendiente desde el hito 3) → Tarea 4.
- Review Focus 1, 5 → Tarea 1; 2 → Tarea 3; 3, 4 → Tarea 2; 6 → Tarea 4.
- Diferencias respecto a la versión anterior y por qué: reserva `integration/<proyecto>` por `normalizedPaths`; el integrador y el finalizador son runs `provider: 'kratos'` creados con `commandRun` en vez de un «rol integrador» nuevo; los procesos vivos se resuelven cerrando el terminal por Orca y comprobando `worktree remove` sin force, en lugar de recorrer árboles de procesos; la atribución usa la misma regla de nombres que el panel.
