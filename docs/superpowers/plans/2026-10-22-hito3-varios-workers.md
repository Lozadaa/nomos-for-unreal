# Kratos · Hito 3 «varios workers, dependencias, revisión y reservas» · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> Este plan se refina antes de despacharlo, con el código de los hitos 0-2 delante: las firmas de aquí son el contrato que esos hitos deben haber dejado; si cambiaron, se actualiza este documento primero.

**Goal:** Que Kratos reparta trabajo entre varios workers a la vez (Codex y Claude Code), respete dependencias entre tareas, pase cada resultado por un revisor distinto del implementador, y garantice exclusión sobre recursos compartidos de Unreal (`.uasset`, `.umap`, widgets, esqueletos) mediante reservas; y que cada worker arranque con las skills que su rol exige, visibles en Capacidades.

**Architecture:** Un planificador en el servicio decide qué tareas `preparada` pueden arrancar (dependencias `done` o `revisando` aprobadas, reservas libres, concurrencia por proveedor) y encola `worker.start`; un segundo adaptador lanza workers de Claude Code (por Orca con `--agent claude`, mismo protocolo de brief por archivo); el rol `revisor` es un run más sobre la misma tarea con brief de revisión y salida `KRATOS_REVIEW {...}`; las reservas (`leases`) se piden por ruta de asset y se liberan al terminar el run. El enrutado de skills por rol (plan v2 §4) se materializa en el brief y en el campo `skills` del run.

**Tech Stack:** El del hito 2. Claude Code como worker: Orca `worktree create --agent claude` (si Orca no expone `claude` en este equipo, `claude -p` no sirve porque el worker necesita sesión interactiva larga: se usa `terminal create --command "claude --dangerously-skip-permissions"` y el mismo protocolo de archivo).

**Spec:** `docs/plan-v2.md` §4 (enrutado de skills por rol), §7 del plan v1 (paralelismo específico de Unreal), §10 (`request_review`, `control_run`), hito 3 de §6, pruebas 6 y 22 de §7, prueba 5 del plan v1 §13.

## Global Constraints

- Un escritor por instancia de editor y una cola para importación, guardado, PIE y capturas (plan v1 §7): en este hito todavía no hay editor en marcha (llega en el hito 5), pero las reservas ya cubren rutas `Content/**/*.uasset|*.umap` y se usan tal cual después.
- Concurrencia por defecto en `.kratos/config.json`: `{"codex": 2, "claude": 1}`; configurable; Capacidades la muestra.
- Las skills de cada rol son las de la tabla §4 del plan v2; el brief incluye la lista y la instrucción «carga estas skills antes de empezar»; el worker confirma en su primera salida con la línea `KRATOS_SKILLS ["…"]`; si falta alguna, el evento `worker.skills_missing` lo dice y la tarea no se bloquea (se anota).
- El revisor nunca es el mismo run ni el mismo proveedor que implementó cuando hay dos proveedores disponibles; si solo hay uno, es un run nuevo con brief de revisión y se anota `same_provider: true`.
- Todo lo del hito 2 sigue: brief por archivo, `KRATOS_DONE`, idempotencia por `attempt`, Decisión al tercer ciclo.

## Review Focus

1. Dos tareas piden el mismo widget (`Content/UI/WBP_HUD.uasset`): la segunda no arranca y su tarjeta muestra «Esperando reserva: WBP_HUD (tarea X)». (Prueba en Tarea 1.)
2. Una tarea depende de otra que se bloquea: la dependiente queda `preparada` con motivo «Depende de X (bloqueada)» y no se reencola en bucle. (Prueba en Tarea 2.)
3. El revisor aprueba pero las pruebas de la tarea fallan (hito 5): aquí la revisión solo mueve a `revisando` → `probando` si hay comprobaciones declaradas, y a `revisando` aprobada si no; nunca a `done`. (Prueba en Tarea 3.)
4. Un worker Claude arranca sin `--dangerously-skip-permissions` y se queda pidiendo permiso: el sondeo detecta el prompt de permiso en la salida y emite `worker.waiting` con la línea. (Prueba en Tarea 4.)
5. Cancelar un run (`control_run`) mientras tiene reservas: las reservas se liberan y la tarjeta vuelve a `preparada` con nota. (Prueba en Tarea 1.)

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `service/src/leases.ts` | Reservas por ruta: `acquire`, `release`, `holders`, `conflicts` |
| `service/src/scheduler.ts` | Decide arranques: dependencias, reservas, concurrencia |
| `service/src/adapters/claude.ts` | Worker Claude Code por Orca |
| `service/src/handlers/review.ts` | `review.start`, `review.poll` con `KRATOS_REVIEW` |
| `service/src/skills.ts` | Tabla rol → skills (plan v2 §4) y detección de skills instaladas en el workspace |
| `service/src/routes/{tasks,runs,leases}.ts` | `POST /tasks/:id/depends`, `POST /tasks/:id/leases`, `GET /leases`, `POST /runs/:id/cancel`, `POST /tasks/:id/review` |
| `skills/kratos/SKILL.md` | «Repartir»: varias tareas por petición, dependencias, pedir revisión |
| `panel/src/views/Capacidades.tsx`, `components/TaskCard.tsx` | Skills por workspace, concurrencia; badges de reserva y dependencia |
| `tests/service/{leases,scheduler,claude,review,skills}.test.ts` | Pruebas |

---

### Task 1: Reservas

**Interfaces:** `acquire(db, runId, paths: string[]): {ok: true} | {ok: false, conflicts: {path, runId, taskId}[]}` (atómico: todo o nada; normaliza rutas a `/` y minúsculas en Windows), `release(db, runId)`, `holders(db, path)`, `listLeases(db)`. Eventos `lease.acquired`, `lease.released`, `lease.conflict`. Tabla `leases(path PK, run_id, task_id, acquired_at)`.

- [ ] Pruebas: Review Focus 1 y 5; dos `acquire` concurrentes sobre la misma ruta → uno gana; `release` libera todo lo del run.
- [ ] Implementar; commit `feat: reservas por asset`.

### Task 2: Planificador

**Interfaces:** `plan(db, config): Decision[]` donde cada decisión es `{taskId, action: 'start'|'wait', reason, provider?}`; `tick(db, config, enqueue)` se llama desde el runner cada 5 s y encola `worker.start` para los `start`. Reglas en orden: tarea `preparada`; dependencias todas en `done` o `revisando` con `review_approved = 1`; reservas declaradas en `task.leases` (JSON lista de rutas) libres; concurrencia del proveedor no agotada; proveedor por rol según `skills.ts` (`implementacion` → el que tenga hueco, Codex primero; `revisor` → distinto del implementador; `arte`, `ui`, `qa` → Claude si disponible, por las skills locales). Columna nueva `tasks.leases`, `tasks.review_approved`, `tasks.wait_reason`.

- [ ] Pruebas: Review Focus 2; concurrencia `{codex: 1}` con dos tareas → una `start` y una `wait` «Sin hueco en codex»; revisor distinto del implementador.
- [ ] Implementar; commit `feat: planificador de arranques`.

### Task 3: Revisión como run

**Interfaces:** `POST /tasks/:id/review` → encola `review.start {taskId, implementerRunId}`; brief de revisión (`references/brief-revisor.md`): criterios de aceptación, `git diff` adjunto en `.kratos-review/diff.patch`, instrucción de terminar con `KRATOS_REVIEW {"approved": bool, "findings": [{"file","line","severity","note"}]}`; `review.poll` guarda `findings` como artefacto `report` y evento `review.finished`; aprobado → `tasks.review_approved = 1` (si la tarea declara comprobaciones, `moveTask(probando)` — las ejecuta el hito 5; si no, queda `revisando` aprobada); rechazado → `worker.send` al implementador con los findings y `moveTask(implementando)`.

- [ ] Pruebas: aprobado sin comprobaciones no pasa de `revisando`; rechazado reenvía findings al run implementador; Review Focus 3.
- [ ] Implementar; commit `feat: revisión como run independiente`.

### Task 4: Worker Claude Code

**Interfaces:** `createClaudeWorker(orca)` con el mismo contrato que el de Codex (`start`, `send`, `read`); lanza `--agent claude` o, si Orca no lo lista, `terminal create --command "claude --dangerously-skip-permissions"`; detecta en la salida los prompts de permiso de Claude Code («Do you want to», «Allow», «(y/n)») y los trata como `worker.waiting`; el brief para Claude añade «carga las skills: …» con las rutas de `.claude/skills` del workspace.

- [ ] Pruebas con `orca` falso: arranque, detección de prompt de permiso (Review Focus 4), `KRATOS_DONE`.
- [ ] Implementar; commit `feat: worker Claude Code`.

### Task 5: Skills por rol y Capacidades

**Interfaces:** `skillsForRole(role, area): string[]` con la tabla §4 del plan v2; `installedSkills(workspaceDir): {name, path, source}[]` (lee `.claude/skills/*/SKILL.md` y `.agents/skills`); `GET /capabilities` añade `skills` y `concurrency`; el brief incluye la lista y el worker responde `KRATOS_SKILLS [...]`; evento `worker.skills_missing` si faltan.

- [ ] Pruebas: `skillsForRole('ui')` contiene `ue-ui-umg-slate` y `game-ui-design`; `installedSkills` sobre un directorio temporal con dos skills; prueba 22 del plan v2 (arranque UMG carga las skills y Capacidades las muestra).
- [ ] Implementar; panel: Capacidades con tabla de skills por workspace y concurrencia; `TaskCard` con badges «Esperando reserva» y «Depende de»; commit `feat: skills por rol y capacidades del workspace`.

### Task 6: La skill reparte

- [ ] `SKILL.md` sección «Repartir»: una petición puede convertirse en varias tareas con `depends_on`; cada tarea declara `leases` (rutas de assets que tocará) y `scope`; Kratos pide revisión (`kratos task review <id>`) cuando llega `run.finished`, y espera `review.finished` antes de decidir; eval `06-dos-tareas-un-widget.md`. skillsmith ≥ 95.
- [ ] Aceptación real en `KratosFabTest`: dos peticiones que tocan el mismo widget (basta con declarar la misma ruta `Content/UI/WBP_HUD.uasset`): solo una arranca; la otra muestra la espera; al terminar la primera, arranca la segunda; una revisión por Claude de lo que implementó Codex. Registrar en `docs/aceptacion-hito3.md`; commit.

---

## Self-review

- Cobertura: §4 → Tarea 5; plan v1 §7 reservas → Tarea 1; `request_review`/`control_run` → Tareas 3 y rutas; hito 3 criterios (paralelismo de tareas independientes y exclusión sobre recursos compartidos; Capacidades muestra skills) → Tareas 1, 2, 5, 6; pruebas 5, 6, 22.
- Review Focus 1, 5 → Tarea 1; 2 → Tarea 2; 3 → Tarea 3; 4 → Tarea 4.
- Abierto: la política «Claude primero para arte/ui/qa» se basa en que esas skills son de Claude Code; si Codex las carga igual desde `.agents/skills`, se revisa en el hito 5 con datos.
