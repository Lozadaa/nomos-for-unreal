# Nomos · Hito 1b «base persistente y shell del panel» · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Actualización 2026-10-23.** Las Tareas 6-10 (panel React) ya no se construyen con Ant Design ni tema claro: su especificación visual y de sensación es `2026-10-23-hito8-interfaz-viva.md` (oscuro, tokens de Vercel, shadcn/ui, View Transitions, lista viva en lugar de Kanban). Las Tareas 1-5 (servicio) no cambian. Las rutas y eventos que estas tareas definen siguen siendo el contrato que el panel consume.

**Goal:** Que el panel completo (franja del director y las diez vistas) funcione sobre una producción semilla determinista, con el modelo de datos del plan v2 persistido en SQLite y una bandeja de comandos (outbox) idempotente, sin necesitar Unreal, Meshy ni Codex.

**Architecture:** El servicio del hito 0 crece con las tablas del modelo (`tasks`, `runs`, `worktrees`, `decisions`, `budgets`, `spends`, `artifacts`, `test_runs`, `catalog_entries`, `commands`) y rutas de lectura; `nomos seed` rellena una producción de demostración; el panel es una SPA React + Ant Design construida con Vite a `panel/dist/` y servida por el propio servicio en `/`, leyendo el tema desde `design/tokens.json` del hito 1a. La página de intercambio del hito 0 pasa a ser la vista Chat.

**Tech Stack:** Servicio: Node ≥ 25 sin dependencias (como el hito 0). Panel: `panel/` con Vite, React 19, TypeScript, `antd` v6, `@ant-design/x` v2 (solo si compila con la versión fijada de antd; si no, chat propio), `@google/model-viewer` (visor GLB), Vitest + Testing Library para lógica de vista. Dependencias de producción solo en `panel/`.

**Spec:** `docs/plan-v2.md` §2.3 (vistas y estados), §2.5 (decisiones de componente), §5.2-5.4 (presupuesto, decisión, semilla), §10 del plan v1 (entidades), hito 1b de §6, pruebas 16, 18 y 24 de §7. Entradas del hito 1a: `design/tokens.json`, `docs/diseno-visual.md`, `docs/diseno/estados.md` (copy), `design/estilo.html`. Entradas del hito 0: `service/src/*`, rutas y eventos de `skills/nomos/references/contrato-eventos.md`.

## Global Constraints

- El hito 0 y el 1a están fusionados en `main` antes de empezar; este plan no modifica sus contratos, los extiende.
- Arranque cotidiano sin servidor de desarrollo: `nomos start` sirve `panel/dist/` ya construido; `npm run build` en `panel/` lo regenera. Vite dev solo para programar.
- El tema de Ant Design se deriva de `design/tokens.json` por código (`panel/src/theme.ts`); ningún color ni sombra escrito a mano en componentes. Copy de la interfaz tomado de `docs/diseno/estados.md`.
- Kanban sin arrastrar y soltar; carriles de Actividad con CSS grid; logs en `Drawer` monoespaciado; visor GLB con `<model-viewer>`; gráficos con cifras y `Progress`; `Ctrl+K` queda para el hito 7.
- Toda ruta nueva exige el token del hito 0; respuestas JSON `charset=utf-8`; 401 sin token.
- `nomos seed` es determinista (misma salida siempre; fechas relativas a un instante fijo `2026-10-22T20:00:00Z`) y se niega a correr sobre una base con tareas salvo `--force`.
- Pruebas: servicio con `node:test`; panel con `vitest` y `tsc --noEmit`; capturas a 1366×768 con barra lateral abierta y 1920×1080 en `docs/capturas-1b/` para cada vista; `npm test` en la raíz ejecuta ambos.
- Puertas de diseño del plan v2 §2.6 al cerrar: auditoría `web-design-guidelines`, `/impeccable critique` y `polish`, `ux-heuristics`, teclado y foco. Resultado en `docs/auditoria-1b-cierre.md`.

## Review Focus

1. Reconexión del panel tras reiniciar el servicio: la SPA debe reanudar el SSE desde su último `seq` y no duplicar tarjetas ni eventos. (Prueba en Tarea 6.)
2. Dos envíos del mismo comando con la misma `idempotency_key` no crean dos filas en `commands` ni dos eventos. (Prueba en Tarea 2.)
3. Decisión caducada: resolver una decisión cuyo `context_hash` cambió debe devolver `409 {"error":"decision_stale"}`. (Prueba en Tarea 3.)
4. A 1366×768 con barra lateral de 248 px, el formulario «Nueva petición» muestra título, primera fila y acción principal sin scroll, y el Drawer de 720 px no tapa la franja. (Captura en Tarea 7.)
5. Catálogo con 30 entradas y una con nombre de 60 caracteres y emoji: la tabla no desborda horizontalmente a 1366 px. (Captura en Tarea 9; la semilla incluye esa entrada.)

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `service/src/schema.ts` | Esquema de las tablas nuevas (se llama desde `openDb`) |
| `service/src/model.ts` | Tipos exportados de todas las entidades |
| `service/src/repo/tasks.ts`, `runs.ts`, `decisions.ts`, `budget.ts`, `artifacts.ts`, `catalog.ts`, `capabilities.ts` | Acceso a datos por entidad (una función por operación) |
| `service/src/commands.ts` | Outbox: `enqueue`, `claim`, `complete`, `fail`, con `idempotency_key` |
| `service/src/seed.ts` | Producción semilla determinista |
| `service/src/routes/*.ts` | Rutas por entidad, registradas en `server.ts` |
| `service/src/static.ts` | Servir `panel/dist/` con `index.html` como fallback de rutas de la SPA |
| `panel/` | Vite + React + antd; `src/theme.ts`, `src/api.ts`, `src/sse.ts`, `src/views/*`, `src/components/*` |
| `tests/service/*.test.ts`, `panel/src/**/*.test.tsx` | Pruebas |
| `docs/capturas-1b/`, `docs/auditoria-1b-cierre.md` | Evidencia de cierre |

Entidades mínimas (columnas; todas con `id TEXT PK`, `created_at`, `updated_at`):

- `tasks`: `title`, `spec` (texto), `acceptance` (JSON lista), `state` (uno de `pendiente|preparada|implementando|revisando|probando|integrando|cerrando|done`), `blocked_reason` (nulo o texto), `decision_id` (nulo o id), `area` (`gameplay|ui|escenarios|assets|animacion|audio|qa|builds`), `assignee_role`, `assignee_provider`, `parent_task_id`, `depends_on` (JSON lista), `worktree_id`, `budget_id`.
- `runs`: `task_id`, `role`, `provider` (`codex|claude|meshy|blender|unreal|nomos`), `model`, `session_ref`, `attempt`, `state` (`running|done|failed|cancelled`), `started_at`, `finished_at`, `summary`, `skills` (JSON lista).
- `worktrees`: `task_id`, `path`, `branch`, `base_commit`, `state` (`active|closing|closed`), `closed_reason`.
- `decisions`: `task_id`, `reason`, `evidence` (JSON lista de `{kind, ref}`), `options` (JSON lista `{id, label, description}`), `chosen_option_id`, `resolved_by`, `resolved_at`, `context_hash`, `state` (`open|resolved|stale`).
- `budgets`: `scope` (`workspace|task`), `scope_id`, `meshy_credits`, `elevenlabs_credits`, `tokens`, `build_minutes`. `spends`: `budget_id`, `run_id`, `kind`, `amount`, `note`.
- `artifacts`: `task_id`, `run_id`, `kind` (`model|texture|screenshot|video|build|report|diff`), `path`, `preview_path`, `provenance` (JSON), `license`.
- `test_runs`: `task_id`, `run_id`, `commit`, `engine_version`, `map`, `config`, `result` (`pending|running|passed|failed|skipped|unavailable`), `report_path`.
- `catalog_entries`: `name`, `category`, `description`, `source` (`fab|megascans|polyhaven|ambientcg|kenney|quaternius|sketchfab|freesound|meshy|blender`), `source_url`, `fab_uid`, `entitlement_uid`, `state` (`owned|downloaded|cached|imported`), `projects` (JSON lista), `formats` (JSON lista), `engine_versions`, `license`, `ai_forbidden` (0/1), `thumbnail_path`, `local_path`, `tags` (JSON lista).
- `commands`: `type`, `payload` (JSON), `idempotency_key UNIQUE`, `state` (`pending|running|done|failed`), `attempts`, `error`, `claimed_by`, `started_at`, `finished_at`.

---

### Task 1: Esquema y tipos

**Files:** Create `service/src/schema.ts`, `service/src/model.ts`; Modify `service/src/db.ts` (llama a `applySchema(db)`); Test `tests/service/schema.test.ts`.

**Interfaces:** Produces `applySchema(db: DatabaseSync): void` idempotente y los tipos `Task`, `Run`, `Worktree`, `Decision`, `Budget`, `Spend`, `Artifact`, `TestRun`, `CatalogEntry`, `Command` con las columnas de arriba en camelCase.

- [ ] Prueba: `openDb(":memory:")` dos veces sobre el mismo archivo temporal no falla; `select name from sqlite_master` contiene las 10 tablas nuevas; `tasks.state` rechaza un valor fuera de la lista (`CHECK`).
- [ ] Implementar; `npm test`; commit `feat: esquema del modelo de producción`.

### Task 2: Outbox de comandos

**Files:** Create `service/src/commands.ts`; Test `tests/service/commands.test.ts`.

**Interfaces:** `enqueue(db, type: string, payload: object, idempotencyKey: string): Command` (devuelve la existente si la clave ya está, sin evento nuevo); `claim(db, workerId: string): Command | undefined` (toma la más antigua `pending`, la pasa a `running`, `attempts + 1`); `complete(db, id, result?: object)`; `fail(db, id, error: string)` (vuelve a `pending` si `attempts < 3`, si no `failed`). Cada transición añade un evento `command.<estado>`.

- [ ] Pruebas: idempotencia por clave (dos `enqueue` → una fila, un evento); `claim` devuelve una sola vez por comando aunque se llame desde dos «workers»; `fail` tres veces → `failed`.
- [ ] Implementar con transacciones (`db.exec("begin")`/`commit`); `npm test`; commit `feat: bandeja de comandos idempotente`.

### Task 3: Repositorios de entidades

**Files:** Create `service/src/repo/{tasks,runs,decisions,budget,artifacts,catalog,capabilities}.ts`; Test `tests/service/repo.test.ts`.

**Interfaces (las que consumen las rutas y hitos siguientes):**
- tasks: `createTask(db, input): Task`, `getTask(db, id)`, `listTasks(db, filter?: {area?, state?})`, `moveTask(db, id, state, reason?)` (añade `task.moved`; `done` solo desde `cerrando`), `blockTask(db, id, reason, decisionId?)`.
- runs: `startRun(db, input): Run` (`run.started`), `finishRun(db, id, state, summary)`.
- decisions: `openDecision(db, input): Decision` (calcula `context_hash = sha256(taskId + ':' + últimoSeqDeLaTarea)`, añade `decision.opened`), `resolveDecision(db, id, optionId, by): Decision` (lanza `Error("decision_stale")` si el hash actual difiere; añade `decision.resolved`), `listDecisions(db, state?)`.
- budget: `ensureBudget(db, scope, scopeId, limits)`, `spend(db, budgetId, runId, kind, amount, note)` (lanza `Error("budget_exceeded")` y abre una Decisión si se supera), `budgetSummary(db, scope, scopeId): {limits, spent, remaining}`.
- artifacts: `addArtifact(db, input)` (`artifact.created`), `listArtifacts(db, filter?)`; test_runs: `recordTestRun(db, input)`.
- catalog: `upsertEntry(db, input)`, `searchCatalog(db, q: string, filter?)` con FTS5 (`create virtual table catalog_fts using fts5(name, description, tags, content='catalog_entries', content_rowid='rowid')`), `listCatalog(db, filter?)`.
- capabilities: `detectCapabilities(env = process.env, fs = node:fs): Capability[]` con `{id, label, state: 'ausente'|'detectado'|'comprobado'|'roto', detail}` para: `node` (versión ≥ 25), `unreal` (existe `C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe` o la ruta de `.nomos/config.json`), `unreal_mcp` (plugins `ModelContextProtocol` y `AllToolsets` en el motor), `fab_plugin`, `launcher` (ejecutable del Launcher), `meshy` (`MESHY_API_KEY` presente), `blender` (ejecutable en PATH o config), `git`. En este hito solo `ausente|detectado`; `comprobado` llega cuando cada adaptador se pruebe.

- [ ] Pruebas por módulo con los casos de Review Focus 3 (`decision_stale`) y `budget_exceeded` abre Decisión; `moveTask` a `done` desde `implementando` lanza `Error("invalid_transition")`; `searchCatalog("personaje fantasía")` encuentra por descripción.
- [ ] Implementar; `npm test`; commit por módulo o uno `feat: repositorios de tareas, runs, decisiones, presupuesto, artefactos, catálogo y capacidades`.

### Task 4: Semilla determinista

**Files:** Create `service/src/seed.ts`; Modify `service/src/cli.ts` (subcomando `seed [--force]`); Test `tests/service/seed.test.ts`.

**Interfaces:** `seed(db, opts?: {force?: boolean, now?: Date}): {tasks: number, runs: number, events: number, catalog: number}`; lanza `Error("not_empty")` si hay tareas y no `force`.

Contenido fijo: 12 tareas (una por área al menos; reparto: dos en `pendiente`, dos en `preparada`, dos en `implementando`, dos en `revisando`, una en `probando`, una en `integrando`, una en `cerrando` con `blocked_reason: "No se pudo retirar el worktree: archivos sin registrar"` y una en `done`; una de las de `preparada` está `bloqueada` por la decisión abierta «Elegir personaje base: 3 candidatos del catálogo»), 3 runs (`codex` implementando, `claude` revisando, `meshy` generando con `state: running`), 1 worktree activo, 2 presupuestos (workspace y la tarea de Meshy, con 60 % gastado), 30 entradas de catálogo (incluye «Advanced Cel Shader Lite», «Free_Tennisball», «Nude_Tennis_Racket_🎾», dos MetaHuman de Megascans, una con `license: null`, una `ai_forbidden: 1`, una con nombre de 60 caracteres), 4 artefactos (modelo GLB de ejemplo copiado a `.nomos/artifacts/`, dos capturas, un informe), 2 test_runs (`passed`, `failed`), 60 eventos repartidos en la hora anterior a `now` con carriles Nomos/Codex/Claude Code/Meshy/Blender/Unreal/builds.

- [ ] Pruebas: dos `seed` sobre bases distintas producen los mismos ids y títulos (determinismo: ids `seed-task-01`…); `seed` sin `force` sobre base poblada lanza `not_empty`; cuentas exactas.
- [ ] Implementar; `npm test`; commit `feat: producción semilla determinista`.

### Task 5: Rutas de lectura y acción

**Files:** Create `service/src/routes/{tasks,decisions,budget,artifacts,catalog,capabilities,commands}.ts`; Modify `server.ts` (registro); Test `tests/service/routes.test.ts`.

**Interfaces (todas con token):** `GET /tasks?area=&state=`, `GET /tasks/:id` → `{task, runs, events, artifacts, testRuns, decision}`, `POST /tasks` `{title, spec, area, acceptance[]}` → 201 (en este hito solo crea en `pendiente`; Nomos la tomará en el hito 2), `GET /decisions?state=`, `POST /decisions/:id/resolve` `{optionId, by}` → 200 o `409 decision_stale`, `GET /budget?scope=&scopeId=`, `GET /artifacts?taskId=`, `GET /artifacts/:id/file` (sirve el archivo con `Content-Type` por extensión; solo rutas dentro de `.nomos/artifacts/`), `GET /catalog?q=&source=&state=`, `GET /capabilities`, `GET /commands?state=`, `POST /seed` `{force?}` → 201 cuentas.

- [ ] Pruebas: cada ruta 401 sin token; `GET /tasks/:id` compone las partes; `POST /decisions/:id/resolve` con hash viejo → 409; `GET /artifacts/:id/file` rechaza `..` (400); `GET /catalog?q=tenis` devuelve 2.
- [ ] Implementar; `npm test`; commit `feat: rutas del modelo de producción`.

### Task 6: Panel: proyecto, tema, API y SSE

**Files:** Create `panel/` (Vite + React + TS), `panel/src/theme.ts`, `panel/src/api.ts`, `panel/src/sse.ts`, `panel/src/store.ts`; Modify `service/src/static.ts` y `server.ts` (servir `panel/dist/`, fallback a `index.html` para rutas de la SPA, mantener `/health`, `/status`…); raíz `package.json` script `test` ejecuta `node --test` y `npm --prefix panel test`, script `build` construye el panel.

**Interfaces:**
- `theme.ts`: `buildTheme(tokens: Tokens): ThemeConfig` mapea `color.primary → colorPrimary`, `color.bgLayout → colorBgLayout`, `color.bgContainer → colorBgContainer`, `radius.md → borderRadius`, `shadow.1 → boxShadow`, `shadow.2 → boxShadowSecondary`, `font.sans → fontFamily`, `size.md → fontSize`, `layout.control → controlHeight`; `tokens` se importa de `../../design/tokens.json`.
- `api.ts`: `createApi(baseUrl, token)` con una función por ruta de las Tareas 5 y del hito 0, `fetch` con cabecera `Authorization`.
- `sse.ts`: `subscribe(baseUrl, token, sinceSeq, onEvent): () => void` con reconexión a los 2 s desde el último `seq`.
- `store.ts`: estado con `useSyncExternalStore` (sin librería): `status`, `tasks`, `events`, `decisions`, `lastSeq`; `applyEvent(state, event)` reduce `task.created|task.moved|run.started|artifact.created|decision.opened|decision.resolved|message.*|reply.*`.
- Token: la SPA lo lee de `location.hash` (como el hito 0) y lo guarda en `sessionStorage`.

- [ ] Pruebas Vitest: `buildTheme` devuelve los valores del JSON; `applyEvent` mueve una tarjeta de columna con `task.moved`; `subscribe` reanuda con `since=<lastSeq>` tras un cierre (mock de `EventSource`). Prueba `node:test`: `GET /panel/produccion` (ruta SPA) devuelve `index.html` cuando `panel/dist` existe.
- [ ] Implementar; `npm run build`; `npm test`; commit `feat: panel React con tema desde tokens, API y SSE`.

### Task 7: Franja, barra lateral, Producción y Chat

**Files:** Create `panel/src/App.tsx`, `panel/src/components/{DirectorBar,Sidebar,TaskCard,TaskDrawer,NewRequestForm}.tsx`, `panel/src/views/{Produccion,Chat}.tsx`.

Fijado: barra lateral 248 px colapsable a 64 px (`Ctrl+B`) con las 9 vistas más `/estilo` en desarrollo; cabecera 64 px con título de la vista y la franja del director (los 5 estados y copy de `estados.md`, con icono además de color); Kanban de 8 columnas con `Card`, tarjeta con responsable, proveedor, dependencias, run, worktree, última actividad y estado de pruebas, badges `bloqueada` y `decisión`; `TaskDrawer` de 720 px con pestañas Resumen · Chat · Pruebas · Assets · Timeline (Cambios llega con el hito 2) y acción «Pedir cambios al responsable» deshabilitada con tooltip «Disponible cuando haya workers»; `NewRequestForm` en `Modal` con título, descripción y área, que cabe en 1366×768; vista Chat = página de intercambio del hito 0 en React (mensajes, estados `Enviado`/`Recibido por Nomos`/respuesta).

- [ ] Pruebas Vitest: `DirectorBar` muestra el copy correcto para cada `Status`; `TaskCard` muestra badge «Decisión pendiente» cuando `decision_id`; `NewRequestForm` no envía con título vacío.
- [ ] Capturas con el navegador integrado a 1366×768 (barra abierta) y 1920×1080: `produccion-1366.png`, `produccion-drawer-1366.png`, `nueva-peticion-1366.png`, `chat-1366.png`, y sus `-1920`. Comprobar Review Focus 4.
- [ ] `npm test`; commit `feat: franja del director, barra lateral, Producción y Chat`.

### Task 8: Actividad, Decisiones, Presupuesto y Capacidades

**Files:** Create `panel/src/views/{Actividad,Decisiones,Presupuesto,Capacidades}.tsx`, `panel/src/components/{Lanes,DecisionCard}.tsx`.

Fijado: Actividad con grid CSS de 7 carriles (Nomos, Codex, Claude Code, Meshy, Blender, Unreal, builds) × tiempo, eventos como `Tag` clicables que abren el Drawer de su tarea, filtro por tarea/run, y «qué evento originó el siguiente» mostrando `correlation` al pasar el ratón; Decisiones como lista de `DecisionCard` con evidencia (miniaturas si son capturas) y botones por opción → `POST /decisions/:id/resolve`, estado `stale` con botón «Regenerar» deshabilitado hasta el hito 2; Presupuesto con tres cifras y `Progress` por presupuesto; Capacidades como tabla `id · estado · detalle` con los 4 estados.

- [ ] Pruebas Vitest: `Lanes` coloca un evento en el carril de su `source`; `DecisionCard` deshabilita opciones cuando `state !== 'open'`; resolver con 409 muestra «Esta decisión caducó: el contexto cambió».
- [ ] Capturas de las cuatro vistas a ambas resoluciones.
- [ ] `npm test`; commit `feat: Actividad, Decisiones, Presupuesto y Capacidades`.

### Task 9: Entregas, Catálogo y `/estilo`

**Files:** Create `panel/src/views/{Entregas,Catalogo,Estilo}.tsx`, `panel/src/components/ModelViewer.tsx`.

Fijado: Entregas como galería (`Image.PreviewGroup` para capturas, `<model-viewer>` para `.glb` con rotación y zoom, tarjetas de build e informe) con filtro por tarea y enlace a tarea, run, revisión y pruebas; Catálogo como `Table` con búsqueda (`GET /catalog?q=`), filtros por fuente y estado, columnas nombre (elipsis + tooltip), fuente, estado, licencia (icono de aviso si nula; «IA prohibida» si `ai_forbidden`), proyectos, y botón «Preparar para Unreal» que crea una tarea de área `assets` en `pendiente`; estado vacío «Aún no se ha indexado nada» + «Indexar ahora» (deshabilitado hasta el hito 4); `/estilo` replica `design/estilo.html` con componentes reales de antd y todos los estados.

- [ ] Pruebas Vitest: `Catalogo` muestra el aviso de licencia desconocida y la etiqueta «IA prohibida»; «Preparar para Unreal» llama a `POST /tasks` con `area: "assets"`.
- [ ] Capturas de las tres vistas; comprobar Review Focus 5.
- [ ] `npm test`; commit `feat: Entregas, Catálogo y /estilo`.

### Task 10: Cierre del hito

- [ ] Integrar `nomos start` con el panel: tras arrancar, abre `http://127.0.0.1:8780/#token=…` y la SPA carga Producción; `nomos seed` desde la CLI deja el panel entero navegable (prueba 16).
- [ ] Puertas §2.6: auditoría `web-design-guidelines` sobre `panel/src`, `/impeccable critique` y `polish` sobre Producción y Catálogo, `ux-heuristics` Quick Diagnostic, recorrido con teclado (prueba 24) y foco visible. Corregir y recapturar.
- [ ] Escribir `docs/auditoria-1b-cierre.md` (puertas, hallazgos, corregidos, pendientes, capturas) y la tabla de estado del hito en `docs/estado-entregas.md`.
- [ ] `npm test` y `npm run build` en verde; commit `docs: cierre del hito 1b`.

---

## Self-review

- Cobertura: §2.3 → Tareas 7-9 (las diez vistas); §2.5 → fijado en Global Constraints y tareas; §5.2 → Tarea 3 budget; §5.3 → Tarea 3 decisions con caducidad; §5.4 → Tarea 4; entidades del plan v1 §10 → Tareas 1 y 3; hito 1b criterios (reiniciar conserva datos: SQLite en disco desde el hito 0; shell con `seed`) → Tareas 4 y 10; pruebas 16, 18 (estados reproducibles desde `/estilo` + auditoría), 24 → Tareas 9 y 10.
- Nombres consistentes entre repos, rutas, `api.ts` y `applyEvent`.
- Review Focus 1 → Tarea 6; 2 → Tarea 2; 3 → Tareas 3 y 5; 4 → Tarea 7; 5 → Tareas 4 y 9.
- Lo que este plan deja abierto a propósito: si `@ant-design/x` v2 no compila con antd v6 fijado, el Chat usa `List` + `Input.TextArea` (decisión ya tomada en el plan v2 §2.5).
