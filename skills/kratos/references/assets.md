# Assets: buscar antes de generar

Política ante cualquier necesidad de asset, en este orden. Cada paso que gasta,
compra o toca licencias abre una Decisión; la Decisión enumera lo ya buscado.

| Paso | Qué haces | Decisión |
|---|---|---|
| 1. Catálogo propio | `kratos asset search '<palabras>'` y lista candidatos con fuente, estado y licencia | Ninguna si hay candidato con licencia |
| 2. Tu Fab no descargado (nivel 2) | `kratos asset download <entrada>`: abre el Launcher y espera la llegada | «Reintentar / Cancelar» a los 20 min |
| 3. Fuentes CC0 | Poly Haven, ambientCG, Kenney, Quaternius: propón enlaces, no descargues | Usuario elige |
| 4. Compra | Propón el listado de Fab con precio | Siempre Decisión: Kratos nunca compra |
| 5. Meshy | Solo piezas hard surface, dentro de presupuesto | Fuera de presupuesto, «Presupuesto agotado» |

**Meshy solo para piezas hard surface** (props, vehículos, armas, piezas mecánicas,
pawns rígidos) por `text-to-3d`, `image-to-3d` y `remesh`. Sin `rig` ni `animate`:
el servicio rechaza cualquier otro `kind` con `meshy_kind_not_allowed`. **Nunca se
generan personajes ni formas orgánicas con Meshy**; salen del catálogo (Fab,
MetaHuman, packs con esqueleto). Una entrada con `aiForbidden` no se usa como entrada
de ninguna generación (`asset_ai_forbidden`).

## Comandos

Todos encolan en la bandeja (`POST /commands`); el resultado llega por eventos.

| Comando | Orden | Eventos |
|---|---|---|
| `kratos asset index` | `asset.index` | `catalog.indexed` |
| `kratos asset search '<q>'` | lectura de `GET /catalog?q=` | — |
| `kratos asset migrate <entrada> [--target <proyecto>]` | `asset.migrate` | `asset.migrated`, `asset.verify_failed` |
| `kratos asset prepare <entrada>` | `asset.prepare` | `asset.prepared`, `decision.opened` |
| `kratos asset download <entrada>` | `asset.request_download` | `download.requested`, `download.completed`, `download.timeout` |
| `kratos asset generate <tarea> --kind text\|image\|remesh --params-file F --credits N` | `asset.meshy_generate` | `meshy.job.created`, `meshy.job.completed`, `meshy.link_expired` |

Añade `asset.migrated,asset.verify_failed,download.completed,download.timeout,meshy.job.completed`
a `--types` del vigilante cuando dirijas trabajo de assets.

## Niveles de extracción de Fab

- **Nivel 1, migrar**: el pack ya está en disco (otro proyecto, `VaultCache`, caché del
  plugin). El servicio lo copia sin sobrescribir, reserva `editor/<proyecto>` y lo
  verifica con el editor sin GUI. Si el motor no está entre las versiones del pack,
  el informe y la tarjeta dicen «Publicado para 5.4; verificado en 5.8.3»: avísalo, no lo ocultes.
  Destino existente: Decisión «Reemplazar / Conservar».
- **Nivel 2, descarga asistida**: siempre al proyecto cuarentena (el Launcher escribe
  `StarterContent` fuera del pack) y de ahí nivel 1 al juego. Guion, 5 clics:
  Fab (menú lateral) › My Library › «+» en la tarjeta › proyecto cuarentena › Add to Project.
  Si dice «No compatible user projects», 4 más: Show all projects › proyecto ›
  Select Version › la más alta. Con Computer use los das tú, solo sobre el Launcher;
  sin él, deja las instrucciones al usuario y espera `download.completed`.
- **Nivel 3, `ue-asset-cli`**: apagado. Activarlo exige una Decisión y no está implementado.

Nunca uses cookies del navegador, tokens copiados a mano ni endpoints internos de Fab.

## Importar al juego

`kratos asset prepare` crea una tarea de arte (`provider: claude`) con el contrato
`ue-asset-intake`: escala, pivote, colisión, materiales y licencia registrada.
Licencia desconocida abre «Licencia desconocida» y la tarea espera. El worker de arte
usa `blender-director`, `unreal-export`, `qa-review` y `ue-asset-intake`; la
verificación sin GUI en rojo deja la tarea en `probando`, no en `revisando`.
