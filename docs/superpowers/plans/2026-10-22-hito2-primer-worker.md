# Nomos · Hito 2 «Nomos y un worker real» · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una petición escrita en el panel se convierta en una tarea con criterios de aceptación, que Nomos levante un worker Codex en un worktree del proyecto del juego, que los cambios y la conversación del worker se vean en el panel, y que Nomos pueda pedirle una corrección al mismo worker, todo sin pasos manuales de despacho.

**Architecture:** El servicio gana un ejecutor de comandos (bucle que reclama la bandeja `commands` del hito 1b) y un adaptador de Orca que crea worktrees con agente Codex, les entrega el encargo por archivo, lee su terminal con cursor y les envía texto. Nomos (la sesión de Claude) sigue siendo quien decide: desde el vigilante recibe los eventos y usa la CLI para crear tareas, arrancar workers, leer el diff y pedir correcciones. El panel muestra la tarea moviéndose por el Kanban, el Drawer con pestañas Cambios y Chat alimentadas por eventos, y habilita «Pedir cambios al responsable».

**Tech Stack:** Lo del hito 1b. Orca CLI (`orca`, ya instalado y comprobado en este equipo el 2026-10-22: `repo add`, `worktree create --agent codex`, `terminal wait --for tui-idle`, `terminal read --cursor`, `terminal send`, todo `--json`) invocado con `child_process.spawn` y argumentos en array, nunca por shell. Git en el worktree para el diff.

**Spec:** `docs/plan-v2.md` §4 (roles), §5.7 (autonomía), §10 del plan v1 (herramientas `create_task`, `start_worker`, `send_worker_message`, `inspect_task`), hito 2 de §6, pruebas 5 y 13 (parcial) de §7 del plan v1. Entradas: hito 1b (modelo, outbox, rutas, panel) y hito 0 (CLI, vigilante, SKILL.md).

## Global Constraints

- El worker trabaja en el **repositorio del juego** (la carpeta del `.uproject`), nunca en el repositorio de Nomos. Si esa carpeta no es un repositorio Git, Nomos abre una Decisión «Inicializar Git en el proyecto» y no arranca nada hasta resolverla.
- Rama del worker: `nomos/<taskId-corto>`; worktree creado por Orca (`--no-parent`, base por defecto del repo). Un worker por tarea; un run por intento.
- El encargo al worker va **por archivo**, no por argumento de línea de comandos: el adaptador escribe `<worktree>/.nomos-brief.md` y envía al terminal una sola línea sin comillas ni paréntesis: `Lee el archivo .nomos-brief.md de esta carpeta y ejecuta lo que dice.` (Lección del 2026-10-22: `--prompt` con comillas o paréntesis se rompe al pasar por `cmd.exe`.)
- El brief exige al worker terminar imprimiendo una línea `NOMOS_DONE {"summary": "...", "commits": ["..."], "tests": "passed|failed|none"}`; sin esa línea el run no se considera terminado (Nomos no concede nada por el último mensaje del worker, plan v2 §4).
- Toda invocación de `orca` lleva `--json`, tiempo máximo de 60 s y se registra como evento `tool.completed` con el comando y el código de salida; nunca se ejecuta por `shell: true`.
- Autonomía (§5.7): crear tarea, arrancar worker, leer diff y pedir correcciones no piden permiso; borrar worktrees, tocar sistemas marcados críticos en `.nomos/config.json` o gastar fuera de presupuesto pasan por Decisión.
- Pruebas: el adaptador se prueba contra un `orca` falso (`tests/fakes/orca.ts`, ejecutable por `spawn` con `process.execPath`) que emula las respuestas JSON y un terminal con búfer; la prueba real con Codex es la aceptación final.
- Capturas a 1366×768 y 1920×1080 en `docs/capturas-hito2/`; puertas §2.6 en el formulario de nueva tarea (`form-design`, `ux-heuristics`).

## Review Focus

1. Codex no imprime `NOMOS_DONE` y se queda esperando una pregunta: el run debe pasar a `esperando_worker` y Nomos recibe un evento `worker.waiting` con las últimas 20 líneas, no un `done` falso. (Prueba en Tarea 4.)
2. `orca` tarda o cuelga: el adaptador aborta a los 60 s, el comando queda `failed` con el error y la tarea pasa a `bloqueada` con la causa visible. (Prueba en Tarea 2.)
3. Dos `worker.start` para la misma tarea (reintento de Nomos tras una expiración del vigilante): la `idempotency_key = "worker.start:" + taskId + ":" + attempt` evita el segundo worktree. (Prueba en Tarea 3.)
4. El worker toca archivos fuera de su alcance declarado: el diff muestra rutas no esperadas y Nomos lo ve en la pestaña Cambios antes de pedir nada; `GET /runs/:id/diff` nunca falla por archivos binarios (`--stat` para binarios). (Prueba en Tarea 5.)
5. Texto de corrección con saltos de línea o comillas: `worker.send` lo escribe también a `<worktree>/.nomos-inbox/<n>.md` y envía al terminal una línea corta que apunta al archivo. (Prueba en Tarea 2.)

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `service/src/adapters/orca.ts` | Envoltorio tipado de la CLI de Orca |
| `service/src/adapters/git.ts` | `diff`, `log`, `isRepo`, `currentBranch` sobre una ruta |
| `service/src/runner.ts` | Bucle del ejecutor de comandos y registro de manejadores |
| `service/src/handlers/worker.ts` | Manejadores `worker.start`, `worker.send`, `worker.poll`, `worker.stop` |
| `service/src/brief.ts` | Plantilla del encargo (`.nomos-brief.md`) a partir de la tarea |
| `service/src/routes/{tasks,runs}.ts` | `POST /tasks/:id/spec`, `POST /tasks/:id/worker`, `GET /runs/:id`, `GET /runs/:id/diff`, `GET /runs/:id/output?since=`, `POST /runs/:id/message` |
| `service/src/cli.ts` | Subcomandos `task create|spec|show`, `worker start|send|stop`, `run diff|output` |
| `skills/nomos/SKILL.md` | Sección «Dirigir»: cuándo crear tarea, cuándo responder, ciclo de corrección |
| `skills/nomos/references/{brief-worker,ciclo-tarea}.md` | Plantilla del brief y máquina de estados |
| `panel/src/components/TaskDrawer.tsx` | Pestañas Cambios y Chat del worker; «Pedir cambios al responsable» |
| `tests/fakes/orca.ts`, `tests/service/{orca,runner,worker,brief,routes-worker}.test.ts` | Pruebas |

Máquina de estados de la tarea en este hito: `pendiente` → (Nomos escribe spec) `preparada` → (`worker.start`) `implementando` → (`NOMOS_DONE`) `revisando` → (`worker.send` corrección) `implementando` → … Lo que sigue (`probando`, `integrando`, `cerrando`, `done`) llega en los hitos 5 y 6. `bloqueada` desde cualquier estado con `blocked_reason`.

---

### Task 1: Adaptador de Orca con `orca` falso

**Files:** Create `service/src/adapters/orca.ts`, `tests/fakes/orca.ts`; Test `tests/service/orca.test.ts`.

**Interfaces:** `createOrca(opts?: {bin?: string, timeoutMs?: number}): Orca` con
- `repoAdd(path): Promise<{repoId}>` (idempotente: si `repo list` ya lo tiene, devuelve ese id),
- `worktreeCreate(repoId, name, agent: 'codex'|'claude'): Promise<{worktreeId, path, branch, terminalHandle}>` (sin `--prompt`),
- `terminalWaitIdle(handle, timeoutMs): Promise<boolean>`, `terminalSend(handle, text): Promise<void>` (rechaza texto con `\n`, `"` o `(`: el llamador debe usar el archivo),
- `terminalRead(handle, cursor?: string): Promise<{text, cursor}>`,
- `worktreeRemove(worktreeId, force = false): Promise<void>`.
Errores: `OrcaError(code: 'timeout'|'not_running'|'cli_error', detail)`.

El `orca` falso: script Node que lee `process.argv`, responde JSON con la forma real (copiar de `docs/fab-pruebas`? no: de las salidas registradas el 2026-10-22 en este plan: `worktree create` devuelve `result.worktree.id`, `result.worktree.path`, `result.worktree.branch`, `result.startupTerminal.handle`), mantiene un búfer de terminal en un archivo temporal para `read`/`send`, y admite `FAKE_ORCA_HANG=1` para colgarse (prueba de tiempo máximo).

- [ ] Pruebas: `worktreeCreate` parsea id/path/handle; `terminalRead` con cursor devuelve solo lo nuevo; `terminalSend` rechaza comillas; con `FAKE_ORCA_HANG=1` lanza `OrcaError('timeout')` en ≤ 1,5 s con `timeoutMs: 1000`.
- [ ] Implementar con `spawn(bin, args, {windowsHide: true})` y `AbortController`; `npm test`; commit `feat: adaptador de Orca`.

### Task 2: Ejecutor de comandos y manejadores de worker

**Files:** Create `service/src/runner.ts`, `service/src/handlers/worker.ts`, `service/src/brief.ts`, `service/src/adapters/git.ts`, `skills/nomos/references/brief-worker.md`; Test `tests/service/{runner,worker,brief}.test.ts`.

**Interfaces:**
- `startRunner(db, handlers: Record<string, Handler>, opts?: {intervalMs = 1000}): () => void`; `Handler = (cmd: Command, ctx: {db, orca, git, dataDir}) => Promise<object | void>`.
- `renderBrief(task: Task, run: Run, rules: BriefRules): string` — plantilla fija (en `references/brief-worker.md`): título, especificación, criterios de aceptación numerados, alcance de archivos permitido, reglas (TDD, un commit por paso, no push, no tocar fuera del alcance, terminar con la línea `NOMOS_DONE {...}`, si necesita una decisión imprimir `NOMOS_ASK {"question": "..."}` y esperar), y el contexto del proyecto (`.agents/ue-project-context.md` si existe).
- `worker.start` `{taskId, provider: 'codex', role, skills: string[]}`: comprueba `git.isRepo(projectDir)` (si no → `blockTask` + Decisión `init_git`); `repoAdd`; `worktreeCreate(repoId, "nomos-" + shortId, 'codex')`; escribe `.nomos-brief.md`; `terminalWaitIdle(handle, 90_000)`; `terminalSend(handle, "Lee el archivo .nomos-brief.md de esta carpeta y ejecuta lo que dice.")`; crea `Run` (`running`, `session_ref = handle`) y `Worktree`; `moveTask(implementando)`; encola `worker.poll` para ese run.
- `worker.poll` `{runId}`: `terminalRead(handle, cursor)`; guarda líneas nuevas como evento `worker.output` (máx. 1 evento por sondeo con hasta 50 líneas); si aparece `NOMOS_DONE {...}` → `finishRun(done, summary)`, `moveTask(revisando)`, evento `run.finished`; si aparece `NOMOS_ASK {...}` → evento `worker.waiting`, run `state` sigue `running` con `waiting: true`; si no, reencola `worker.poll` con retraso de 5 s (campo `not_before` en `commands`, añadir columna) hasta 4 h.
- `worker.send` `{runId, text}`: escribe `<worktree>/.nomos-inbox/<n>.md`, envía `Lee el archivo .nomos-inbox/<n>.md y ejecuta lo que dice.`, `moveTask(implementando)` si estaba en `revisando`, evento `worker.message_sent`.
- `worker.stop` `{runId}`: `finishRun(cancelled)`; no borra el worktree (eso es del hito 6).
- `git.ts`: `isRepo(dir)`, `diff(dir, base): {stat: string, patch: string}` (patch solo de archivos de texto, binarios en `stat`), `log(dir, base): {sha, subject}[]`, `currentBranch(dir)`.

- [ ] Pruebas con el `orca` falso: `worker.start` sobre un repo temporal crea run, worktree, brief con los criterios y mueve a `implementando`; `worker.poll` con el búfer conteniendo `NOMOS_DONE {...}` mueve a `revisando`; con `NOMOS_ASK` emite `worker.waiting`; `worker.send` con texto multilínea crea el archivo y envía la línea corta; colgado → comando `failed`, tarea `bloqueada` con `blocked_reason` que empieza por `orca:`.
- [ ] Implementar; `npm test`; commit `feat: ejecutor de comandos y manejadores del worker`.

### Task 3: Rutas y CLI del director

**Files:** Modify `service/src/routes/tasks.ts`; Create `service/src/routes/runs.ts`; Modify `service/src/cli.ts`; Test `tests/service/routes-worker.test.ts`.

**Interfaces:**
- `POST /tasks/:id/spec {spec, acceptance[], area, scope: string[]}` → `preparada`.
- `POST /tasks/:id/worker {provider, role, skills[], attempt}` → encola `worker.start` con `idempotency_key = "worker.start:" + taskId + ":" + attempt` → 202 `{commandId}`.
- `GET /runs/:id` → run + worktree + último estado; `GET /runs/:id/output?since=<seq>` → eventos `worker.output`; `GET /runs/:id/diff` → `{stat, patch, commits}`; `POST /runs/:id/message {text}` → encola `worker.send` → 202.
- CLI: `nomos task create --title --area --spec-file <md>` (crea en `pendiente` y, si hay spec, la deja `preparada`), `nomos task show <id>`, `nomos worker start <taskId> --provider codex --role implementacion --skills a,b`, `nomos worker send <runId> --file <md>` o `--text`, `nomos run diff <runId>`, `nomos run output <runId> --since <seq>`.

- [ ] Pruebas: dos `POST /tasks/:id/worker` con el mismo `attempt` → un solo comando; `GET /runs/:id/diff` sobre un repo temporal con un binario devuelve `stat` con el binario y `patch` sin él; rutas 401 sin token.
- [ ] Implementar; `npm test`; commit `feat: rutas y CLI para dirigir workers`.

### Task 4: La skill dirige

**Files:** Modify `skills/nomos/SKILL.md`; Create `skills/nomos/references/ciclo-tarea.md`; Modify `skills/nomos/evals/` (añadir `04-peticion-a-tarea.md`, `05-correccion.md`).

Contenido fijado para la sección «Dirigir» de `SKILL.md`:
1. Al recibir un mensaje, Nomos lo clasifica en una línea: **pregunta** (responde con `reply`), **petición de trabajo** (crea tarea) o **decisión** (resuelve una Decisión abierta).
2. Petición de trabajo: escribe la especificación en `.nomos/specs/<id>.md` (qué, por qué, criterios de aceptación comprobables, alcance de archivos, qué no tocar), `nomos task create … --spec-file`, responde al panel con el id y un resumen de 2 líneas, y arranca el worker (`nomos worker start <id> --provider codex --role implementacion`). Por ahora un worker por petición y proveedor Codex; Claude llega en el hito 3.
3. Cuando el vigilante imprime `run.finished`: `nomos run diff <runId>`, compara con los criterios, y o bien pide corrección (`nomos worker send <runId> --file .nomos/correcciones/<n>.md`, concreta: archivo, qué está mal, qué se espera) o deja la tarea en `revisando` con un comentario para el usuario (`reply` al mensaje original). Máximo 3 ciclos de corrección por run; al tercero, Decisión.
4. Cuando imprime `worker.waiting`: lee la pregunta (`nomos run output`), responde al worker con `worker send` si la respuesta está en la especificación; si no, abre Decisión para el usuario.
5. Nunca declara terminado nada: eso es del hito 6.

El vigilante del hito 0 ya imprime todos los eventos `message.received`; ahora imprime también `run.finished`, `worker.waiting` y `command.failed` (ajuste en `nomos vigila`: filtro de tipos configurable, por defecto esos cuatro).

- [ ] Actualizar `vigila` y su prueba; escribir SKILL.md, referencias y evals; skillsmith ≥ 95 (puerta del hito 2 según plan v2 §5.5).
- [ ] `npm test`; commit `feat: la skill dirige tareas y workers`.

### Task 5: Panel: Cambios, Chat del worker y «Pedir cambios»

**Files:** Modify `panel/src/components/TaskDrawer.tsx`; Create `panel/src/components/{DiffView,WorkerChat}.tsx`; Modify `panel/src/components/NewRequestForm.tsx` (campos spec y criterios opcionales); Modify `panel/src/store.ts` (`run.started|run.finished|worker.output|worker.waiting|worker.message_sent|command.failed`).

Fijado: pestaña Cambios con `stat` arriba y `patch` en `<pre>` monoespaciado con filtro por archivo y aviso «Archivos fuera del alcance declarado» cuando una ruta no empieza por los prefijos del `scope`; pestaña Chat con las líneas del worker (agrupadas por sondeo, hora a la izquierda), los mensajes de Nomos y un `Input.TextArea` «Pedir cambios al responsable» que llama a `POST /runs/:id/message` y muestra `Enviado al worker`; tarjeta con badge «Esperando respuesta» cuando `worker.waiting`; la columna cambia en vivo por SSE.

- [ ] Pruebas Vitest: `DiffView` marca una ruta fuera del alcance; `WorkerChat` deshabilita el envío mientras no hay run `running`; `applyEvent` con `run.finished` mueve la tarjeta a `revisando`.
- [ ] Capturas `drawer-cambios-1366.png`, `drawer-chat-1366.png`, `kanban-en-vivo-1920.png`.
- [ ] `npm test`; commit `feat: Cambios, Chat del worker y Pedir cambios al responsable`.

### Task 6: Aceptación real con Codex

Proyecto de prueba: `C:\Users\richa\Documents\Unreal Projects\KratosFabTest` (hacer `git init` y un commit inicial con `.gitignore` de Unreal del catálogo del jam si no lo tiene).

- [ ] En una sesión nueva de Claude Code en esa carpeta: `/nomos`; desde el panel pedir «Crea un archivo `Docs/README-kratos.md` que describa el proyecto y un script `Scripts/hello.ps1` que imprima la versión del motor leída del .uproject». Esperado: tarea creada con spec y criterios, worker Codex en worktree de Orca, tarjeta en `implementando`, Chat mostrando la salida, `NOMOS_DONE` → `revisando`, Cambios con los dos archivos.
- [ ] Pedir desde el panel «Que el script también imprima la ruta del motor instalado». Esperado: `worker.send`, tarjeta vuelve a `implementando`, nuevo `NOMOS_DONE`, diff actualizado, mismo run y mismo worktree.
- [ ] Registrar en `docs/aceptacion-hito2.md` con capturas y el `orca worktree list` resultante; `docs/estado-entregas.md` actualizado; commit `docs: aceptación del hito 2`.

---

## Self-review

- Cobertura: `create_task`/`start_worker`/`send_worker_message`/`inspect_task` del plan v1 §10 → Tareas 3 y 4; roles §4 (solo implementación en este hito) → brief y `role`; §5.7 → Global Constraints y Decisiones `init_git` y tercer ciclo; hito 2 criterio «petición → tarea → cambios → corrección al mismo responsable sin pasos manuales» → Tareas 2-6; pruebas 5 (atribución trazable: run con provider/model/session) y 13 parcial (continuación con el mismo responsable).
- Nombres: `worker.start|poll|send|stop`, `run.started|finished`, `worker.output|waiting|message_sent`, `command.failed` iguales en handlers, rutas, vigila, store y Drawer.
- Review Focus 1 → Tarea 2 (`worker.waiting`); 2 → Tarea 1 y 2; 3 → Tarea 3; 4 → Tareas 2 (`git.diff`) y 5; 5 → Tarea 2 (`worker.send` por archivo).
- Abierto a propósito: el Codex App Server del plan v1 §8 queda como alternativa si el adaptador de Orca resulta insuficiente (p. ej. para reanudar sesiones tras reiniciar Orca); se decide con datos del hito 3.
