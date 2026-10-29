# Contrato de evidencia

Toda afirmación de que algo funciona en Unreal se apoya en un `TestRun` y sus archivos.
Sin `TestRun passed` no hay «verificado».

## TestRun

| Campo | Qué es |
|---|---|
| `checkId` | `cpp`, `blueprint`, `asset`, `map`, `umg`, `build` o `none` (el diff no toca Unreal) |
| `result` | `pending → running → passed / failed / skipped / unavailable` |
| `runId` | Run de pruebas (`qa · unreal`) o el revisor de QA visual para `umg` |
| `commit` | `git rev-parse HEAD` del árbol probado |
| `engineVersion` | `Engine/Build/Build.version` (p. ej. 5.8.3) o la que informa el editor |
| `map`, `config` | Mapa jugado y configuración o resoluciones (`1280x720, 1920x1080`) |
| `reportPath` | Log completo: `<datos>/artifacts/tests/<testRunId>/log.txt` |

Los artefactos de la prueba (`report`, `screenshot`, `build`) llevan `provenance.testRunId`;
las capturas, además, `resolution`, `map`, `widget`, `control` (captura sin UI) y `diffRatio`.

## Eventos

`test.running`, `test.passed`, `test.failed`, `test.skipped`, `test.unavailable` con
`{testRunId, taskId, runId, check, summary, logPath}`. `summary` lleva como mucho 30 líneas
(las que contienen «error» si las hay); el log completo está en `logPath`.

## Qué hace cada comprobación

| check | Cómo | Tiempo máximo |
|---|---|---|
| cpp | `Build.bat <Juego>Editor Win64 Development` | 20 min |
| blueprint | `nomos_compile_bp.py`: carga, compila y comprueba referencias | 10 min |
| asset | `verifyPack` del hito 4 + escala y materiales | 3 min por carpeta |
| map | `nomos_validate.py` (Data Validation) y juego `-game` 30 s con captura 1280×720 y 3 vistas del rig | 10 min |
| umg | `ui.cycle`: capturas con y sin UI a dos resoluciones + QA visual | 10 min por resolución |
| build | `RunUAT BuildCookRun` + arranque 30 s con `HighResShot` | 40 min |

**Varios puntos de vista (hito 10).** map y build entregan 4 vistas: la del jugador (`provenance.view=player`, la única que
juzga la regresión visual) y tres de una cámara libre que orbita al pawn: `left` y `right` (3/4 a 3,5 m y 1,6 m de altura)
y `top` (picado a 6 m y 45°), más una hoja de contactos 2×2 `*-hoja.jpg` (`provenance.sheet=true`, necesita ffmpeg).
En build el ejecutable da la del jugador y el editor (`-game`, mismo mapa) las otras tres. `config.json: checks.views`
(4 por defecto; `1` = solo la del jugador). Si las vistas extra pasan de 90 s se entregan las que haya y se anota en el resumen.

Línea base visual de map y build: `docs/baseline/<check>-<mapa>-<captura>.png`, siempre con
mapa. Si ni el diff ni el informe lo dicen, es `GameDefaultMap` de `Config/DefaultEngine.ini`
(o el último `/Game/` cargado en el log); la antigua sin mapa se adopta para el mapa por
defecto renombrándola, con una línea en el resumen. Solo juzga una línea base aprobada: sin ella la captura
va a `docs/baseline/propuestas/<nombre>.png`, abre «Línea base: …» en «Por aprobar» y el resultado es `skipped`
(«Sin línea base aprobada; propuesta enviada»). Aprobar la mueve a `docs/baseline/`; rechazarla la borra y la
siguiente captura propone otra. Las que ya están en `docs/baseline/` cuentan como aprobadas.

`animation` solo se exige si hay personaje que reproducir (`nomos-personaje.json` en el
árbol, o malla con esqueleto y clips en el diff). Montajes o clips sin él: no aplica, no se
selecciona ni abre Decisión, y el resumen del lote dice «animation no aplica».

Motor ausente → `unavailable`, nunca `passed`. Tiempo agotado → `taskkill /T`, reserva
liberada y `failed` con el log. Un solo editor por proyecto: la reserva `editor/<juego>`
pone en cola al resto con el motivo «Editor de <juego>: ocupado por <agente>».

## Al informar al usuario

Cita la comprobación, el resultado, el commit corto y la ruta del log o de la captura.
Nunca resumas un `failed` como «casi»: di qué falló y quién lo corrige.
