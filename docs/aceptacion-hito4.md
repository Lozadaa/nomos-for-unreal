# Aceptación real del hito 4 · catálogo y extracción Fab, Meshy y Blender

Fecha: 2026-10-23. Rama `hito4-catalogo`. Equipo: Windows 11, Unreal 5.8.3 en `C:\Program Files\Epic Games\UE_5.8`, Node 25.9.

Juego de destino creado para esta aceptación, vacío y con Git: `C:\Users\richa\Documents\Unreal Projects\KratosJuegoH4`
(copia del `.uproject` y la `Config` de `KratosFabTest`). No se tocaron tus proyectos: CrazyPadel, unknowncall y
KratosFabTest solo se leyeron. Servicio arrancado desde el juego con `kratos start --data .kratos --port 8791 --no-open`
y `config.json` con `concurrency: {claude: 0, codex: 0}`, para que el planificador no lanzara workers por su cuenta.
**Ningún worker Codex.** El director de la aceptación fue esta sesión de Claude (Opus) usando la skill `kratos`.
No se lanzó ningún worker de implementación: los cinco casos se cierran en el servicio y en Decisiones (ver «Pendientes»).

En lo que sigue, `kratos` es `node skills/kratos/scripts/kratos.ts` y `D` es `KratosJuegoH4/.kratos`.

## 1 · Buscar antes de generar (prueba 26)

Petición: «Necesito cinco personajes de fantasía estilizados con esqueleto».

```
$ kratos asset index --data D
{"commandId":"dc700bb2-…","state":"pending"}          → catalog.indexed: 8 entradas (listings 1, launcherVault 1, fabCache 0, projects 6, megascans 2)
$ kratos asset search personaje | character | skeletal  → []
$ kratos asset search fantasy                          → Skybox_Fantasy___View_2 (Fab, importado en CrazyPadel, licencia null)
```

El catálogo de este equipo no tiene personajes con esqueleto (solo dos presets MetaHuman de Megascans, Hudson y
Emory). Respuesta de Kratos según `references/assets.md`: lista lo encontrado, propone el nivel 2 sobre tu biblioteca de
Fab, fuentes CC0 y una Decisión de compra. **No propone Meshy**: personajes y formas orgánicas nunca se generan con
Meshy (corrección del usuario del 2026-10-23), y el servicio rechaza `rig` y `animate` con `meshy_kind_not_allowed`:

```
$ kratos asset generate tarea --kind rig --params-file params.json --credits 5   → Petición rechazada (400): meshy_kind_not_allowed
```

Hallazgo durante la prueba: `asset search tennis` no encontraba `Free_Tennisball`, porque FTS5 solo parte por `_`.
La búsqueda pasa a usar prefijos (`"tennis"*`) y ahora devuelve las dos pelotas y la raqueta (prueba en `indexer.test.ts`).

## 2 · Migrar «Advanced Cel Shader Lite» sin GUI (prueba 31, Review Focus 1)

```
$ kratos asset migrate df80fcd0-b7aa-43f5-b59e-2b900d286e91 --data D
18:02:36 run.started provider unreal · lease.acquired editor/KratosJuegoH4
18:03:07 asset.migrated {"root":"/Game/AdvancedCelShader","engine":"5.8.3","warning":"Publicado para 5.4; verificado en 5.8.3","assets":12,"missing":0}
18:03:07 lease.released · run.finished done «Migrado y verificado. Publicado para 5.4; verificado en 5.8.3»
```

Origen: `VaultCache\Advanceddffcefa302e4V2\data\Content\AdvancedCelShader` (la copia del Launcher, sin volver a
descargar). Destino: `KratosJuegoH4\Content\AdvancedCelShader`; `StarterContent` **no** se copió. Informe en
`D/artifacts/reports/verify-6bf4d6d7-….json`: `ok: true`, motor `5.8.3-58210709+++UE5+Release-5.8`, 12 assets
(World, HLODLayer, Material, MaterialFunction, MaterialInstanceConstant, Texture2D), 0 faltantes, 1 externa (actores del
mapa de ejemplo), 0 errores, `engineVersions: ["5.4"]`. El aviso aparece también en la tarjeta (captura `catalogo-4-*`).
31 s de reloj para copiar y verificar.

Prueba previa del adaptador (Tarea 2) sobre `KratosFabTest`, `verifyPack(…, '/Game/AdvancedCelShader')`: `ok: true`,
12 assets, 0 faltantes, 160 dependencias externas listadas (actores externos del mapa), 37 s (primer arranque del editor).

Dos migraciones más encoladas a la vez (`Free_Tennisball` de CrazyPadel y `Phone` de unknowncall, a `Content/Fab`):
ambas verificadas (`asset.migrated` 18:03:29 y 18:03:43). La reserva `editor/KratosJuegoH4` se tomó y liberó en orden;
no hubo diferido porque el ejecutor procesa una orden a la vez. El diferido por reserva ocupada (Review Focus 6) está
probado con otro titular de la reserva en `asset-migrate.test.ts`, no en esta ejecución real.

## 3 · Nivel 2 con el detector real (prueba 32)

No se hizo una descarga nueva por el Launcher: requiere clics en su web embebida (Computer use no está disponible en
esta sesión de terminal) y no localicé un pack tuyo sin descargar. Lo que sí se ejecutó: el detector real
(`createDetect`) sobre el **log real** del Launcher de la descarga del 23-10 a las 00:45
(`EpicGamesLauncher-backup-2026.10.23-14.40.30.log`, desde el byte 1 020 655, antes del clic), con tu `VaultCache` y
tu `listings_v1.db` reales y una base temporal:

```
resultado: {"state":"completed","by":"log"} en 28 ms
download.completed {"by":"log","appName":"Advanceddffcefa302e4V2","packs":["Advanceddffcefa302e4V2/AdvancedCelShader"],"entries":10}
migración encolada: asset.migrate {"entryId":"261b3443-…"}
```

Hallazgo real que cambió el detector: el log tiene la misma línea `HandleTaskComplete … AlertCode=[ok]` para Fortnite y
para el plugin Fab. Solo cierra si ese AppId apareció antes en `LogFabViewModel: Manifest downloaded`.
`request_download` real (abre el Launcher con `com.epicgames.launcher://ue/fab`) no se ejecutó para no abrir la
ventana sin que estuvieras delante.

## 4 · Meshy: preview dentro de presupuesto y refine fuera (prueba 19)

Con `MESHY_API_KEY` presente; saldo inicial 1000 créditos. Rutas confirmadas en docs.meshy.ai el 2026-10-23:
`POST/GET /openapi/v2/text-to-3d`, `/openapi/v1/image-to-3d`, `/openapi/v1/remesh`, `GET /openapi/v1/balance`;
la creación devuelve `{result: id}`, la tarea trae `status`, `progress`, `model_urls`, `thumbnail_url`,
`texture_urls`, `consumed_credits` y `created_at`; Meshy no devuelve clave de idempotencia (por eso la reconciliación
compara prompt y hora ±10 min).

Prop hard surface, presupuesto de workspace 25 créditos:

```
$ kratos asset generate 54791b9c-… --kind text --params-file preview.json --credits 20 --idempotency-key meshy:…:preview:1
18:06:40 meshy.job.created {"remoteId":"01a169f1-8292-7653-b0ca-3aa47e4d35b2","stage":"Preview"}
18:07:13 command.deferred «Meshy: IN_PROGRESS 91%» · 18:07:19 «Meshy: IN_PROGRESS 99%»
18:07:26 meshy.job.completed {"stage":"Guardado","model":"…\\artifacts\\meshy\\33e79f4e-…\\model.glb"}
GET /budget → spent.meshyCredits 20, remaining 5
```

`model.glb` válido (cabecera `glTF`, 12,7 MB) y `thumbnail.png` en la copia propia; entrada de catálogo `meshy`
con licencia «Meshy (según plan)»; el GLB se ve en Entregas (`entregas-4-*`). Prompt: «rugged military ammo crate,
steel box with latches and stenciled markings, hard surface prop, game asset».

Refine fuera de presupuesto (`--credits 30`, quedan 5): `decision.opened` «Presupuesto agotado: meshyCredits»,
`command.failed budget_exceeded` sin reintentos, **ningún job nuevo** en Meshy (solo hay un `meshy.job.created`).

Antes, por un error mío de Git Bash (`/budget` convertido en ruta de Windows) el presupuesto no se fijó; el handler
aplicó su regla segura (sin presupuesto, 0 créditos): Decisión «Presupuesto agotado» y ningún job. Esa Decisión quedó
caducada al llegar el `run.finished` del run rechazado; sigue en la lista como caducada.

## 5 · Licencia desconocida (prueba 27)

```
$ kratos asset prepare 31582855-92ff-45e5-afcb-635336fa8d07 --data D      (Nude_Tennis_Racket_🎾, license null)
18:06:04 decision.opened «Licencia desconocida» · asset.prepared {"licensed":false}
$ kratos decision list --state open → Licencia desconocida | Registrar licencia / No usar este asset
```

La tarea de arte (`provider: claude`, contrato `ue-asset-intake`, alcance `Content/Fab/Nude_Tennis_Racket_🎾`) queda
`pendiente`; la Decisión sigue abierta para ti (`decisiones-4-*`). El nombre con emoji pasa intacto por CLI, rutas y FTS.

## Investigación: ¿expone el plugin Fab tu biblioteca a Python?

No. `FFabMyLibraryContentSource` (`Engine/Plugins/Fab/Source/Fab/Private/Teds/FabContentSource.cpp`) es una fuente
C++/Slate del Content Browser tras la CVar `Fab.TEDS.MyLibrary.ContentSource`, sin `UFUNCTION` ni `UCLASS` scriptables,
y lee la biblioteca con peticiones HTTP autenticadas (`FabMyFolderIntegration`): sería un endpoint interno, prohibido.

## Capturas

`docs/capturas-4/{catalogo,entregas,actividad,decisiones}-4-{1366,1920}.png`, del servicio real de esta aceptación,
con `node panel/scripts/capturas-4.ts "<juego>/.kratos"` (marca la guía de primera visita como vista). Sin desbordamiento
horizontal ni errores de página en ninguna.

## Pendientes

- Una descarga nueva de nivel 2 de punta a punta (clics en el Launcher con Computer use o a mano) y `request_download` real.
- Un worker Claude de arte real sobre una tarea de `asset prepare` con licencia (aquí ninguno arrancó: `concurrency` 0).
- Un pack con C++ o plugins (no hay ninguno en la biblioteca local) y un zip real de la caché del plugin (la caché está vacía en este equipo; el lector ZIP solo está probado con zips sintéticos).
- La Decisión «Licencia desconocida» de la raqueta y la de presupuesto de Meshy quedan abiertas en `KratosJuegoH4` para que las resuelvas tú.
