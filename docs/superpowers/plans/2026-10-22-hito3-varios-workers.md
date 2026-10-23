# Kratos · Hito 3 «varios workers, dependencias, revisión y reservas» · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> Refinado el 2026-10-23 con el código real del hito 2 delante (rama `hito2-worker`). Las firmas de la sección «Contratos reales del hito 2» son las que existen; si al despachar este plan alguna cambió en `main`, se actualiza aquí primero.

**Goal:** Que Kratos reparta trabajo entre varios workers a la vez (Codex y Claude Code), respete dependencias entre tareas, pase cada resultado por un revisor distinto del implementador, y garantice exclusión sobre recursos compartidos de Unreal (`.uasset`, `.umap`, widgets, esqueletos) mediante reservas; y que cada worker arranque con las skills que su rol exige, visibles en Capacidades.

**Architecture:** Un planificador en el servicio (`scheduler.ts`), llamado por el ejecutor existente (`startRunner`) cada 5 s, decide qué tareas `preparada` pueden arrancar (dependencias satisfechas, reservas libres, concurrencia por proveedor) y encola `worker.start` con la misma `idempotency_key` que ya usa la ruta `/tasks/:id/worker`; el arranque de workers Claude Code reutiliza `workerStart` con un comando de lanzamiento por proveedor; el rol `revisor` es un run más sobre la misma tarea con brief de revisión y marcador `KRATOS_REVIEW`; las reservas (`leases`) se piden por ruta de asset en `workerStart` y se liberan en `run.finished`, `worker.stop` y `workerFailure`. El enrutado de skills por rol (plan v2 §4) se materializa en `skills.ts`, en el brief y en el campo `skills` del run.

**Tech Stack:** El del hito 2: Node ≥ 25 sin dependencias, `node:sqlite` con `migrations.ts`, `node:test`. Claude Code como worker por Orca: `worktreeCreate(repoId, name, 'claude')` y después `terminalSend(handle, 'claude --model sonnet --dangerously-skip-permissions')` (en este equipo Orca no lanza bien los agentes por sí mismo; el hito 2 ya hace lo equivalente con `codex --yolo --no-daemon`).

**Spec:** `docs/plan-v2.md` §4 (enrutado de skills por rol), plan v1 §7 (paralelismo específico de Unreal) y §10 (`request_review`, `control_run`), hito 3 de §6, pruebas 6 y 22 de §7, prueba 5 del plan v1 §13.

## Contratos reales del hito 2 (no se cambian aquí; se extienden)

- `service/src/adapters/orca.ts`: `createOrca(opts): Orca` con `repoAdd(path)`, `worktreeCreate(repoId, name, agent: 'codex'|'claude') → {worktreeId, path, branch, terminalHandle}`, `terminalWaitIdle(handle, timeoutMs)`, `terminalIsIdle(handle)`, `terminalSend(handle, text)`, `terminalRead(handle, cursor?) → TerminalPage {text, cursor, …}`, `worktreeRemove(worktreeId, force?)`; `OrcaError(code)`.
- `service/src/runner.ts`: `WorkerContext = {db, orca, git, dataDir, projectDir}`, `Handler = (command, context) => Promise<object|void>`, `startRunner(db, handlers, opts)`.
- `service/src/handlers/`: `createWorkerHandlers()` registra `worker.start|poll|send|stop`; `worker-start.ts` (`workerStart`), `worker-poll.ts` (`workerPoll`, marcadores `KRATOS_DONE`/`KRATOS_ASK` por `worker-markers.ts`: `streamMarkers`, `screenMarkers`), `worker-send.ts` (`workerSend`, `workerStop`), `worker-failure.ts` (`workerFailure(db, payload, cause)`), `worker-policy.ts` (`workerPolicy`, `decisionGate`, `normalizedPaths`), `worker-decisions.ts` (`dispatchGuard`, `dispatchBlocked`, `pauseForDecision`).
- `service/src/commands.ts`: `enqueue(db, type, payload, idempotencyKey, {notBefore?})`, `claim`, `complete`, `fail(db, id, error, {retry?})`; columna `not_before`.
- `service/src/brief.ts`: plantilla del encargo (`.kratos-brief.md`); `skills/kratos/references/brief-worker.md` y `ciclo-tarea.md`.
- `service/src/model.ts`: `Task` con `dependsOn: string[]`, `worktreeId`, `budgetId`, `scope: string[]`; `Run` con `skills: string[]` y `metadata: RunMetadata` (`phase`, `waiting`, `question`, `cursor`, `correctionCount`, `lastLines`, `uncertain`…); `repo/worker.ts`: `requireRun`, `updateRun`, `runTree`, `queuePoll`.
- Rutas: `POST /tasks/:id/spec`, `POST /tasks/:id/worker` (`idempotency_key = worker.start:<taskId>:<attempt>`), `GET /runs/:id`, `GET /runs/:id/output?since=`, `GET /runs/:id/diff`, `POST /runs/:id/message`, `POST /runs/:id/stop`. CLI del director en `cli-director.ts` (grupos `task`, `worker`, `run`, `decision`).
- Eventos ya emitidos: `task.created|spec|moved|blocked|activity`, `run.started|finished|output|diff`, `worker.start|poll|send|stop|output|output_gap|waiting|message_sent`, `command.failed|recovered`.
- `migrations.ts` existe: todo cambio de esquema de este hito va como migración nueva, nunca editando `schema.ts` del 1b.

## Global Constraints

- Un escritor por instancia de editor y una cola para importación, guardado, PIE y capturas (plan v1 §7): aún no hay editor (hito 5), pero las reservas ya cubren `Content/**/*.uasset|*.umap` y se reutilizan después.
- Concurrencia por defecto en `.kratos/config.json`: `{"codex": 2, "claude": 1}`; configurable; Capacidades la muestra.
- Las skills de cada rol son las de la tabla §4 del plan v2; el brief incluye la lista y «carga estas skills antes de empezar»; el worker confirma con `KRATOS_SKILLS ["…"]` en su primera salida; si falta alguna, evento `worker.skills_missing` sin bloquear.
- El revisor nunca es el mismo run; con dos proveedores disponibles, tampoco el mismo proveedor; si solo hay uno, run nuevo con brief de revisión y `same_provider: true` en el evento.
- Todo lo del hito 2 sigue: brief por archivo, `KRATOS_DONE`, idempotencia por `attempt`, Decisión al tercer ciclo, `workerPolicy` y `decisionGate` antes de cualquier arranque.
- Archivos ≤ 200 líneas, cero dependencias, LF, copy en español, `npm test` en verde por tarea, un commit por tarea, sin push ni merge.

## Review Focus

1. Dos tareas piden el mismo widget (`Content/UI/WBP_HUD.uasset`): la segunda no arranca y su tarjeta muestra «Esperando reserva: WBP_HUD (tarea X)». (Tarea 1.)
2. Una tarea depende de otra que se bloquea: la dependiente queda `preparada` con `wait_reason` «Depende de X (bloqueada)» y el planificador no la reencola en bucle (una evaluación por tick, sin comandos nuevos). (Tarea 2.)
3. El revisor aprueba una tarea sin comprobaciones declaradas: queda `revisando` con `review_approved = 1`, nunca `done`; con comprobaciones declaradas pasa a `probando` (las ejecuta el hito 5). (Tarea 3.)
4. Worker Claude que se queda pidiendo permiso («Do you want to», «Allow», «(y/n)»): el sondeo lo trata como `worker.waiting` con la línea. (Tarea 4.)
5. Cancelar un run (`POST /runs/:id/stop`) con reservas tomadas: se liberan y la tarea vuelve a `preparada` con nota. (Tarea 1.)

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `service/src/migrations/003-leases-scheduler.ts` (o el siguiente número libre) | Tabla `leases`, columnas `tasks.leases`, `tasks.review_approved`, `tasks.wait_reason` |
| `service/src/leases.ts` | `acquire`, `release`, `holders`, `listLeases`, `conflicts` |
| `service/src/scheduler.ts` | `plan`, `tick` |
| `service/src/handlers/worker-launch.ts` | Comando de lanzamiento por proveedor y detección de prompt de permiso |
| `service/src/handlers/review.ts` | `review.start`, `review.poll` con `KRATOS_REVIEW` |
| `service/src/skills.ts` | `skillsForRole`, `installedSkills` |
| `service/src/routes/leases.ts`; Modify `routes/task-worker.ts`, `routes/tasks.ts`, `routes/capabilities.ts` | `POST /tasks/:id/depends`, `POST /tasks/:id/leases`, `GET /leases`, `POST /tasks/:id/review`; `GET /capabilities` con `skills` y `concurrency` |
| `skills/kratos/SKILL.md`, `references/brief-revisor.md`, `evals/06-dos-tareas-un-widget.md` | «Repartir» |
| `panel/src/views/Capacidades.tsx`, `components/TaskRow.tsx` | Skills y concurrencia; badges «Esperando reserva» y «Depende de» (en este hito solo si el agente del panel está libre; si no, queda para la integración siguiente) |
| `tests/service/{leases,scheduler,launch,review,skills}.test.ts` | Pruebas con el `orca` falso de `tests/fakes/orca.ts` |

---

### Task 1: Reservas

**Interfaces:** `acquire(db, runId, taskId, paths: string[]): {ok: true} | {ok: false, conflicts: {path, runId, taskId}[]}` (atómico en una transacción; normaliza con `normalizedPaths` de `worker-policy.ts`), `release(db, runId)`, `holders(db, path)`, `listLeases(db)`. Eventos `lease.acquired`, `lease.released`, `lease.conflict`. Tabla `leases(path text primary key, run_id, task_id, acquired_at)`. Integración: `workerStart` llama a `acquire` con `task.leases` antes de crear el worktree y aborta con `workerFailure(db, payload, 'lease_conflict')` si falla; `release` en `run.finished`, en `workerStop` y en `workerFailure`.

- [ ] Pruebas: Review Focus 1 y 5; dos `acquire` sobre la misma ruta en secuencia → el segundo devuelve `conflicts`; `release` libera todo lo del run; `workerStop` libera.
- [ ] Implementar (migración + módulo + 4 líneas en los manejadores); `npm test`; commit `feat: reservas por asset`.

### Task 2: Planificador

**Interfaces:** `plan(db, config): PlanDecision[]` con `PlanDecision = {taskId, action: 'start'|'wait', reason, provider?: 'codex'|'claude'}`; `tick(db, config, ctx: WorkerContext)` se registra en `startRunner` como trabajo periódico de 5 s y encola `worker.start` para cada `start` con `idempotency_key = worker.start:<taskId>:<attempt>` (misma clave que la ruta, así un arranque manual y uno planificado no se duplican). Reglas en orden: `state === 'preparada'` y `dispatchBlocked` falso; `dependsOn` todas en `done` o (`revisando` y `review_approved = 1`); `acquire` posible (consulta sin tomar: `conflicts`); concurrencia del proveedor no agotada (runs `running` por `provider`); proveedor por rol (`implementacion` → Codex si hay hueco, si no Claude; `revisor` → distinto del implementador; `arte|ui|qa` → Claude si disponible). `wait_reason` se escribe en la tarea y se emite `task.waiting` solo cuando cambia.

- [ ] Pruebas: Review Focus 2; `{codex: 1}` con dos tareas → una `start`, una `wait` «Sin hueco en codex»; revisor distinto del implementador; dos ticks seguidos no encolan dos `worker.start`.
- [ ] Implementar; commit `feat: planificador de arranques`.

### Task 3: Revisión como run

**Interfaces:** `POST /tasks/:id/review` → `enqueue(db, 'review.start', {taskId, implementerRunId}, 'review.start:' + taskId + ':' + implementerRunId)`. Brief de revisión (`references/brief-revisor.md`): criterios de aceptación, `git.diff` del worktree adjunto en `<worktree>/.kratos-review/diff.patch`, instrucción de terminar con `KRATOS_REVIEW {"approved": bool, "findings": [{"file","line","severity","note"}]}`; `worker-markers.ts` gana el marcador `REVIEW`. `review.poll` reutiliza `workerPoll` con `role: 'revisor'`; al cerrar: artefacto `report` con los findings, evento `review.finished`; aprobado → `tasks.review_approved = 1` y, si `task.acceptance` declara comprobaciones ejecutables (prefijo `check:`), `moveTask(probando)`; si no, queda `revisando`; rechazado → `enqueue('worker.send', {runId: implementerRunId, text: findings formateados})` y `moveTask(implementando)`.

- [ ] Pruebas: Review Focus 3; rechazado reenvía findings al run implementador; `KRATOS_REVIEW` mal formado → `worker.waiting` con la línea.
- [ ] Implementar; commit `feat: revisión como run independiente`.

### Task 4: Worker Claude Code

**Interfaces:** `handlers/worker-launch.ts`: `launchCommand(provider): string` (`codex --yolo --no-daemon` | `claude --model sonnet --dangerously-skip-permissions`), `readyPattern(provider): RegExp` (`Ask Codex` | `bypass permissions|Try "`), `permissionPrompt(provider, lines): string | null` (Claude: `Do you want to|Allow|\(y/n\)`). `workerStart` usa `launchCommand`/`readyPattern` según `payload.provider`; `workerPoll` llama a `permissionPrompt` y, si hay coincidencia, emite `worker.waiting` con la línea (Review Focus 4). El brief para Claude añade la lista de skills a cargar y «responde `KRATOS_SKILLS […]` en tu primera línea».

- [ ] Pruebas con `tests/fakes/orca.ts` (ampliar el falso con un modo `claude` cuyo búfer muestra `bypass permissions` y luego un prompt de permiso): arranque, detección de permiso, `KRATOS_DONE`.
- [ ] Implementar; commit `feat: worker Claude Code`.

### Task 5: Skills por rol y Capacidades

**Interfaces:** `skillsForRole(role: string, area: string): string[]` con la tabla §4 del plan v2; `installedSkills(workspaceDir): {name, path, source: 'claude'|'agents'}[]` (lee `.claude/skills/*/SKILL.md` y `.agents/skills/*/SKILL.md`); `GET /capabilities` añade `skills` y `concurrency`; el brief incluye la lista; `workerPoll` detecta `KRATOS_SKILLS [...]` y emite `worker.skills_missing` con la diferencia.

- [ ] Pruebas: `skillsForRole('ui', 'ui')` contiene `ue-ui-umg-slate` y `game-ui-design`; `installedSkills` sobre un directorio temporal con dos skills; prueba 22 del plan v2.
- [ ] Implementar; commit `feat: skills por rol y capacidades del workspace`.

### Task 6: La skill reparte y aceptación

- [ ] `SKILL.md` sección «Repartir»: una petición puede convertirse en varias tareas con `dependsOn`; cada tarea declara `leases` y `scope`; Kratos pide revisión (`kratos task review <id>`) al llegar `run.finished` y espera `review.finished`; eval `06-dos-tareas-un-widget.md`. skillsmith ≥ 95.
- [ ] Aceptación real en `KratosFabTest` (ya es repositorio Git desde el hito 2): dos peticiones que declaran la misma ruta `Content/UI/WBP_HUD.uasset`: solo una arranca, la otra muestra la espera; al terminar la primera arranca la segunda; una revisión por Claude de lo que implementó Codex. `docs/aceptacion-hito3.md`; commit.

---

## Self-review

- Cobertura: §4 → Tarea 5; plan v1 §7 reservas → Tarea 1; `request_review`/`control_run` → Tarea 3 y `POST /runs/:id/stop` existente; hito 3 criterios → Tareas 1, 2, 5, 6; pruebas 5, 6, 22.
- Nombres: todos los módulos nuevos se apoyan en los contratos reales listados arriba; `idempotency_key` de `worker.start` coincide con la ruta del hito 2.
- Review Focus 1, 5 → Tarea 1; 2 → Tarea 2; 3 → Tarea 3; 4 → Tarea 4.
- Abierto: si el panel está ocupado con la integración del hito 8, los badges de la Tarea 5 se dejan para la siguiente ronda del panel; el servicio expone ya los datos.
