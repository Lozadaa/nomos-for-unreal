# Nomos · Hito 4 «catálogo y extracción Fab, Meshy y Blender» · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Refinado 2026-10-23** con el código real de los hitos 0-3 y 8-9 en `main` (reservas, planificador, bandeja de comandos, catálogo con FTS5, capacidades, panel con glifos y avatares). Los hallazgos de Fab están comprobados en `docs/fab-pruebas/informe-nivel1.md` e `informe-nivel2.md`. Regla del usuario vigente: **ningún worker Codex**; los workers reales son Claude (`provider: 'claude'`) y la aceptación se hace con ellos.

> **CORRECCIÓN 2026-10-23 (Meshy, manda sobre la Tarea 5).** El usuario decidió: «No haremos animaciones en meshy just hard surface pawns». Meshy se usa **solo para piezas hard surface** (props, vehículos, armas, piezas mecánicas, pawns rígidos) por `text-to-3d`, `image-to-3d` y `remesh`; **no hay `rig` ni `animate`** en el adaptador ni en el handler (`kind ∈ text|image|remesh`; cualquier otro valor → `meshy_kind_not_allowed`), y nunca se generan personajes ni formas orgánicas: eso sale del catálogo (Fab, MetaHuman, packs con esqueleto). La política de `references/assets.md` lo dice con esas palabras y la aceptación (4) genera un prop hard surface, no un personaje. El hito 5b (personajes y animación) queda **pausado** por decisión del usuario.

**Goal:** Que Nomos sepa qué assets ya tienes, los lleve a cualquier proyecto Unreal sin volver a descargarlos, consiga los que compraste y nunca bajaste con la menor intervención posible, y solo genere con Meshy cuando el catálogo no sirva; todo dentro de presupuesto y con licencia registrada.

**Architecture:** Un indexador en el servicio (puerto de `docs/fab-pruebas/index.py`) alimenta `catalog_entries` desde `Content/<pack>` y `Content/Fab` de cada proyecto, la caché de packs del Launcher (`VaultCache/<AppName>/data/Content`), la caché del plugin Fab (`%TEMP%\FabLibrary`, zips por AssetId), Megascans Library y los metadatos de `listings_v1.db` (leída desde una copia). Tres niveles de extracción (plan v2 §5.6): nivel 1 copia packs ya presentes al proyecto y los verifica con el editor sin GUI (puerto de `verify_pack.py`); nivel 2 abre el Launcher, da las instrucciones exactas y detecta la llegada del pack por log y por VaultCache; nivel 3 (`ue-asset-cli`) apagado por defecto y solo documentado. Meshy entra por su API REST con `fetch` como run `provider: 'meshy'` con presupuesto; Blender lo usa el worker de arte con el pack de skills ya instalado. **Todo trabajo de asset es un comando de la bandeja** (`enqueue` + handler), nunca una llamada síncrona desde la ruta.

**Tech Stack:** Servicio Node ≥25 sin dependencias (`node:sqlite`, `node:test`, `fetch`, `child_process`), `UnrealEditor-Cmd.exe -ExecutePythonScript -NullRHI`, panel Vite + React 19 (hito 8-9). Sin MCP de Meshy en el servicio: su servidor MCP solo envuelve la misma REST y añadiría una dependencia; la skill puede seguir usando el MCP en la sesión de Claude. Computer use para el nivel 2 solo en la sesión de Claude, nunca desde el servicio.

**Spec:** `docs/plan-v2.md` §5.6, §5.2, §3.4-3.5, hito 4 de §6, pruebas 19, 23, 26, 27, 31-35 de §7; `docs/fab-pruebas/*`.

## Contratos reales que este plan usa (no reescribir)

- **Bandeja de comandos** `service/src/commands.ts`: `enqueue(db, type, payload, idempotencyKey, {notBefore?})`, `claim/complete/fail/defer`. El ejecutor `service/src/runner.ts` llama `handlers[type](command, ctx)` con `ctx: WorkerContext = {db, orca, git, dataDir, projectDir}`; un resultado devuelto completa el comando; una excepción lo falla (reintento ×3 salvo tipos `worker.*`/`review.*` y errores `invalid_*`). Hoy solo `worker.start` y `review.start` pueden devolver `{deferred: true, reason}`: **la Tarea 2 generaliza esa comprobación a cualquier handler** (una línea en `runner.ts`, con prueba).
- **Registro de handlers**: `createWorkerHandlers()` en `service/src/handlers/worker.ts`; `server.ts` pasa `opts.runner?.handlers ?? createWorkerHandlers()`. Los handlers de asset se añaden con un `createAssetHandlers()` y se combinan en `server.ts` (`{...createWorkerHandlers(), ...createAssetHandlers()}`).
- **Rutas**: funciones `(ctx: Context) => Promise<boolean>` registradas en la lista de `service/src/routes/index.ts`; `Context = {db, req, res, url, dataDir?}`; helpers `choice/text/id` en `routes/context.ts`; `body(req)` y `json(res, status, data)` en `http.ts`. Hoy **no existe `POST /commands`** (el panel ya lo llama y muestra «Disponible cuando el ejecutor esté listo» ante 404).
- **Reservas** `service/src/leases.ts`: `acquire(db, runId, taskId, paths) → {ok} | {ok:false, conflicts}`, `release(db, runId)`, `leaseWaitReason(conflicts)`. `normalizedPaths` (en `handlers/worker-policy.ts`) **rechaza `:`**, así que la cola del editor se reserva con la ruta sintética **`editor/<NombreProyecto>`**, nunca `editor:<proyecto>`.
- **Presupuesto** `service/src/repo/budget.ts`: `ensureBudget`, `budgetSummary(db, scope, scopeId)`, `spend(db, budgetId, runId, 'meshyCredits', amount, note)` abre la Decisión «Presupuesto agotado» y lanza `budget_exceeded` cuando no alcanza. `spend` exige un **run** existente: por eso la generación Meshy es un `Run` con `provider: 'meshy'` y `role: 'arte'` (el tipo `Provider` ya lo admite), con `metadata.remoteId`, `metadata.kind` y `metadata.stage`. No se crea tabla `asset_jobs`.
- **Catálogo** `service/src/repo/catalog.ts`: `upsertEntry(db, input)` (por `id`), `listCatalog`, `searchCatalog` (FTS5). La Tarea 1 añade `findEntry(db, source, {fabUid|localPath})` para que el indexador sea idempotente. `CatalogEntry.state ∈ owned|downloaded|cached|imported`, `thumbnailPath` y `localPath` son rutas locales.
- **Artefactos**: `addArtifact(db, {taskId, runId?, kind, path, previewPath?, provenance, license})` y `GET /artifacts/:id/file` sirve solo dentro de `<dataDir>/artifacts` con `Content-Security-Policy: sandbox`. El panel carga archivos con `useArtifactSrc` (service worker que convierte `?token=` en cabecera).
- **Configuración** `service/src/config.ts`: `readConfig(dataDir)` lee `<dataDir>/config.json`, valida `concurrency` y devuelve el resto tal cual. Claves nuevas de este hito (todas opcionales): `projectsDir` (defecto `~/Documents/Unreal Projects`), `quarantineProject` (ruta a la carpeta del proyecto cuarentena; defecto `<projectsDir>/KratosFabTest` si existe), `unrealPath` y `blenderPath` (ya las lee `repo/capabilities.ts`), `megascansDir` (defecto `~/Documents/Megascans Library/Downloaded/UAssets`), `launcherLogPath` (defecto `%LOCALAPPDATA%\EpicGamesLauncher\Saved\Logs\EpicGamesLauncher.log`), `assetCli: {enabled: false}`.
- **Decisiones**: `openDecision(db, {taskId, reason, evidence, options})` en `repo/decisions.ts`; `decisionGate(ctx, task, kind, reason, content, options?, canApprove?)` en `handlers/worker-policy.ts` para puertas con hash de contexto.
- **Eventos**: `appendEvent(db, type, messageId, payload)` en `store.ts`. El panel refresca recursos por prefijo de evento (`useResource('/catalog', /^catalog\./)`), y la skill los recibe por `nomos vigila --types`.
- **Panel**: `panel/src/views/Catalogo.tsx` ya tiene tarjeta con `Preparar` → `POST /commands {type:'catalog.prepare'}`; `catalogThumbnailUrl` solo acepta URLs del mismo origen que empiezan por `/`; pastilla de fuente con `<Glyph kind="source">`; `AreaPictogram` como marcador. `Entregas.tsx` ya muestra GLB con `<model-viewer>`.

## Global Constraints

- Nunca cookies del navegador, tokens copiados a mano ni endpoints internos de Fab; `ue-asset-cli` solo como adaptador opcional, apagado, que exige una Decisión para activarse (prueba 35). En este hito **no se implementa**: se documenta el contrato y la Decisión.
- `listings_v1.db` se copia a una carpeta temporal y se abre `?mode=ro`; nunca se escribe nada del Launcher ni de `VaultCache`.
- Política ante una necesidad de asset, en este orden y visible en la Decisión: catálogo propio → tu Fab no descargado (nivel 2) → fuentes CC0 → compra (Decisión) → Meshy dentro de presupuesto (fuera, Decisión).
- `aiForbidden = 1` bloquea usar la entrada como entrada de Meshy image-to-3D o de cualquier generación (prueba 33): el handler rechaza con `asset_ai_forbidden`.
- Toda importación pasa por una tarea de arte con el contrato `ue-asset-intake` (escala, pivote, colisión, materiales, licencia); licencia desconocida → Decisión (prueba 27).
- Los packs del Launcher se añaden siempre al **proyecto cuarentena** y de ahí se migran por nivel 1 al juego (informe nivel 2: `StarterContent` y carpetas no predecibles).
- Verificación sin GUI obligatoria tras cada migración: `verifyPack` con `NOMOS_ROOT` y `NOMOS_REPORT`; `ok: false` deja la tarea en `probando` fallida, no en `revisando`.
- Un solo editor por proyecto y operación: migraciones y verificaciones reservan `editor/<proyecto>`; si está tomada, el handler devuelve `{deferred: true, reason}` y el ejecutor reintenta a los 5 s.
- Lo demás, como los hitos anteriores: cero dependencias npm en el servicio; TypeScript borrable; archivos de ≤ 200 líneas; `127.0.0.1` y token en toda ruta nueva; copy en español; LF; `npm test`, `npm run test:panel`, `npm run build` y Playwright en verde en cada commit; sin push ni merge.

## Review Focus

1. Pack cuyo manifiesto declara 4.20-5.4 («Advanced Cel Shader Lite»): la migración por nivel 1 a 5.8 deja `engineVersions` y el aviso «Publicado para 5.4; verificado en 5.8.3» en el informe y en la tarjeta, sin ocultarlo. (Tarea 3.)
2. Nombre de pack con emoji o espacios (`Nude_Tennis_Racket_🎾`): rutas, FTS y verificación funcionan; Python se invoca con `-X utf8` y el JSON del informe se lee en UTF-8. (Tarea 1 y 2.)
3. El detector del nivel 2 ve aparecer `StarterContent` antes que el pack: solo cierra con `HandleTaskComplete AlertCode=[ok]` en el log del Launcher o tras 30 s sin cambios en `VaultCache`; nunca por `StarterContent`. (Tarea 4.)
4. Job de Meshy que se cobra pero cuya respuesta se pierde: al arrancar, los runs `meshy` en `running` sin `remoteId` confirmado se reconcilian con `listTasks` antes de crear nada; una misma `idempotencyKey` nunca genera dos veces. (Tarea 5.)
5. Enlace de descarga de Meshy vencido (3 días): la copia propia en `<dataDir>/artifacts/meshy/<runId>/` es la que se sirve; si falta, el artefacto queda `previewPath: null` y Entregas muestra «Enlace vencido y sin copia» con botón «Regenerar» que pasa por presupuesto. (Tarea 5.)
6. Dos comandos de asset sobre el mismo proyecto a la vez (migrar y verificar): el segundo se difiere por la reserva `editor/<proyecto>` y no se lanzan dos editores. (Tarea 2 y 3.)

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `service/src/catalog/indexer.ts` | `indexAll(db, config) → {entries, bySource}`; recorre las fuentes y hace upsert idempotente |
| `service/src/catalog/sources/{projects,launcherVault,fabCache,megascans,listings}.ts` | Una fuente por archivo: `scan(config) → CatalogEntryInput[]` |
| `service/src/catalog/paths.ts` | Rutas por defecto (projectsDir, VaultCache, FabLibrary, Megascans, log del Launcher) y lectura de `config.json` |
| `service/src/adapters/unreal-cmd.ts` | `createUnrealCmd({bin?, baseArgs?, timeoutMs?})` → `runPython`, `verifyPack`, `importFile` |
| `service/unreal/nomos_verify.py`, `service/unreal/nomos_import.py` | Puerto de `verify_pack.py` e importación con `AssetImportTask` |
| `service/src/handlers/asset.ts` + `asset-*.ts` | `createAssetHandlers()`: `asset.index`, `asset.migrate`, `asset.prepare`, `asset.request_download`, `asset.detect`, `asset.meshy_generate`, `asset.meshy_poll` |
| `service/src/adapters/launcher.ts` | `openFab()`, `tailLog(path, since)`, `parseCompletion(lines)` |
| `service/src/adapters/meshy.ts` | REST con `fetch`: `textTo3d`, `imageTo3d`, `remesh`, `rig`, `animate`, `getTask`, `listTasks`, `download`, `balance` |
| `service/src/routes/commands.ts` (ampliar) | `POST /commands` con lista blanca de tipos y validación por tipo |
| `service/src/routes/catalog.ts` (ampliar) | `GET /catalog/:id`, `GET /catalog/:id/thumbnail`, `GET /downloads` |
| `service/src/migrations.ts` (ampliar) | `migrateAssets`: tabla `downloads` y columna `catalog_entries.verified_engine` |
| `panel/src/views/{Catalogo,Entregas}.tsx`, `shell/CommandMenu.tsx`, `views/Actividad.tsx` | Indexar ahora, Migrar, Preparar, Descargas pendientes, miniaturas reales, Regenerar; eje de horas en Actividad |
| `skills/nomos/references/assets.md`, `SKILL.md` sección «Assets», `evals/07-*.md`, `08-*.md` | Política y niveles para la skill |
| `tests/service/{indexer,unreal-cmd,asset-*,launcher,meshy}.test.ts`, `tests/fakes/{unreal-cmd.mjs,meshy-server.ts}`, `tests/fixtures/fab/*` | Pruebas con fixtures (carpetas temporales con `.uasset` vacíos, JSON y líneas de log reales de `docs/fab-pruebas`) |

---

### Task 1: Indexador

**Files:** Create `service/src/catalog/{indexer,paths}.ts`, `service/src/catalog/sources/*.ts`; Modify `service/src/repo/catalog.ts` (`findEntry`), `service/src/handlers/asset.ts` (`asset.index`), `service/src/routes/commands.ts` (`POST /commands` con `asset.index`); Test `tests/service/indexer.test.ts`, `tests/service/routes-commands.test.ts`.

**Interfaces:**
- `scan(config: AssetConfig): CatalogEntryInput[]` por fuente. `projects`: `Content/Fab/<pack>` (`state: 'imported'`, `projects: [nombre]`, `localPath`, `formats: ['uasset']`) y `Content/<Pack>` cuando el nombre coincide con un `content_dir` de `download_meta` del Launcher; `launcherVault`: `VaultCache/<AppName>/data/Content/<Pack>` + manifiesto (`AppVersion` → `engineVersions`, `state: 'cached'`); `fabCache`: zips de `%TEMP%\FabLibrary` o `FabSettings.CacheDirectoryPath` (`state: 'cached'`, `fabUid` = nombre del zip); `megascans`: `uassetsData.json` (`state: 'downloaded'`, `source: 'megascans'`); `listings`: copia de `listings_v1.db` en modo solo lectura (`owned`, `fabUid`, `entitlementUid`, `aiForbidden`, `thumbnailPath` si la miniatura está en disco, `license` si existe; si no, `null`).
- `indexAll(db, config): {entries: number, bySource: Record<string, number>}`; `findEntry(db, source, key: {fabUid?: string; localPath?: string})` y upsert por esa clave conservando `id`, `license` y `projects` previos (unión).
- `POST /commands` (`routes/commands.ts`): cuerpo `{type, payload, idempotencyKey}`; lista blanca `['asset.index','asset.migrate','asset.prepare','asset.request_download','asset.meshy_generate']` con un validador por tipo (`validators[type](payload)`); tipo fuera de lista → 400 `invalid_command_type`; devuelve 202 `{commandId}` (o el existente si la clave se repite). `asset.index` no lleva payload obligatorio; `idempotencyKey` recomendada `asset.index:<fecha-hora-minuto>`.
- Handler `asset.index`: llama `indexAll`, emite `catalog.indexed {entries, bySource, durationMs}` y devuelve el resumen.

- [ ] Pruebas con fixtures en carpetas temporales: reproduce el recuento del informe nivel 2 (5 packs en proyectos, 1 fila de listings, 2 Megascans); segundo `indexAll` no duplica (`findEntry`); Review Focus 2 con un pack `Nude_Tennis_Racket_🎾`; `listings_v1.db` ausente → fuente vacía sin error; `POST /commands` con tipo fuera de lista → 400; con clave repetida → mismo `commandId`.
- [ ] Panel: botón «Indexar ahora» en la cabecera de Catálogo y entrada «Indexar» de ⌘K habilitada (ambos `POST /commands {type:'asset.index'}` con `useAction`), toast con el recuento al llegar `catalog.indexed`; `Catalogo` usa `useResource('/catalog', /^catalog\./)`. Commit `feat: indexador del catálogo y POST /commands`.

### Task 2: Editor sin GUI como adaptador

**Files:** Create `service/src/adapters/unreal-cmd.ts`, `service/unreal/nomos_verify.py`, `service/unreal/nomos_import.py`, `tests/fakes/unreal-cmd.mjs`; Modify `service/src/runner.ts` (generalizar `deferred`); Test `tests/service/unreal-cmd.test.ts`, `tests/service/runner-deferred.test.ts`.

**Interfaces:**
- `createUnrealCmd(opts: {bin?: string; baseArgs?: string[]; timeoutMs?: number}) → {runPython, verifyPack, importFile}`. `bin` por defecto = `config.unrealPath` o `C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe` (la misma ruta que `repo/capabilities.ts`); en pruebas, `bin = process.execPath` y `baseArgs = [tests/fakes/unreal-cmd.mjs]`, que escribe el JSON de `NOMOS_REPORT` y sale con el código pedido por `NOMOS_FAKE`.
- `runPython(uproject, script, env, timeoutMs = 180_000) → {exitCode, log, reportJson?}`: argumentos `<uproject> -ExecutePythonScript=<script> -unattended -nopause -nosplash -NullRHI -stdout -FullStdOutLogOutput`, `PYTHONUTF8=1` en el entorno, `windowsHide`, mata el proceso al agotar el tiempo (`unreal_timeout`); sin ejecutable → `Error('unreal_missing')`.
- `verifyPack(uproject, root) → VerifyReport` (puerto fiel de `verify_pack.py`, campos `ok, assets[], missing_dependencies[], external_dependencies[], errors[]`, más `engine` leído de `unreal.SystemLibrary.get_engine_version()`); `importFile(uproject, sourceFile, destFolder, name) → {assets: string[]}` con `AssetImportTask` (`automated = true`, `save = true`).
- `runner.ts`: cualquier handler que devuelva `{deferred: true, reason: string}` difiere el comando (hoy solo `worker.start`/`review.start`).

- [ ] Pruebas: parseo del informe con el ejecutable falso; tiempo máximo (`NOMOS_FAKE=hang` → `unreal_timeout` y proceso muerto); `unreal_missing`; `runner` difiere un handler `asset.*` que devuelve `deferred`. Prueba real una vez sobre `KratosFabTest` (`verifyPack` del pack `AdvancedCelShader`, ~10 s) y su salida en `docs/aceptacion-hito4.md`.
- [ ] Commit `feat: editor sin GUI como adaptador`.

### Task 3: Nivel 1: migrar y preparar

**Files:** Create `service/src/handlers/asset-migrate.ts`, `asset-prepare.ts`; Modify `service/src/migrations.ts` (`migrateAssets`: `catalog_entries.verified_engine text`), `service/src/routes/catalog.ts` (`GET /catalog/:id`, `GET /catalog/:id/thumbnail`), `panel/src/views/Catalogo.tsx`; Test `tests/service/asset-migrate.test.ts`, `asset-prepare.test.ts`, `routes-catalog-files.test.ts`, `panel/src/views/Catalogo.actions.test.tsx`.

**Interfaces:**
- `asset.migrate {entryId, targetProject?}` (`targetProject` por defecto = el juego, `ctx.projectDir`): origen según `state`/`source` (carpeta del proyecto cuarentena, `VaultCache/<App>/data/Content/<Pack>`, o zip de la caché del plugin descomprimido con `node:zlib` y un lector ZIP propio de ≤ 120 líneas; si el zip no es `store/deflate`, error `zip_unsupported`); copia a `Content/<Pack>` (packs del Launcher) o `Content/Fab/<Pack>` (packs del plugin) **sin sobrescribir**: si el destino existe, `asset_exists` y Decisión «Reemplazar / Conservar»; reserva `editor/<NombreProyectoDestino>` (deferred si ocupada); `verifyPack`; `ok: true` → `state: 'imported'`, `projects` += destino, `verified_engine`, evento `asset.migrated`, artefacto `report` con el JSON; `ok: false` → evento `asset.verify_failed`, entrada sin cambiar; aviso de versión cuando `engineVersions` no incluye la del motor (Review Focus 1). Idempotencia por `migrate:<entryId>:<targetProject>`.
- `asset.prepare {entryId, targetProject?}`: crea una **tarea** de área `assets`, rol `arte`, `provider: 'claude'`, spec con los cinco encabezados de la skill y el contrato `ue-asset-intake` (escala, pivote, colisión, materiales, registro de licencia), `scope` = carpeta destino, `leases` = `[Content/<Pack>]`; si `license` es `null` abre Decisión «Licencia desconocida» (prueba 27) y deja la tarea `pendiente`; si `aiForbidden`, la spec lo declara y prohíbe Meshy. La tarea la arranca el planificador del hito 3 como cualquier otra.
- Rutas: `GET /catalog/:id` (entrada + `verifiedEngine` + `thumbnailUrl: '/catalog/<id>/thumbnail'` cuando `thumbnailPath` existe en disco); `GET /catalog/:id/thumbnail` sirve el archivo con las mismas comprobaciones y CSP que `/artifacts/:id/file`, pero con raíz = la carpeta real de la miniatura (solo `.png/.jpg/.jpeg/.webp`, ≤ 5 MB). `GET /catalog` incluye `thumbnailUrl`.
- Panel: tarjeta con miniatura real vía `thumbnailUrl` usando el mismo mecanismo que `useArtifactSrc` (generalizar a `useAuthedSrc(path)`); botón «Migrar» (si `state` ∈ `cached|downloaded`) y «Preparar» (ya existe; cambia el tipo a `asset.prepare`); estado en línea por eventos `asset.migrated`/`asset.verify_failed` (`useAction` + toast); aviso de versión como texto corto bajo el título.

- [ ] Pruebas: migración de un pack de fixtures a un proyecto temporal con `verifyPack` falso `ok: true` → entrada `imported` y artefacto; `ok: false` → `asset.verify_failed` y sin cambio; destino existente → Decisión; manifiesto `4.20-5.4` → aviso (Review Focus 1); dos migraciones al mismo proyecto → la segunda `deferred` (Review Focus 6); `asset.prepare` con licencia nula → Decisión y tarea `pendiente`; miniatura fuera de la raíz permitida → 400.
- [ ] Commit `feat: migración y preparación de assets (nivel 1)`.

### Task 4: Nivel 2: descargas asistidas

**Files:** Create `service/src/adapters/launcher.ts`, `service/src/handlers/asset-download.ts`; Modify `service/src/migrations.ts` (tabla `downloads(id, entry_id, target_project, state, requested_at, completed_at, detail)`), `service/src/routes/catalog.ts` (`GET /downloads?state=`), `panel/src/views/Catalogo.tsx` («Descargas pendientes»); Test `tests/service/launcher.test.ts`, `asset-download.test.ts`.

**Interfaces:**
- `launcher.openFab()`: `spawn('cmd', ['/c','start','','com.epicgames.launcher://ue/fab'])` con `windowsHide`; `tailLog(path, sinceBytes) → {lines, offset}`; `parseCompletion(lines) → {done: boolean, appName?: string}` buscando `HandleTaskComplete AlertCode=[ok]` y el nombre del pack en las líneas `LogFabViewModel`/`FCommunityPortalVaultCacheInstall` (fixtures copiadas de `informe-nivel2.md`).
- `asset.request_download {entryId, targetProject?}`: crea `Download` (`pending`), abre el Launcher, emite `download.requested {downloadId, entryId, instructions}` con el texto exacto: «Fab › My Library › busca "<título>" › + en la tarjeta › elige el proyecto <cuarentena> › Add to Project; si dice "No compatible user projects", Show all projects y elige 5.4», y encola `asset.detect {downloadId}` con `notBefore` +5 s.
- `asset.detect {downloadId}`: compara una foto de `VaultCache/*/data/Content/*` y el mtime de `listings_v1.db` con la anterior guardada en `downloads.detail`, y lee el log desde el offset guardado; cierra cuando `parseCompletion` da `done` o cuando hay carpeta nueva y 30 s sin cambios (Review Focus 3); entonces indexa (`indexAll`), encola `asset.migrate` desde la cuarentena al proyecto destino y emite `download.completed`; si no ha terminado, devuelve `{deferred: true, reason: 'Esperando al Launcher'}` (el ejecutor reintenta cada 5 s) hasta 20 minutos → `download.timeout` y Decisión «Reintentar / Cancelar».
- Panel: bloque «Descargas pendientes» arriba del catálogo con las instrucciones, el estado y un botón «Ya lo añadí» que solo acelera el siguiente `asset.detect` (`notBefore` ahora). La skill: con Computer use, Nomos da los clics él mismo siguiendo `references/assets.md`; sin él, deja la cola al usuario.

- [ ] Pruebas con fixtures del log real: cierra con `AlertCode=[ok]`; no cierra con solo `StarterContent`; cierra por 30 s sin cambios con carpeta nueva (reloj inyectado); timeout → Decisión; `GET /downloads` lista por estado.
- [ ] Commit `feat: descargas asistidas de Fab (nivel 2)`.

### Task 5: Meshy con presupuesto

**Files:** Create `service/src/adapters/meshy.ts`, `service/src/handlers/asset-meshy.ts`, `tests/fakes/meshy-server.ts` (servidor `node:http` que imita la API); Modify `panel/src/views/Entregas.tsx` («Regenerar»); Test `tests/service/meshy.test.ts`, `asset-meshy.test.ts`.

**Interfaces:**
- `createMeshy({baseUrl = 'https://api.meshy.ai', apiKey = process.env.MESHY_API_KEY, fetch = globalThis.fetch})`: `textTo3d({prompt, mode: 'preview'|'refine', previewTaskId?}) → taskId`, `imageTo3d({imageUrl|imagePath})`, `remesh`, `rig`, `animate`, `getTask(kind, id) → {status, progress, modelUrls?, thumbnailUrl?, creditsUsed?}`, `listTasks(kind, {pageSize}) → Task[]`, `download(url, destFile)`, `balance()`. Rutas y campos se confirman contra docs.meshy.ai al implementar y se anotan en `docs/aceptacion-hito4.md`; sin clave → `meshy_missing_key`. Sin librerías: `fetch` + `node:fs`.
- `asset.meshy_generate {taskId, kind: 'text'|'image'|'remesh'|'rig'|'animate', params, idempotencyKey, estimatedCredits}`: comprueba `aiForbidden` de la entrada origen (`asset_ai_forbidden`), crea `Run {taskId, role: 'arte', provider: 'meshy', metadata: {kind, stage: 'solicitud'}}`, llama `spend(db, budgetId, run.id, 'meshyCredits', estimatedCredits, 'Meshy <kind>')` **antes** de crear el job (si lanza `budget_exceeded`, el run queda `failed` con `summary` y la Decisión ya abierta por `spend` manda); crea el job, guarda `metadata.remoteId`, emite `meshy.job.created` y encola `asset.meshy_poll {runId}` con `notBefore` +10 s.
- `asset.meshy_poll {runId}`: `getTask`; `stage` visible Solicitud → Preview → Refinado → Guardado; al completar descarga modelo, texturas y miniatura a `<dataDir>/artifacts/meshy/<runId>/` (Review Focus 5), crea `CatalogEntry {source: 'meshy', state: 'downloaded', localPath, thumbnailPath, license: 'Meshy (según plan)'}` y artefactos `model` + `texture` con `provenance {provider: 'meshy', remoteId, prompt}`; ajusta el `spend` real si `creditsUsed` difiere; `run.done`; si falla, `run.failed` y evento. Mientras no termina, `{deferred: true, reason: 'Meshy: <status> <progress>%'}`.
- Reconciliación al arrancar el runner (Review Focus 4): `recoverMeshy(db, meshy)` lista runs `meshy` en `running`; los que no tienen `remoteId` se buscan en `listTasks` por el `idempotencyKey` guardado en `metadata` (Meshy no lo devuelve: se compara `prompt` + `createdAt` ± 10 min); si aparecen, se adoptan; si no, el run se marca `failed` «sin confirmar» y nunca se relanza solo.
- Panel: en Entregas, el artefacto `model` de Meshy sin archivo local muestra «Enlace vencido y sin copia» y el botón «Regenerar» (`POST /commands asset.meshy_generate` con la misma `params` y clave nueva).

- [ ] Pruebas con el servidor falso: presupuesto agotado → Decisión y ningún job creado; job completado → archivos copiados y entrada `meshy`; reconexión con run sin `remoteId` → reconciliado sin segundo job; `aiForbidden` → rechazo; enlace vencido (404 del falso) → artefacto sin `previewPath` y evento.
- [ ] Commit `feat: generación con Meshy bajo presupuesto`.

### Task 6: La skill busca antes de generar; panel y cierre

**Files:** Modify `skills/nomos/SKILL.md` (sección «Assets»), Create `skills/nomos/references/assets.md`, `skills/nomos/evals/07-cinco-personajes.md`, `08-licencia-desconocida.md`; Modify `panel/src/views/Actividad.tsx`, `docs/estado-entregas.md`; Create `docs/aceptacion-hito4.md`.

- `references/assets.md`: la política en orden, qué Decisión abre cada paso, el guion de nivel 2 (5 clics + 4 de versión), cuándo entra el worker de arte (`blender-director`, `unreal-export`, `qa-review`, `ue-asset-intake`), y qué comandos envía la skill (`nomos asset index|migrate|prepare|download|generate` como envoltorios de `POST /commands` en `scripts/nomos.ts`). `SKILL.md` ≤ 10 líneas nuevas que remiten a la referencia. skillsmith ≥ 95.
- Panel, ajuste pendiente del hito 9: la vista Actividad gana un **eje de horas** visible bajo los carriles (una marca por hora, etiqueta cada 3 h en Geist Mono 11 px) y los racimos de eventos compactos muestran un **recuento** («×6») en vez de una fila de puntos; la prueba visual existente se amplía.
- Aceptación real (con workers **Claude**, nunca Codex): (1) «Necesito cinco personajes de fantasía estilizados con esqueleto» → la skill lista candidatos del catálogo antes de proponer Meshy (prueba 26); (2) migrar «Advanced Cel Shader Lite» desde `KratosFabTest` al juego sin GUI con `verifyPack` real (prueba 31) y el aviso de versión; (3) una descarga por nivel 2 con el detector real (prueba 32; si no hay asset pendiente de bajar, documentar con un pack gratuito pequeño); (4) una generación Meshy `preview` dentro de presupuesto y una `refine` fuera que abre Decisión (prueba 19; si falta `MESHY_API_KEY`, ejecutar contra el servidor falso y decirlo); (5) licencia desconocida → Decisión (prueba 27). Todo en `docs/aceptacion-hito4.md` con comandos, salidas y capturas en `docs/capturas-4/`.
- [ ] Commit `docs: cierre del hito 4, catálogo y extracción`.

---

## Self-review

- Cobertura: §5.6 niveles 1-3 → Tareas 1-4 (nivel 3 solo documentado con Decisión); §5.2 → Tarea 5; §3.4-3.5 → Tareas 3 y 5; hito 4 criterios → Tarea 6; pruebas 19, 23 (visor ya existe; aquí con modelo Meshy real), 26, 27, 31-35.
- Review Focus 1 → Tarea 3; 2 → Tareas 1-2; 3 → Tarea 4; 4-5 → Tarea 5; 6 → Tareas 2-3.
- Diferencias respecto a la versión anterior del plan y por qué: Meshy por REST con `fetch` (cero dependencias; el MCP solo envuelve la REST); `AssetJob` sustituido por `Run {provider: 'meshy'}` porque `spend` exige un run y el panel ya pinta runs; reserva `editor/<proyecto>` en vez de `editor:<proyecto>` por `normalizedPaths`; `POST /commands` con lista blanca porque el panel ya lo llama; `ue-asset-cli` fuera del código.
- Pendiente del informe nivel 2 que este plan incorpora: fin de copia por log (Tarea 4), pack con C++/plugins (añadir a la aceptación si hay uno en la biblioteca), `FFabMyLibraryContentSource` expuesto a Python (media hora de investigación en la Tarea 1; si expone los listados, se anota y el nivel 1 cubre también lo no descargado).
