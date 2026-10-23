# Kratos · Hito 4 «catálogo y extracción Fab, Meshy y Blender» · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> Se refina antes de despachar con el código de los hitos 0-3 delante. Los hallazgos de Fab de este plan ya están comprobados en `docs/fab-pruebas/informe-nivel1.md` e `informe-nivel2.md`.

**Goal:** Que Kratos sepa qué assets ya tienes, los lleve a cualquier proyecto Unreal sin volver a descargarlos, consiga los que compraste y nunca bajaste con la menor intervención posible, y solo genere con Meshy cuando el catálogo no sirva; todo dentro de presupuesto y con licencia registrada.

**Architecture:** Un indexador (puerto del prototipo `docs/fab-pruebas/index.py` a TypeScript dentro del servicio) alimenta `catalog_entries` desde `Content/<pack>` y `Content/Fab` de cada proyecto, la caché de packs del Launcher (`VaultCache/<Pack>/data/Content`), la caché del plugin Fab del editor (`%TEMP%\FabLibrary`, zips por AssetId), Megascans Library y los metadatos de `listings_v1.db`. Tres niveles de extracción (plan v2 §5.6): nivel 1 copia o migra packs ya presentes y los verifica con el editor sin GUI (puerto de `verify_pack.py`); nivel 2 lleva al usuario o a un agente de escritorio al listing correcto por enlace profundo y detecta la llegada del pack; nivel 3 (`ue-asset-cli`) apagado por defecto. Meshy entra por su MCP oficial como trabajo externo con presupuesto; Blender prepara (escala, pivote, colisión, LOD, FBX) con el pack de skills ya instalado.

**Tech Stack:** Servicio Node (indexador, FTS5 ya creado en 1b, detector de carpetas con `fs.watch`), `UnrealEditor-Cmd.exe -ExecutePythonScript -NullRHI` para verificar e importar, `@meshy-ai/meshy-mcp-server` (clave en el servicio), Blender por MCP desde el worker de arte, `<model-viewer>` en Entregas (1b). Computer use para el nivel 2 solo en la sesión de Claude que lo ejecute, nunca desde el servicio.

**Spec:** `docs/plan-v2.md` §5.6 (catálogo y niveles), §5.2 (presupuesto), §3.4-3.5 (skills de arte y Meshy), hito 4 de §6, pruebas 19, 23, 26, 27, 31-35 de §7, y `docs/fab-pruebas/*`.

## Global Constraints

- Nunca cookies del navegador, tokens copiados a mano ni reimplementar endpoints internos de Fab; `ue-asset-cli` solo como adaptador opcional, apagado, que exige una Decisión para activarse (prueba 35).
- `listings_v1.db` se lee siempre desde una copia y en modo solo lectura; nunca se escribe en nada del Launcher.
- Política ante una necesidad de asset, en este orden y visible en la Decisión: catálogo propio → tu Fab no descargado (nivel 2/3 activo) → fuentes CC0 → compra (Decisión) → Meshy dentro de presupuesto (fuera, Decisión).
- `ai_forbidden = 1` bloquea usar la entrada como entrada de Meshy image-to-3D o de cualquier generación (prueba 33).
- Toda importación Fab pasa por `ue-asset-intake`: escala (la pelota de 2 m del informe nivel 1), pivote, colisión, materiales, y registro de licencia; licencia desconocida → Decisión (prueba 27).
- Los packs del Launcher se añaden siempre a un **proyecto cuarentena** (`.kratos/config.json: quarantineProject`, por defecto `KratosFabTest`) y de ahí se migran por nivel 1 al juego, porque arrastran `StarterContent` y pueden copiar encima (informe nivel 2).
- Verificación sin GUI obligatoria tras cada importación: `verify` con `KRATOS_ROOT` y `KRATOS_REPORT`; `ok: false` deja la tarea en `probando` fallida, no en `revisando`.
- Un solo editor por operación: las importaciones y verificaciones pasan por la cola de editor (reservas del hito 3 sobre `editor:<proyecto>`).

## Review Focus

1. Pack cuyo manifiesto declara 4.20-5.4 (el caso real de «Advanced Cel Shader Lite»): la migración por nivel 1 a 5.8 avisa «Publicado para 5.4; verificado en 5.8.3» y no lo oculta. (Prueba en Tarea 3.)
2. Nombre de pack con emoji o espacios (`Nude_Tennis_Racket_🎾`): rutas, FTS y verificación funcionan; Python se ejecuta con `-X utf8`. (Prueba en Tarea 1.)
3. El detector del nivel 2 ve aparecer `Content/StarterContent` antes que el pack: espera a que `LogFabViewModel`/`HandleTaskComplete AlertCode=[ok]` aparezca en el log del Launcher o a 30 s sin cambios en la carpeta. (Prueba en Tarea 4.)
4. Job de Meshy que se cobra pero cuya respuesta se pierde: al reconectar se consulta `meshy_get_task_status`/`meshy_list_tasks` antes de reintentar; nunca se genera dos veces por el mismo `idempotency_key`. (Prueba en Tarea 5.)
5. Enlace de descarga de Meshy vencido (3 días): la copia propia en `.kratos/artifacts/` es la que se sirve; si falta, Entregas muestra «Enlace vencido y sin copia» con botón «Regenerar» que pasa por presupuesto. (Prueba en Tarea 5.)

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `service/src/catalog/indexer.ts` | Fuentes: proyectos, VaultCache del Launcher, caché del plugin, Megascans, `listings_v1.db` |
| `service/src/catalog/sources/*.ts` | Un módulo por fuente (`projects`, `launcherVault`, `fabCache`, `megascans`, `listings`, `polyhaven`, `ambientcg`) |
| `service/src/adapters/unreal-cmd.ts` | `runPython(project, script, env)`, `verifyPack(project, root)`, `importFile(project, file, dest)` |
| `service/src/unreal/kratos_verify.py`, `kratos_import.py` | Puerto de `verify_pack.py` y de `import_asset` (EditorToolset) |
| `service/src/handlers/asset.ts` | `asset.index`, `asset.migrate` (nivel 1), `asset.request_download` (nivel 2), `asset.detect`, `asset.meshy_generate`, `asset.prepare` |
| `service/src/adapters/{launcher,meshy}.ts` | Enlace profundo y log del Launcher; MCP de Meshy |
| `service/src/routes/{catalog,assets}.ts` | `POST /catalog/index`, `GET /catalog/:id`, `POST /catalog/:id/prepare`, `POST /catalog/:id/migrate`, `POST /catalog/:id/request-download`, `GET /downloads/pending` |
| `panel/src/views/{Catalogo,Entregas}.tsx` | Indexar ahora, Preparar, Migrar, Descargas pendientes, licencia, IA prohibida, visor |
| `skills/kratos/references/assets.md` | Política y niveles para la skill; `ue-asset-intake` como contrato |
| `tests/service/{indexer,unreal-cmd,asset,launcher,meshy}.test.ts` | Pruebas con fixtures (carpetas temporales con `.uasset` vacíos y JSON reales de `docs/fab-pruebas`) |

---

### Task 1: Indexador

**Interfaces:** `indexAll(db, config): {entries, bySource}`; cada fuente exporta `scan(config): CatalogEntryInput[]`. Fuentes y campos: `projects` (`Content/Fab/<pack>` y `Content/<Pack>` que coincidan con un manifiesto del Launcher; `projects: [nombre]`, `state: imported`), `launcherVault` (`C:\ProgramData\Epic\EpicGamesLauncher\VaultCache\<Pack>\data\Content` + manifiesto con `AppVersion` → `engine_versions`, `state: cached`), `fabCache` (`FabSettings.CacheDirectoryPath` o `%TEMP%\FabLibrary\*.zip` → `state: cached`), `megascans` (`uassetsData.json` → `state: downloaded`), `listings` (copia de `listings_v1.db` → `owned`, `fab_uid`, `entitlement_uid`, `ai_forbidden`, `thumbnail`), `polyhaven` y `ambientcg` (API pública, solo bajo demanda con `q`). `upsertEntry` por clave `(source, fab_uid | local_path)`.

- [ ] Pruebas con fixtures: reproduce el conteo del informe nivel 2 (5 packs en proyectos, 1 fila de listings, 2 Megascans) sobre carpetas temporales; Review Focus 2.
- [ ] `POST /catalog/index` encola `asset.index`; botón «Indexar ahora» del panel. Commit `feat: indexador del catálogo`.

### Task 2: Editor sin GUI como adaptador

**Interfaces:** `runPython(projectUproject, scriptPath, env, timeoutMs = 180_000): {exitCode, log, reportJson?}` ejecuta `UnrealEditor-Cmd.exe <uproject> -ExecutePythonScript=<script> -unattended -nopause -nosplash -NullRHI -stdout -FullStdOutLogOutput` con la ruta del motor de Capacidades; `verifyPack(project, root): VerifyReport` (puerto de `verify_pack.py`: `KRATOS_ROOT`, `KRATOS_REPORT`); `importFile(project, sourceFile, destFolder, name): {assets[]}` (script `kratos_import.py` con `AssetImportTask`, el mismo camino que `import_asset` del EditorToolset). Pasa por la reserva `editor:<proyecto>`.

- [ ] Pruebas: con un ejecutable falso de `UnrealEditor-Cmd` (script Node que escribe el JSON de informe) se parsea el informe; tiempo máximo; sin ruta del motor → `Error("unreal_missing")`. Prueba real una vez sobre `KratosFabTest` (10 s esperados).
- [ ] Commit `feat: editor sin GUI como adaptador`.

### Task 3: Nivel 1: migrar y preparar

**Interfaces:** `asset.migrate {entryId, targetProject}`: copia `Content/<Pack>` (o descomprime el zip de la caché, o copia `VaultCache/<Pack>/data/Content`) al proyecto cuarentena o al destino; `verifyPack`; registra `AssetUse`, `projects` y artefacto `report`; aviso de versión (Review Focus 1). `asset.prepare {entryId, targetProject}` crea una tarea de arte con el contrato `ue-asset-intake` (escala, pivote, colisión, materiales, licencia) que el worker de arte ejecuta con el pack de Blender cuando el formato lo exige (GLB/FBX) o directamente en el editor para `.uasset`.

- [ ] Pruebas: migración de un pack de fixtures a un proyecto temporal → `verify` falso `ok: true` → entrada actualizada; pack `4.20-5.4` → aviso; Review Focus 1.
- [ ] Panel: botones «Migrar a…» y «Preparar para Unreal» con selector de proyecto; commit `feat: migración y preparación de assets (nivel 1)`.

### Task 4: Nivel 2: descargas asistidas

**Interfaces:** `launcher.openFab()` (`Start-Process com.epicgames.launcher://ue/fab`), `launcher.tailLog(since): string[]` (`EpicGamesLauncher.log`), `asset.request_download {entryId, targetProject}` → crea `Download` (`pending`), abre el Launcher, publica evento `download.requested` con las instrucciones exactas («Fab › My Library › + en la tarjeta › proyecto cuarentena › Add to Project; si dice “No compatible user projects”, Show all projects y elegir 5.4»), y arranca `asset.detect` que vigila `Content/` del proyecto destino y el log del Launcher hasta `HandleTaskComplete AlertCode=[ok]` o 30 s sin cambios (Review Focus 3), entonces indexa, verifica y cierra la descarga (`download.completed`). Vista Catálogo: «Descargas pendientes» con las instrucciones y estado. La skill: si la sesión tiene Computer use, Kratos puede dar los clics él mismo (guion en `references/assets.md` con los 5 clics + 4 de versión); si no, deja la cola al usuario.

- [ ] Pruebas con fixtures del log real (copiar las líneas de `informe-nivel2.md`): el detector cierra al ver `AlertCode=[ok]`; no cierra con solo `StarterContent`.
- [ ] Commit `feat: descargas asistidas de Fab (nivel 2)`.

### Task 5: Meshy con presupuesto

**Interfaces:** `meshy.ts` sobre el MCP oficial: `textTo3d(prompt, opts) → taskId`, `imageTo3d`, `remesh`, `rig`, `animate`, `getTask(id)`, `listTasks()`, `download(id, dest)`; `asset.meshy_generate {taskId, kind, params, idempotencyKey}`: `spend` antes de crear (fuera → Decisión), crea el job (`AssetJob` con `remote_id`), sondea con reconciliación (`listTasks` al arrancar para recuperar jobs sin `remote_id` confirmado: Review Focus 4), descarga modelo, texturas y miniatura a `.kratos/artifacts/<job>/` al completar (Review Focus 5), crea `CatalogEntry` `source: meshy` y artefactos; cadena visible Solicitud → Preview → Refinado → Guardado → Revisión → Preparación → Importación → Prueba como estados del job en la galería.

- [ ] Pruebas con un MCP de Meshy falso (servidor stdio en `tests/fakes/meshy.ts`): presupuesto agotado → Decisión y sin job; job completado → archivos copiados; reconexión con job huérfano → reconciliado sin segundo job.
- [ ] Commit `feat: generación con Meshy bajo presupuesto`.

### Task 6: La skill busca antes de generar

- [ ] `SKILL.md` sección «Assets» y `references/assets.md`: la política en orden, qué Decisión abre cada paso, el guion de nivel 2, cuándo el worker de arte (`blender-director`, `unreal-export`, `qa-review`, `ue-asset-intake`) entra; eval `07-cinco-personajes.md` (prueba 26) y `08-licencia-desconocida.md` (prueba 27). skillsmith ≥ 95.
- [ ] Aceptación real: «Necesito cinco personajes de fantasía estilizados con esqueleto» → candidatos del catálogo primero; migrar «Advanced Cel Shader Lite» de `KratosFabTest` a otro proyecto 5.8 sin GUI (prueba 31); un asset no descargado por nivel 2 con detector (prueba 32); una generación Meshy pequeña dentro de presupuesto y una fuera que abre Decisión (prueba 19). `docs/aceptacion-hito4.md`; commit.

---

## Self-review

- Cobertura: §5.6 niveles 1-3 → Tareas 1-4 (nivel 3 solo como adaptador apagado con Decisión, documentado en Tarea 6); §5.2 → Tarea 5; §3.4-3.5 → Tareas 3 y 5 (Blender por el worker de arte, Meshy rig/animate expuestos); hito 4 criterios → Tarea 6; pruebas 19, 23 (visor ya en 1b, aquí con modelo Meshy real), 26, 27, 31-35.
- Review Focus 1 → Tarea 3; 2 → Tarea 1; 3 → Tarea 4; 4 y 5 → Tarea 5.
- Pendiente del informe nivel 2 que este plan incorpora: detectar el fin de la copia por log (Tarea 4), pack con C++/plugins (añadir a la aceptación si hay uno en la biblioteca), `FFabMyLibraryContentSource` expuesto a Python (investigación de media hora en Tarea 1; si expone los listados, el nivel 1 cubre también lo no descargado y se anota).
