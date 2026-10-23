# Kratos · Hito 5 «Unreal, UI del juego y QA» · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> Se refina antes de despachar con el código de los hitos 0-4 delante y con el MCP de Unreal instalado y comprobado en el motor real.

**Goal:** Que una petición produzca un cambio real dentro de Unreal con evidencia (compilación, prueba, captura o build), que toda pantalla UMG pase el ciclo crear → PIE → captura → revisión visual → corregir, y que el panel muestre esas pruebas y capturas con los metadatos del plan (tarea, run, commit, motor, mapa, configuración).

**Architecture:** El servicio gana el adaptador del editor vivo (MCP oficial de Epic, un solo servidor, un escritor por instancia, cola de PIE/importación/captura sobre la reserva `editor:<proyecto>`), un ejecutor de comprobaciones por tipo de cambio (plan v1 §9) que produce `TestRun` y artefactos, y los workers de implementación y UI reciben en su brief las skills de §4 y el contrato de evidencia. El rol QA es un run que ejecuta las comprobaciones y nunca las declara: las ejecuta el servicio y guarda el resultado.

**Tech Stack:** UE 5.8.3 con `ModelContextProtocol` + `AllToolsets` (ya en el motor), plugin de Claude Code `unreal-engine-skills-for-claude-code@claude-plugins-official` (instalar), `UnrealEditor-Cmd` para pruebas (`-ExecCmds="Automation RunTests <filtro>"`, `-ExecutePythonScript`), `RunUAT BuildCookRun` para empaquetar, Screenshot Comparison para regresión visual (hito 7), skills `ue-ui-umg-slate`, `game-ui-design`, `game-ui-ux`, `ue-umg-ui`, `ue-visual-qa`, `game-ui-art-director`, `ue-testing-debugging`, `unreal-packaging`.

**Spec:** `docs/plan-v2.md` §3.2, §3.7, §3.8, §4, plan v1 §7 y §9, hito 5 de §6, pruebas 7, 8, 28 y 29 de §7.

## Global Constraints

- Un único MCP de Unreal: el oficial; Capacidades marca conflicto si aparece otro configurado (prueba 29).
- Una instancia de editor administrada por proyecto, con workspace y endpoint propios; el servicio la arranca (`UnrealEditor.exe <uproject> -ExecCmds="ModelContextProtocol.StartServer"` o la configuración que `GenerateClientConfig` produzca) y la supervisa; toda operación de escritura, PIE, importación o captura pasa por la reserva `editor:<proyecto>`; los workers de texto (C++/Blueprint por código) siguen en paralelo.
- Ninguna tarea pasa de `probando` a `integrando` sin `TestRun` `passed` de las comprobaciones que su tipo exige; `skipped` y `unavailable` se muestran como tales y bloquean con Decisión si la comprobación era obligatoria (prueba 7).
- Toda pantalla UMG termina con captura en PIE a 1280×720 y 1920×1080 con la UI visible e informe de `ue-visual-qa`; sin captura no hay cierre (prueba 28).
- Cada `TestRun` registra tarea, run, commit, versión del motor, mapa, configuración, fecha y archivos de evidencia.
- `game-ui-art-director` escribe `docs/ui-direction.md` por juego antes de la primera pantalla; todo worker de UI lo lee.

## Review Focus

1. El editor administrado se cuelga durante PIE: el ejecutor lo detecta por tiempo máximo (10 min) y por ausencia de latido del MCP, lo mata, libera la reserva y deja `TestRun` `failed` con el log. (Prueba en Tarea 1.)
2. Captura sin widgets (la UI no se montó): `ue-visual-qa` exige que el informe confirme que la imagen contiene la UI (comparación con una captura sin UI del mismo mapa); una captura vacía no aprueba. (Prueba en Tarea 4.)
3. Compilación C++ fallida con 400 líneas de error: `TestRun` guarda el log como artefacto y el evento lleva solo las 30 primeras líneas de error; el worker recibe el archivo. (Prueba en Tarea 2.)
4. Dos tareas piden PIE a la vez: la segunda espera en la cola con motivo visible, no falla. (Prueba en Tarea 1.)
5. Mapa de prueba que depende de contenido no guardado: `Data Validation` sobre los assets tocados corre antes de PIE y bloquea con la lista de assets. (Prueba en Tarea 2.)

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `service/src/adapters/unreal-mcp.ts` | Arrancar/supervisar el editor administrado; cliente MCP (`call_tool`, `list_tools`); latido |
| `service/src/checks/{cpp,blueprint,umg,asset,map,build}.ts` | Una comprobación por tipo de cambio (plan v1 §9) → `TestRun` + artefactos |
| `service/src/checks/select.ts` | De los archivos del diff a la lista de comprobaciones obligatorias |
| `service/src/handlers/{editor,checks,ui}.ts` | `editor.start|stop|capture|pie`, `checks.run`, `ui.cycle` |
| `service/src/unreal/*.py` | Scripts: captura con UI, PIE con tiempo máximo, Data Validation, listado de widgets |
| `skills/kratos/references/{evidencia,ui-ciclo}.md` | Contrato de evidencia; ciclo UMG |
| `skills/{game-ui-art-director,ue-umg-ui,ue-visual-qa}/` | Skills propias (del jam, completadas) instaladas en el workspace del juego |
| `panel/src/views/Entregas.tsx`, `components/TestRuns.tsx`, `TaskDrawer.tsx` | Pestaña Pruebas con los metadatos; capturas con la UI |
| `tests/service/{unreal-mcp,checks,select,ui-cycle}.test.ts` | Pruebas con editor falso |

---

### Task 1: Editor administrado y cola

**Interfaces:** `startEditor(project): {endpoint, pid}` (lee la config que genera `ModelContextProtocol.GenerateClientConfig`), `stopEditor(project)`, `editorAlive(project): boolean`, `withEditor(project, fn)` (toma la reserva `editor:<proyecto>`, arranca si hace falta, ejecuta, libera), `callTool(project, name, args, timeoutMs)`; tiempo máximo y muerte del proceso (Review Focus 1); cola visible en Capacidades («Editor de X: ocupado por tarea Y»).

- [ ] Pruebas con un editor falso (servidor MCP mínimo en `tests/fakes/unreal-mcp.ts`): arranque, `callTool`, cola de dos peticiones (Review Focus 4), cuelgue → kill y reserva liberada.
- [ ] Prueba real una vez: habilitar plugins en `KratosFabTest`, `StartServer`, `GenerateClientConfig ClaudeCode`, `list_tools` devuelve toolsets; registrar en `docs/aceptacion-hito5.md`. Commit `feat: editor administrado y cola de operaciones`.

### Task 2: Comprobaciones por tipo de cambio

**Interfaces:** `selectChecks(files: string[]): CheckId[]` (`.cpp|.h|Build.cs` → `cpp`; `.uasset` de Blueprint → `blueprint`; `WBP_*`/widgets → `umg`; mallas/texturas/materiales → `asset`; `.umap` → `map`; cambios en `Config/Default*.ini` o petición de entrega → `build`); `runCheck(id, ctx): TestRun`:
- `cpp`: `Build.bat <Target>Editor Win64 Development -project=<uproject>`; parseo de errores (Review Focus 3).
- `blueprint`: `kratos_compile_bp.py` compila los Blueprints tocados y comprueba referencias rotas.
- `umg`: ciclo de la Tarea 4.
- `asset`: procedencia, escala, pivote, colisión, materiales, importación (reutiliza `ue-asset-intake` del hito 4).
- `map`: Data Validation de los assets tocados (Review Focus 5), carga del mapa, PIE 60 s con tiempo máximo, captura.
- `build`: `RunUAT BuildCookRun -project -platform=Win64 -clientconfig=Development -cook -stage -pak -archive` y arranque del ejecutable 30 s con captura (hito 7 lo completa con recorrido).
Cada `TestRun` con los metadatos obligatorios; eventos `test.started|passed|failed|skipped|unavailable`.

- [ ] Pruebas: `selectChecks` sobre listas de archivos reales; cada `runCheck` contra ejecutables falsos; metadatos completos.
- [ ] Commit `feat: comprobaciones por tipo de cambio`.

### Task 3: Skills de UI del juego

- [ ] Completar las tres skills propias a partir de los esqueletos del jam (`docs/fab-pruebas` no las tiene; están en `C:\Users\richa\Documents\unreal-game-jam\skills\proposed\ue-umg-ui` y `ue-visual-qa`) y crear `game-ui-art-director` (tipografía, paleta, espaciado, iconografía y jerarquía coherentes con el estilo 3D del workspace; escribe `docs/ui-direction.md`). Cada skill con `SKILL.md`, `references/`, 2 evals; skillsmith ≥ 90.
- [ ] `skillsForRole('ui')` del hito 3 las incluye; se instalan en el workspace del juego por junction o copia con `LICENSE`.
- [ ] Commit `feat: skills de dirección de arte UI, construcción UMG y QA visual`.

### Task 4: Ciclo UMG

**Interfaces:** `ui.cycle {taskId, runId, widgets[], resolutions: [[1280,720],[1920,1080]]}`: tras `run.finished` de una tarea de UI, el servicio (no el worker) hace `withEditor`: compila los widgets, PIE, captura por resolución con la UI visible (`kratos_capture_ui.py`: espera a que los widgets estén en el viewport, captura, y captura de control sin UI para Review Focus 2), guarda artefactos, y encola un run de `ue-visual-qa` (Claude) con las capturas y la lista de criterios (contraste, escalado, superposiciones, foco, mando) que termina con `KRATOS_REVIEW` como el revisor del hito 3; rechazo → `worker.send` al implementador con los hallazgos; aprobación → `TestRun umg passed`.

- [ ] Pruebas con editor falso: captura sin UI → no aprueba; dos resoluciones → dos artefactos; rechazo reenvía hallazgos.
- [ ] Commit `feat: ciclo UMG con capturas y QA visual`.

### Task 5: Panel: pruebas y evidencia

- [ ] Pestaña Pruebas del Drawer: tabla `comprobación · resultado · commit · motor · mapa · config · fecha · evidencia`; estados `pendiente|ejecutando|aprobado|fallido|omitido|no disponible` con icono y texto; Entregas muestra capturas con la UI y su resolución; Capacidades muestra el editor administrado y su cola. Pruebas Vitest de la tabla y del estado `no disponible`; capturas.
- [ ] Commit `feat: pestaña Pruebas y evidencia en Entregas`.

### Task 6: Aceptación real

- [ ] Instalar el plugin de Claude Code de Epic; en `KratosFabTest` (o un proyecto Blueprint nuevo de tercera persona): petición «Añade un HUD con barra de vida que baje al pulsar H». Esperado: tarea de UI → worker con `ue-ui-umg-slate` + `game-ui-design` + `ue-umg-ui` → `run.finished` → ciclo UMG con capturas a dos resoluciones → QA visual → `probando` `passed` → `revisando` aprobada. Prueba 7: forzar un fallo (texto ilegible) y ver que vuelve al responsable. Prueba 8: cada captura con su run y revisión. `docs/aceptacion-hito5.md`; commit.

---

## Self-review

- Cobertura: §3.2 (un MCP, cola, Python de respaldo) → Tarea 1; plan v1 §9 → Tarea 2; §3.7 y ciclo obligatorio → Tareas 3 y 4; §3.8 parcial (packaging básico; Gauntlet, Insights y regresión visual en el hito 7) → Tarea 2 `build`; hito 5 criterio → Tarea 6; pruebas 7, 8, 28, 29.
- Review Focus 1, 4 → Tarea 1; 2 → Tarea 4; 3, 5 → Tarea 2.
- Hito 5b (personajes y animación: Meshy rig/animate → retarget; `MetaHumanGenerator`) se planifica aparte en `2026-10-22-hito5b-personajes-animacion.md` cuando este hito deje el editor administrado funcionando.
