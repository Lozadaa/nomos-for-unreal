# Nomos · Hito 5 «Unreal, UI del juego y QA» · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Refinado 2026-10-23** con el código real de los hitos 0-4, 8 y 9. Reglas del usuario vigentes: **ningún worker Codex** (workers y aceptación con Claude); Meshy no interviene aquí; el hito 5b (personajes y animación) está **pausado**. El MCP vivo de Unreal (plugin `ModelContextProtocol` + `AllToolsets`, experimental, sin el plugin de Claude Code de Epic instalado en este equipo) **no es la base de este hito**: la base es el editor por lotes que ya funciona (`service/src/adapters/unreal-cmd.ts`, ~10 s por arranque en `KratosFabTest`). El MCP queda como adaptador opcional, apagado, con una prueba real documentada.

**Goal:** Que una petición produzca un cambio real dentro de Unreal con evidencia (compilación, prueba, captura o build), que toda pantalla UMG pase el ciclo crear → PIE → captura → revisión visual → corregir, y que el panel muestre esas pruebas y capturas con los metadatos del plan (tarea, run, commit, motor, mapa, configuración).

**Architecture:** Tres piezas sobre lo que ya existe. (1) **Editor por lotes con cola**: `unreal-cmd.ts` gana un modo con render (sin `-NullRHI`, con `-ResX/-ResY`) para PIE y capturas, y `withEditor(ctx, project, run, fn)` toma la reserva `editor/<NombreProyecto>` (como ya hace `asset-migrate.ts`), ejecuta y libera; nunca dos editores sobre el mismo proyecto. (2) **Comprobaciones por tipo de cambio** (plan v1 §9): `selectChecks(files)` decide qué exige el diff del run y `runCheck` produce un `TestRun` (`recordTestRun`) con artefactos; el paso `probando → integrando` exige los `TestRun` obligatorios en `passed`. (3) **Ciclo UMG**: tras `run.finished` de una tarea `ui`, el servicio captura la UI en PIE a dos resoluciones, comprueba que la UI está en la imagen y encola un run `qa` de Claude con `ue-visual-qa` que termina con `NOMOS_REVIEW`, reutilizando la infraestructura de revisión del hito 3.

**Tech Stack:** UE 5.8.3 en `C:\Program Files\Epic Games\UE_5.8`; `UnrealEditor-Cmd.exe` con `-ExecutePythonScript` (lotes) y sin `-NullRHI` (render); `Engine\Build\BatchFiles\Build.bat` para C++; `Engine\Build\BatchFiles\RunUAT.bat BuildCookRun` para empaquetar; Python del editor (`unreal.EditorValidatorSubsystem`, `unreal.AutomationLibrary.take_high_res_screenshot`, `unreal.BlueprintEditorLibrary.compile_blueprint`, `unreal.EditorLevelLibrary`/`LevelEditorSubsystem` para PIE); skills `ue-ui-umg-slate`, `game-ui-design`, `ue-umg-ui`, `ue-visual-qa`, `game-ui-art-director`, `ue-testing-debugging`. Servicio sin dependencias; panel del hito 8-9.

**Spec:** `docs/plan-v2.md` §3.2, §3.7, §3.8, §4, plan v1 §7 y §9, hito 5 de §6, pruebas 7, 8, 28 y 29 de §7.

## Contratos reales que este plan usa (no reescribir)

- **Editor por lotes** `service/src/adapters/unreal-cmd.ts`: `createUnrealCmd({bin?, baseArgs?, timeoutMs?}) → {runPython(uproject, script, env, timeoutMs), verifyPack, importFile}`; `defaultUnrealCmd`; scripts en `service/unreal/*.py`; mata el árbol de procesos con `taskkill /T` al agotar el tiempo (`unreal_timeout`); en pruebas `bin = process.execPath`, `baseArgs = ['tests/fakes/unreal-cmd.mjs']` y `NOMOS_FAKE` elige el comportamiento. Este hito **amplía** `runPython` con `opts.render?: {width, height}` (quita `-NullRHI`, añade `-ResX= -ResY= -windowed -ForceRes`) y no cambia su firma actual.
- **Reserva del editor**: `acquire(db, run.id, task.id, ['editor/<name>'])` y `{deferred: true, reason: leaseWaitReason(conflicts)}` cuando está ocupada; el runner ya difiere cualquier handler que devuelva `deferred` (hito 4). Liberar con `release(db, run.id)`.
- **Bandeja de comandos**: `enqueue(db, type, payload, idempotencyKey, {notBefore?})`; handlers registrados en `server.ts` como `{...createWorkerHandlers(), ...createAssetHandlers()}` → se añade `...createCheckHandlers()`. `POST /commands` (`routes/commands.ts`) tiene `validators` por tipo: se añaden `checks.run` y `ui.cycle`.
- **Run y tarea de una orden**: `commandRun(ctx, command, {title, provider, role, state?, metadata})` en `handlers/asset-run.ts` crea o reutiliza el run de un comando; `targetProject(ctx, target?)` resuelve `{dir, uproject, name}`. Se reutilizan tal cual para los runs de QA por lotes (`provider: 'unreal'`, `role: 'qa'`).
- **Pruebas**: `recordTestRun(db, {taskId, runId?, commit?, engineVersion?, map?, config?, result, reportPath?})` en `repo/artifacts.ts` (tabla `test_runs`, `result ∈ pending|running|passed|failed|skipped|unavailable`); `GET /tasks/:id` ya devuelve `testRuns`; el panel ya tiene `TestsTab` en `panel/src/views/TaskTabs.tsx` con `resultLook` por resultado.
- **Estados**: `moveTask(db, id, state, reason?)` en `repo/tasks.ts` solo guarda `cerrando → done`; este hito añade la guarda `probando → integrando`. `blockTask`/`openDecision` para bloquear con Decisión.
- **Revisión**: `review.start` (`handlers/review-start.ts`) arranca un run `revisor` con `startWorker(..., {snapshot, valid, brief})` y brief de `references/brief-revisor.md`; los marcadores `NOMOS_REVIEW {…}` los parsea `handlers/worker-markers.ts` y `review-finish.ts` reenvía los hallazgos al implementador. El run de QA visual **reutiliza ese camino** con `role: 'qa'`, skills `skillsForRole('qa')` + `ue-visual-qa`, y un brief propio `references/brief-qa-visual.md`.
- **Git**: `ctx.git.diff(dir, base) → {stat, patch}` y `log` en `adapters/git.ts`; el diff del run implementador es lo que alimenta `selectChecks`.
- **Skills**: `skillsForRole(role, area)` en `service/src/skills.ts` ya devuelve para `ui` `['game-ui-art-director','ue-ui-umg-slate','game-ui-design','game-ui-ux','ue-umg-ui','ux-writing','ue-visual-qa']` y para `qa` `['ue-testing-debugging','ue-visual-qa','ue-test-package','unreal-packaging']`; `installedSkills(workspaceDir)` inventaría `<juego>/.claude/skills`. Los esqueletos del jam están en `C:\Users\richa\Documents\unreal-game-jam\skills\proposed\{ue-umg-ui,ue-visual-qa}` (30 y 24 líneas: hay que completarlos).
- **Capacidades**: `detectCapabilities` en `repo/capabilities.ts` (ruta del motor, plugins MCP y Fab, Launcher, Meshy, Blender, Git); `GET /capabilities?details=1` añade skills y concurrencia. `GET /leases` lista reservas.
- **Panel**: `TaskTabs.tsx` (pestañas Resumen, Chat, Cambios, Pruebas, Assets, Línea de tiempo), `Entregas.tsx` (tarjetas con `Preview` por tipo), `Capacidades.tsx` (grupo de avatares y estado por proveedor), eventos por prefijo en `useResource`.

## Global Constraints

- **Un solo editor por proyecto y operación** (reserva `editor/<proyecto>`); los workers de texto siguen en paralelo. Tiempo máximo por operación: compilación C++ 20 min, PIE/captura 10 min, build 40 min; al agotarse, `taskkill /T` y `TestRun failed` con el log como artefacto.
- **Un único MCP de Unreal**: Capacidades marca `unreal_mcp` como ya hace y añade `unreal_mcp_conflict` si `.claude/settings.json`, `.mcp.json` o `~/.claude.json` del juego declaran más de un servidor cuyo nombre contenga `unreal` (prueba 29). El servicio **no arranca** el editor vivo por defecto (`config.json: editorMcp: {enabled: false}`).
- Ninguna tarea pasa de `probando` a `integrando` sin `TestRun passed` de todas las comprobaciones que su diff exige; `skipped` y `unavailable` se muestran como tales y bloquean con Decisión «Continuar sin esta comprobación / Reintentar» si la comprobación era obligatoria (prueba 7).
- Toda pantalla UMG termina con captura en PIE a 1280×720 y 1920×1080 con la UI visible y un informe de `ue-visual-qa`; sin captura no hay cierre (prueba 28).
- Cada `TestRun` lleva tarea, run, commit (`git.head`), versión del motor (del log o `unreal.SystemLibrary.get_engine_version`), mapa, configuración, fecha y archivos de evidencia en `<dataDir>/artifacts/tests/<testRunId>/`.
- `game-ui-art-director` escribe `docs/ui-direction.md` en el juego antes de la primera pantalla; el brief de todo worker `ui` lo incluye si existe.
- Lo demás, como los hitos anteriores: cero dependencias npm en el servicio; TypeScript borrable; archivos de ≤ 200 líneas; `127.0.0.1` y token; copy en español; LF; `npm test`, `npm run test:panel`, `npm run build` y Playwright en verde por commit; sin push ni merge; `.nomos-brief.md` fuera de los commits.

## Review Focus

1. El editor se cuelga en PIE: tiempo máximo (10 min) → `taskkill /T`, reserva liberada, `TestRun failed` con el log. (Tarea 1.)
2. Captura sin widgets (la UI no se montó): la captura de control sin UI y la captura con UI deben diferir (al menos el 0,5 % de los píxeles, comparación propia PNG→RGBA sin librerías: `node:zlib` + parser PNG de ≤ 80 líneas); si no difieren, `umg` falla con «la captura no contiene la UI». (Tarea 4.)
3. Compilación C++ fallida con 400 líneas de error: el log completo va a artefacto `report`; el evento `test.failed` lleva solo las 30 primeras líneas con `error`; el implementador recibe la ruta del archivo. (Tarea 2.)
4. Dos tareas piden PIE a la vez: la segunda queda `deferred` con motivo visible en Capacidades («Editor de KratosFabTest: ocupado por <nombre de agente>») y en la fila; no falla. (Tarea 1.)
5. Mapa que depende de assets no guardados o rotos: Data Validation sobre los assets tocados corre antes de PIE y bloquea con la lista en la Decisión. (Tarea 2.)
6. Motor ausente o ruta mal configurada: `TestRun unavailable` con detalle, Decisión si la comprobación era obligatoria; nunca un `passed` sin ejecutar. (Tarea 2.)

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `service/src/adapters/unreal-cmd.ts` (ampliar) | `runPython(..., {render})`, `engineVersion(uproject)`; sin cambiar la firma actual |
| `service/src/adapters/unreal-build.ts` | `buildEditorTarget(uproject, {bin?})` (Build.bat) y `buildCookRun(uproject, outDir, {bin?})` (RunUAT) con tiempo máximo y parseo de errores |
| `service/src/editor/queue.ts` | `withEditor(ctx, project, run, fn)`: reserva, evento `editor.busy|free`, liberación en `finally` |
| `service/src/checks/{select,run,cpp,blueprint,umg,asset,map,build}.ts` | `selectChecks(files) → CheckId[]`; `runCheck(id, ctx, input) → TestRun` por tipo |
| `service/src/checks/png.ts` | Decodificador PNG mínimo (`node:zlib`) y `pixelDiffRatio(a, b)` |
| `service/src/handlers/checks.ts`, `handlers/ui-cycle.ts` | `createCheckHandlers()`: `checks.run`, `ui.cycle`, `editor.mcp_start|stop` (opcional, apagado) |
| `service/src/handlers/review-start.ts` (ampliar) | `role: 'qa'` con brief de QA visual y capturas como contexto |
| `service/unreal/{nomos_compile_bp,nomos_validate,nomos_pie_capture,nomos_widgets}.py` | Compilar Blueprints, Data Validation, PIE con captura (con y sin UI), listar widgets en viewport |
| `service/src/repo/tasks.ts` (ampliar) | Guarda `probando → integrando` |
| `service/src/routes/tasks.ts` (ampliar) | `POST /tasks/:id/checks` (encola `checks.run` con el diff del último run) |
| `service/src/routes/commands.ts` (ampliar) | validadores `checks.run`, `ui.cycle` |
| `service/src/repo/capabilities.ts` (ampliar) | `unreal_mcp_conflict`, estado del editor por proyecto |
| `skills/{game-ui-art-director,ue-umg-ui,ue-visual-qa}/` | Skills propias completas (SKILL.md, references, 2 evals cada una) |
| `skills/nomos/references/{evidencia,ui-ciclo,brief-qa-visual}.md`, `SKILL.md` sección «Pruebas y UI», `scripts/nomos.ts` (`task check`, `skills install`) | Contrato de evidencia; ciclo UMG; instalación de skills en el juego |
| `panel/src/views/TaskTabs.tsx` (`TestsTab`), `views/Entregas.tsx`, `views/Capacidades.tsx` | Tabla de pruebas con metadatos y evidencia; capturas con resolución; cola del editor |
| `tests/service/{unreal-build,editor-queue,checks-select,checks-run,ui-cycle,png,capabilities-mcp}.test.ts`, `tests/fakes/{unreal-build.mjs}` | Pruebas con ejecutables falsos; fixtures PNG pequeñas generadas en la prueba |

---

### Task 1: Editor por lotes con render y cola

**Files:** Modify `service/src/adapters/unreal-cmd.ts`; Create `service/src/editor/queue.ts`, `service/src/adapters/unreal-build.ts`, `tests/fakes/unreal-build.mjs`; Modify `service/src/repo/capabilities.ts`, `panel/src/views/Capacidades.tsx`; Test `tests/service/{editor-queue,unreal-build,capabilities-mcp}.test.ts`.

**Interfaces:**
- `runPython(uproject, script, env, timeoutMs, opts?: {render?: {width: number; height: number}})`: con `render` quita `-NullRHI` y añade `-ResX=<w> -ResY=<h> -windowed -ForceRes`; el resto igual. `engineVersion(uproject) → string` leyendo `Engine/Build/Build.version` de la ruta del motor (sin arrancar el editor).
- `withEditor(ctx, project: Project, run: Run, fn: () => Promise<T>, opts?: {timeoutMs}) → Promise<T | {deferred: true; reason}>`: `acquire` de `editor/<project.name>`; evento `editor.busy {project, runId, taskId, agent}`; `fn`; `release` y `editor.free` en `finally`; si `fn` lanza `unreal_timeout`, `TestRun failed` lo decide el llamador.
- `unreal-build.ts`: `buildEditorTarget(uproject, opts) → {ok, log, errors: string[]}` ejecuta `<Engine>\Build\BatchFiles\Build.bat <Proyecto>Editor Win64 Development -Project=<uproject> -WaitMutex -FromMsBuild`, tiempo máximo 20 min, `errors` = líneas con ` error ` o `error C`; `buildCookRun(uproject, outDir, opts) → {ok, log, exePath?}` ejecuta `RunUAT.bat BuildCookRun -project=<uproject> -platform=Win64 -clientconfig=Development -cook -stage -pak -archive -archivedirectory=<outDir>`, 40 min. En pruebas, `bin` = node + `tests/fakes/unreal-build.mjs`.
- Capacidades: `editor` por proyecto (`libre | ocupado por <agente>`) a partir de `GET /leases` filtrando `editor/`; `unreal_mcp_conflict` según las reglas de Global Constraints.
- Adaptador MCP opcional, **apagado**: `editor.mcp_start {project}` arranca `UnrealEditor.exe <uproject> -ExecCmds="ModelContextProtocol.StartServer"` y `editor.mcp_stop`; `config.json: editorMcp: {enabled: false}`; sin prueba de integración, solo de que no arranca cuando está apagado. La prueba real (una vez, en la Tarea 6) ejecuta `StartServer` y `GenerateClientConfig ClaudeCode` y anota el resultado en `docs/aceptacion-hito5.md`, sin que sea puerta.

- [ ] Pruebas: `render` cambia los argumentos y no toca el modo por lotes; `withEditor` difiere la segunda petición y libera en `finally` incluso con excepción (Review Focus 1 y 4); `buildEditorTarget` parsea errores del falso y respeta el tiempo máximo; `unreal_mcp_conflict` con dos servidores `unreal` en un `.mcp.json` temporal; Capacidades muestra «ocupado por …».
- [ ] Commit `feat: editor por lotes con render, cola y compilación`.

### Task 2: Comprobaciones por tipo de cambio

**Files:** Create `service/src/checks/{select,run,cpp,blueprint,asset,map,build}.ts`, `service/unreal/{nomos_compile_bp,nomos_validate,nomos_pie_capture}.py`, `service/src/handlers/checks.ts`; Modify `service/src/repo/tasks.ts` (guarda), `service/src/routes/tasks.ts` (`POST /tasks/:id/checks`), `service/src/routes/commands.ts`, `service/src/server.ts`; Test `tests/service/{checks-select,checks-run,task-gate}.test.ts`.

**Interfaces:**
- `selectChecks(files: string[]) → CheckId[]` con `CheckId = 'cpp'|'blueprint'|'umg'|'asset'|'map'|'build'`: `.cpp|.h|.cs` (Build.cs/Target.cs) → `cpp`; `.uasset` bajo `Content/**/Blueprints|BP_*` → `blueprint`; `WBP_*.uasset` o `Content/UI/**` → `umg`; mallas/texturas/materiales (`SM_|SK_|T_|M_|MI_`) → `asset`; `.umap` → `map`; `Config/Default*.ini` o `scope` con `build` → `build`. Sin coincidencias → `[]` (la tarea pasa sin pruebas, con evento `test.skipped` y motivo «el diff no toca Unreal»).
- `runCheck(id, ctx, {task, run, project, files}) → TestRun`: cada uno registra `pending → running → passed|failed|skipped|unavailable` con metadatos (`commit = await ctx.git.head(worktree)`, `engineVersion`, `map`, `config`), guarda el log en `<dataDir>/artifacts/tests/<testRunId>/log.txt` como artefacto `report` y emite `test.<resultado> {testRunId, taskId, runId, check, summary}` (Review Focus 3: resumen de 30 líneas). Motor ausente → `unavailable` (Review Focus 6).
  - `cpp`: `buildEditorTarget`.
  - `blueprint`: `nomos_compile_bp.py` con `NOMOS_ASSETS` (lista JSON de rutas `/Game/...`): carga, `unreal.BlueprintEditorLibrary.compile_blueprint`, comprueba `unreal.EditorAssetLibrary.does_asset_exist` de las referencias; informe JSON `{ok, errors}`.
  - `asset`: `verifyPack` del hito 4 sobre la carpeta tocada más los criterios de `ue-asset-intake` (escala en cm razonable, colisión presente, materiales no nulos) leídos del informe.
  - `map`: `nomos_validate.py` (`unreal.EditorValidatorSubsystem.validate_assets` sobre los assets tocados; Review Focus 5) y, si pasa, `nomos_pie_capture.py` en modo render: carga el mapa, PIE 30 s, `take_high_res_screenshot` a 1280×720, artefacto `screenshot`.
  - `umg`: delega en la Tarea 4.
  - `build`: `buildCookRun` + arranque del ejecutable 30 s con captura (`-ExecCmds="HighResShot 1280x720"`); solo cuando el diff o la petición lo exigen.
- Handler `checks.run {taskId, runId, files?}` (sin `files`, los calcula de `ctx.git.diff(worktree, baseCommit).stat`): ejecuta en orden `cpp → blueprint → asset → map → umg → build`, parando en el primer `failed`; todo dentro de `withEditor` salvo `cpp` y `build` (no abren el editor pero sí reservan `editor/<proyecto>` para no compilar mientras PIE corre). Resultado `{testRunIds, passed}`.
- Guarda: `moveTask(db, id, 'integrando')` desde `probando` exige que para cada `CheckId` requerido el último `TestRun` sea `passed`; si alguno es `skipped|unavailable` y era obligatorio (`cpp`, `blueprint`, `umg`, `map` siempre; `asset` y `build` solo si el diff lo pide) → `invalid_transition` y `openDecision` «Continuar sin esta comprobación / Reintentar». `POST /tasks/:id/checks` encola `checks.run` con clave `checks:<taskId>:<runId>:<n>`; la skill lo expone como `nomos task check <taskId>`.

- [ ] Pruebas: `selectChecks` sobre listas reales (del diff de la aceptación del hito 3 y de rutas típicas); cada `runCheck` contra los ejecutables falsos (éxito, fallo con 400 líneas → resumen de 30 y artefacto completo, motor ausente → `unavailable`); guarda de estado con Decisión; `checks.run` para en el primer fallo y difiere si el editor está ocupado.
- [ ] Commit `feat: comprobaciones por tipo de cambio y puerta de pruebas`.

### Task 3: Skills de UI del juego

**Files:** Create `skills/game-ui-art-director/`, `skills/ue-umg-ui/`, `skills/ue-visual-qa/` (cada una `SKILL.md`, `references/`, `evals/` con 2 casos, `LICENSE`); Modify `skills/nomos/scripts/nomos.ts` (`skills install`), `skills/nomos/SKILL.md`; Test `tests/service/skills-install.test.ts`.

- `ue-umg-ui` y `ue-visual-qa` se completan a partir de los esqueletos del jam; `game-ui-art-director` se crea: lee el estilo 3D del workspace (assets del catálogo, paleta de materiales) y escribe `docs/ui-direction.md` (tipografía, paleta, espaciado, iconografía, jerarquía, estados de foco y mando) con ejemplos concretos; criterios de `ue-visual-qa`: contraste AA, escalado DPI, superposiciones, foco visible, navegación con mando, texto truncado, 1280×720 y 1920×1080.
- `nomos skills install --data .nomos`: copia (o junction si está disponible) `skills/{game-ui-art-director,ue-umg-ui,ue-visual-qa}` a `<juego>/.claude/skills/` sin sobrescribir cambios locales (compara hash; si difiere, deja `.nomos-skill.new` y avisa); `/nomos` lo ejecuta al arrancar. `installedSkills` ya los verá.
- skillsmith ≥ 90 en cada skill nueva; ≥ 95 en `nomos`.

- [ ] Pruebas: instalación idempotente en una carpeta temporal; no sobrescribe un `SKILL.md` modificado; skillsmith.
- [ ] Commit `feat: skills de dirección de arte UI, construcción UMG y QA visual`.

### Task 4: Ciclo UMG

**Files:** Create `service/src/checks/umg.ts`, `service/src/checks/png.ts`, `service/src/handlers/ui-cycle.ts`, `service/unreal/nomos_widgets.py`, `skills/nomos/references/{ui-ciclo,brief-qa-visual}.md`; Modify `service/src/handlers/review-start.ts` (rol `qa`), `service/src/handlers/review-finish.ts` si hace falta; Test `tests/service/{ui-cycle,png}.test.ts`.

**Interfaces:**
- `ui.cycle {taskId, runId, widgets?: string[], resolutions?: [[1280,720],[1920,1080]], map?}`: se encola automáticamente tras `run.finished` de una tarea con `area: 'ui'` (desde `worker-poll`/`review-finish`, donde hoy se decide la revisión) y a mano por `POST /commands`. Dentro de `withEditor`: por resolución, `nomos_pie_capture.py` en modo render con `NOMOS_UI=1` (PIE, espera a que `nomos_widgets.py` liste al menos un widget en el viewport o 20 s, `take_high_res_screenshot`) y `NOMOS_UI=0` (misma escena con los widgets `collapsed` por Python: captura de control); `pixelDiffRatio(conUI, sinUI) ≥ 0.005` o `umg failed` «la captura no contiene la UI» (Review Focus 2). Artefactos `screenshot` con `provenance {resolution, map, widget}`; luego encola `review.start {taskId, implementerRunId, role: 'qa'}`.
- `review-start.ts` con `role: 'qa'`: brief `references/brief-qa-visual.md` (capturas, criterios de `ue-visual-qa`, formato `NOMOS_REVIEW {verdict, findings[]}`), skills `skillsForRole('qa')`; aprobado → `recordTestRun {check: 'umg', result: 'passed'}`; rechazado → `review-finish` reenvía los hallazgos al implementador como ya hace, y `umg` queda `failed` hasta el siguiente ciclo.
- Si el PIE con render no puede capturar en este equipo (sin pantalla, driver, etc.), alternativa documentada en el plan y en el informe: `UnrealEditor.exe <uproject> -game -windowed -ResX -ResY -ExecCmds="HighResShot 1280x720"` con el HUD del juego; se prueba primero la vía de Python.

- [ ] Pruebas con el editor falso (escribe PNGs sintéticos distintos/iguales): captura sin UI → `failed`; dos resoluciones → dos artefactos; rechazo del QA reenvía hallazgos; aprobación crea `TestRun umg passed`; `png.ts` decodifica RGBA de una PNG generada en la prueba y calcula la diferencia.
- [ ] Commit `feat: ciclo UMG con capturas y QA visual`.

### Task 5: Panel: pruebas y evidencia

**Files:** Modify `panel/src/views/TaskTabs.tsx` (`TestsTab`), `panel/src/views/Entregas.tsx`, `panel/src/views/Capacidades.tsx`, `panel/src/lib/tasks.ts`; Test `panel/src/views/TestsTab.test.tsx`, `Entregas.visual.test.tsx` (ampliar), e2e `panel/e2e/pruebas.spec.ts`.

- `TestsTab`: tabla `comprobación · resultado · commit (7) · motor · mapa · config · fecha · evidencia` con el glifo de estado del registro (`taskState/probando` para `running`, `done` para `passed`, `bloqueada` para `failed`, texto corto para `skipped` y `unavailable`: no hay icono claro) y enlace a cada artefacto; botón «Lanzar pruebas» (`POST /tasks/:id/checks`, `useAction`) y, cuando hay Decisión por comprobación no disponible, la tarjeta de Decisión en línea. Entregas: capturas con etiqueta de resolución y mapa, agrupadas por tarea. Capacidades: editor por proyecto con «libre / ocupado por <agente>» (avatar del hito 9).
- Dieta de texto del hito 9: la fila de la tabla ≤ 7 palabras visibles; lo largo en tooltip.

- [ ] Pruebas Vitest de la tabla y del estado `unavailable` con Decisión; e2e: lanzar pruebas desde la pestaña y ver aparecer la fila `running` por SSE; capturas `pruebas-5-1366.png`, `entregas-5-1366.png`, `capacidades-5-1366.png` y 1920 en `docs/capturas-5/`.
- [ ] Commit `feat: pestaña Pruebas y evidencia en Entregas`.

### Task 6: Aceptación real

**Files:** Create `docs/aceptacion-hito5.md`; Modify `docs/estado-entregas.md`, `skills/nomos/SKILL.md` (sección «Pruebas y UI» ≤ 10 líneas), `skills/nomos/references/evidencia.md`.

- En `KratosFabTest` (Blueprint, UE 5.8.3), con **workers Claude** y el director por CLI: petición «Añade un HUD con barra de vida que baje al pulsar H». Esperado: tarea `ui` → worker con `ue-ui-umg-slate` + `game-ui-design` + `ue-umg-ui` y `docs/ui-direction.md` previo de `game-ui-art-director` → `run.finished` → `ui.cycle` con capturas a dos resoluciones → run `qa` de Claude → `TestRun umg passed` → revisión → `probando` → `integrando`. Prueba 7: forzar un fallo (texto ilegible o captura sin UI) y ver que vuelve al responsable con los hallazgos. Prueba 8: cada captura con su run y revisión en Entregas. Prueba 29: `unreal_mcp_conflict` con un `.mcp.json` de prueba. Una compilación C++ real (añadir un `.cpp` trivial o usar un proyecto C++ temporal) para `cpp` con éxito y con error. Prueba real única del MCP vivo (`StartServer`, `GenerateClientConfig ClaudeCode`, `list_tools`) anotada sin ser puerta.
- [ ] `docs/aceptacion-hito5.md` con comandos, salidas, seqs de eventos y capturas en `docs/capturas-5/`; commit `docs: cierre del hito 5, Unreal, UI y QA`.

---

## Self-review

- Cobertura: §3.2 (un MCP, cola, Python de respaldo) → Tarea 1 (editor por lotes como base, MCP opcional apagado); plan v1 §9 → Tarea 2; §3.7 y ciclo obligatorio → Tareas 3 y 4; §3.8 parcial (packaging básico; Gauntlet, Insights y regresión visual en el hito 7) → Tarea 2 `build`; hito 5 criterio → Tarea 6; pruebas 7, 8, 28, 29.
- Review Focus 1, 4 → Tarea 1; 2 → Tarea 4; 3, 5, 6 → Tarea 2.
- Diferencias respecto a la versión anterior y por qué: el editor vivo por MCP deja de ser la base (experimental, sin plugin de Claude Code instalado, sin prueba real en este equipo) y se sustituye por el editor por lotes con render que ya funciona desde el hito 4; el run de QA reutiliza la revisión del hito 3 en vez de un mecanismo nuevo; la comparación de píxeles se hace con un decodificador PNG propio para no añadir dependencias; `AgentAvatar`/glifos del hito 9 se reutilizan en Capacidades y Pruebas.
- Hito 5b pausado por el usuario; nada de personajes ni animación aquí.
