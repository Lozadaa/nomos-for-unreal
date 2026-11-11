# Assets: buscar antes de generar

Política ante cualquier necesidad de asset, en este orden. Cada paso que gasta,
compra o toca licencias abre una Decisión; la Decisión enumera lo ya buscado.

| Paso | Qué haces | Decisión |
|---|---|---|
| 1. Catálogo propio | `nomos asset search '<palabras>'` y lista candidatos con fuente, estado y licencia | Ninguna si hay candidato con licencia |
| 2. Tu Fab no descargado (nivel 2) | `nomos asset download <entrada>`: abre el Launcher y espera la llegada | «Reintentar / Cancelar» a los 20 min |
| 3. Fuentes CC0 | Poly Haven, ambientCG, Kenney, Quaternius: propón enlaces, no descargues | Usuario elige |
| 4. Compra | Propón el listado de Fab con precio | Siempre Decisión: Nomos nunca compra |
| 5. Meshy | Solo piezas hard surface, dentro de presupuesto | Fuera de presupuesto, «Presupuesto agotado» |

**Meshy solo para piezas hard surface** (props, vehículos, armas, piezas mecánicas,
pawns rígidos) por `text-to-3d`, `image-to-3d` y `remesh`. Sin `rig` ni `animate`:
el servicio rechaza cualquier otro `kind` con `meshy_kind_not_allowed`. **Nunca se
generan personajes ni formas orgánicas con Meshy**; salen del catálogo (Fab,
MetaHuman, packs con esqueleto). Una entrada con `aiForbidden` no se usa como entrada
de ninguna generación (`asset_ai_forbidden`).

**Varias cuentas de Meshy**: `MESHY_API_KEY` (cuenta «env») y las de `%USERPROFILE%\.nomos\meshy-claves.json`
(cifradas con DPAPI). Cada job nuevo usa la de más saldo y, si Meshy responde sin créditos, la siguiente; el seguimiento
y la descarga van con la cuenta que lo creó. `nomos meshy cuentas` lista nombre, origen y saldo. Añadir más:
`powershell -ExecutionPolicy Bypass -File scripts\guardar-claves-meshy.ps1` (desde el repo de Nomos).

## Comandos

Todos encolan en la bandeja (`POST /commands`); el resultado llega por eventos.

| Comando | Orden | Eventos |
|---|---|---|
| `nomos asset index` | `asset.index` | `catalog.indexed` |
| `nomos asset search '<q>'` | lectura de `GET /catalog?q=` | — |
| `nomos asset migrate <entrada> [--target <proyecto>]` | `asset.migrate` | `asset.migrated`, `asset.verify_failed` |
| `nomos asset prepare <entrada>` | `asset.prepare` | `asset.prepared`, `decision.opened` |
| `nomos asset download <entrada>` | `asset.request_download` | `download.requested`, `download.completed`, `download.timeout` |
| `nomos asset generate <tarea> --kind text\|image\|remesh --params-file F --credits N` | `asset.meshy_generate` | `meshy.job.created`, `meshy.job.completed`, `meshy.link_expired` |

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

## Sonido y música: WeLoveIndies

Ventaja de la Epic MegaJam: más de 3.200 temas y 250.000 efectos. Licencia **Free & Demo: no comercial y
ligada al proyecto**. La jam tiene premios en metálico: **el usuario confirma con WeLoveIndies que la
licencia cubre la entrega** antes de publicar. Términos e investigación: `docs/investigacion/weloveindies.md`.

| Orden | Qué hace | Sesión |
|---|---|---|
| `nomos sonido login` | Abre Chrome (perfil propio en `~/.nomos/navegador/weloveindies`, fuera del repo) en la página de entrada; el usuario entra él mismo. Dice «Sesión guardada» | La crea |
| `nomos sonido buscar "<palabras>" [--tipo musica\|efecto] [--limite 10]` | JSON con id (`e…` efecto, `m…` música), título, duración, tipo, URL de escucha, autor y licencia | No hace falta |
| `nomos imagen crear "<prompt>" --salida <ruta.png> [--aspecto 1:1] [--resolucion 1K\|2K\|4K] [--sin-fondo]` | fal.ai, Nano Banana Pro: deja el PNG y `<ruta.png>.receta.json` (prompt, modelo, coste aproximado). Unos 0,15 $ por imagen (0,30 $ a 4K). Clave: `scripts/guardar-clave-fal.ps1` o `FAL_KEY` |
| `nomos pedido crear <id> "<prompt ultra específico, ≥ 200 caracteres>" --encargo "<frase literal del usuario>" --destino <carpeta> [--para PBRGen] [--sustituto "…"]` y `nomos pedido lista` | Pedido manual para una herramienta sin API (PBRGen, en el navegador): queda en `docs/pedidos/<id>.json`, el panel lo enseña como alerta en todas las vistas, el director se lo cuenta al usuario y pasa a «hecho» cuando hay una imagen en la carpeta de destino. El worker no espera |
| `nomos sonido bajar <id…> --juego <carpeta> [--destino Content/Audio]` | Sin ventana, una descarga cada 4 s: `Importar/Audio/<archivo>.wav` (ffmpeg si no era wav), `<archivo>.wav.licencia.json`, `<archivo>.receta.json` y su línea en `CREDITOS.md`. Imprime la orden `nomos ue receta …` que lo importa como `SoundWave` | Necesaria |
| `nomos sonido importar <carpeta> --juego <carpeta>` | Lo mismo con lo que el usuario bajó del cofre ya licenciado (zip descomprimido); marca `licenciado` | No |

- Busca en inglés y por cómo suena, no por para qué sirve («wood creak», no «puerta del jefe»).
- Baja solo lo que la tarea pide: la cuenta gratuita da 100 sonidos y 5 temas cada 30 días.
- Lo de `bajar` sale del botón de descarga por archivo y queda `prueba`: los términos solo lo permiten
  para pruebas internas. Antes de entregar, el usuario mete esos sonidos en el cofre, elige la licencia
  Free & Demo, descarga el zip y lo pasa por `nomos sonido importar` (sustituye archivo y línea de créditos).
- Sin sesión o caducada, `bajar` dice «Ejecuta `nomos sonido login`»: un worker no lo ejecuta, sigue con el
  plan B (sintetizado o MetaSound) y lo anota para el usuario.
- Nunca un `.wav` en el juego sin su `.licencia.json`; nunca contraseñas ni cookies en Nomos.

## Importar al juego

`nomos asset prepare` crea una tarea de arte (`provider: claude`) con el contrato
`ue-asset-intake`: escala, pivote, colisión, materiales y licencia registrada.
Licencia desconocida abre «Licencia desconocida» y la tarea espera. El worker de arte
usa `blender-director`, `unreal-export`, `qa-review` y `ue-asset-intake`; la
verificación sin GUI en rojo deja la tarea en `probando`, no en `revisando`.
