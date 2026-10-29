# Integración, cierre y continuación

DONE significa: cambios en commits recuperables, integrados en la rama objetivo y
recomprobados; revisión y pruebas satisfechas; conversación, autores, commits y
artefactos preservados fuera del worktree; terminales cerrados y worktree retirado
sin forzar. Lo comprueba el servicio; Nomos solo lo pide.

## Integrar (`nomos task integrate <id>`)

- Exige `integrando` y revisión aprobada. Una tarea aprobada en `revisando` sin
  criterios `check:` pasa sola a `integrando` al pedirlo.
- Trabaja en `.nomos/integration/<Proyecto>`, un worktree del juego en HEAD separada
  (la rama objetivo suele estar activa en tu checkout y Git no deja activarla dos
  veces). La rama objetivo es `config.json: targetBranch` o la rama actual del juego.
- `merge --no-ff` de la rama del worktree. Una integración a la vez por proyecto
  (reserva `integration/<Proyecto>`): la segunda espera con «Esperando reserva».
- Si la rama objetivo avanzó desde que nació el worktree, `checks.run` recomprueba el
  resultado integrado en ese workspace antes de publicarlo; si falla, la tarea vuelve
  a `probando` con el motivo y la rama objetivo no se toca.
- Publicar es `merge --ff-only` en el checkout que tenga activa la rama (el tuyo); si
  tienes cambios que chocan, la integración espera y lo dice.
- Contenido pesado (un archivo de más de 10 MB, o más de 100 MB en total, que entraría
  como blob completo): no se fusiona. Decisión «Contenido pesado (N MB): Configurar Git
  LFS / Integrar sin LFS / Cancelar», con la cuota de LFS de GitHub (1 GB) si no hay
  remoto o es GitHub; sin git-lfs no aparece la primera. «Configurar» va al carril
  largo (`integrate.lfs`): `git lfs migrate import` de la rama del worker con los
  patrones de Unreal y `--exclude-ref` de la rama objetivo (nunca se reescribe, ni
  `Config/`), el mismo `.gitattributes` commiteado antes en la rama objetivo, y `gc`
  de los blobs viejos. Cambiar solo `.gitattributes` no obliga a recomprobar.
- Al publicar, lo del checkout del usuario igual byte a byte a lo que llega (asset
  migrado sin seguir, la línea de LiveLink ya puesta) se sustituye; lo distinto
  (`Config/` con secretos) no se toca nunca.
- Conflicto (texto o binario, p. ej. `.uasset`): nada se resuelve. `abortMerge`,
  informe «Integración · conflicto» y Decisión «Resolver en el worktree / Descartar
  la integración» con el sha de cada rama y quién integró antes ese archivo.

## Cerrar (`nomos task finalize <id>`)

Exige `cerrando`. Condiciones en orden; la primera que falla deja la tarea en
`cerrando` con `waitReason` y el evento `task.closing_blocked {condition, reason}`:

| condition | Qué exige | Qué haces |
|---|---|---|
| `commits` | rama del worktree existe y el commit integrado está en la rama objetivo | integra primero |
| `review` | revisión aprobada y último run del responsable `done` | pide revisión |
| `integration` | integración posterior a la última versión del responsable | integra de nuevo |
| `checks` | últimas pruebas obligatorias en `passed` | `nomos task check` |
| `worktree` | sin cambios sin registrar; Decisión «Descartar / Commitear al run / Esperar» | presenta la Decisión |
| `archive` | `.nomos/archive/<tarea>/` escrito y verificado (SHA-256 por archivo) | libera espacio y reintenta |
| `processes` | terminales cerrados por Orca (mata el árbol del shell) | revisa Orca |

«Archivos en uso» (un proceso aún retiene el worktree) se reintenta solo cada 30 s,
hasta cinco veces. «Descartar» es la única vía a `--force` y queda registrado quién
lo eligió (`worktree.discarded`); nunca lo elijas tú.

Sin esperar al cierre, el servicio cierra el terminal de Orca de cada run que ya no
tiene nada que leer: revisores terminados, runs `failed` o canceladas y tareas `done`
(el del responsable sigue abierto hasta cerrar: las correcciones llegan a esa sesión).
Al arrancar y cada 10 min barre solo los terminales de sus propias runs; `nomos status`
trae `workers.text` («procesos de workers vivos: N») y `workers.warning` si hay más
vivos que runs en marcha.

El archivo contiene `conversacion.jsonl`, `eventos.jsonl`, `diff-final.patch`,
`informes/`, `sesiones.json`, `resumen.md` y `manifest.json`; el panel lo enseña en
la pestaña Archivo. Las tareas sin worktree (assets remotos) cierran solo con él.

## Continuar después de DONE (`nomos task continue <id> --file <texto>`)

Crea «Ajuste: <título>» con `parentTaskId`, criterios, alcance y reservas de la madre
y su atribución. Si el terminal del responsable sigue vivo y su worktree existe, el
texto va a ese terminal (run con `continuationOf`). Si no, la hija queda `preparada`
y el planificador arranca un run nuevo (intento + 1) con `resumen.md` y
`diff-final.patch` del archivo en la sección «Continuación» del brief.

## Build jugable

El panel tiene un botón «Jugar» que lanza la build más reciente del juego: `Build/Windows-actual/<Proyecto>.exe`,
otras `Build/Windows-*`, los artefactos `build` y los paquetes de la comprobación `build` en
`.nomos/artifacts/tests/`. La fecha es la del `.exe` o la del `.pak` más nuevo del paquete.

- Al cerrar (`task.done`) una tarea que toque `Source/`, `Content/` o `Config/`, deja
  `Build/Windows-actual/<Proyecto>.exe` al día: **fusiona main** en el árbol que empaquetas,
  empaqueta (BuildCookRun, Development Win64) y copia el contenido de la carpeta `Windows/`
  del paquete en `Build/Windows-actual/`.
- **Origen (hito 17).** Cada paquete lleva `build-info.json` junto al ejecutable
  (`{commit, branch, builtAt, task, run}`). La comprobación `build` lo escribe sola; quien
  empaqueta a mano (director o worker) lo escribe desde el árbol empaquetado con
  `nomos build stamp <carpeta del paquete>` (lee HEAD del cwd), p. ej. `nomos build stamp Build/Windows-actual`.
- Antes de avisar de que algo está «listo para probar», `nomos play --status --data .nomos`:
  `build.stale` debe ser `false` (`text`: «…, al día con main»). `stale: true` («anterior a main»)
  = el paquete no incluye la punta de main: fusiona main y re-empaqueta. Sin `build.origin`
  (paquete sin estampar) o con `build` `null` (`reason` dice por qué), empaqueta o estampa y vuelve a mirarlo.
  El panel avisa «Esta build no incluye los últimos cambios de main»; Jugar sigue funcionando.
- `nomos play` lanza la partida y `nomos play --stop` la cierra; lanzar es cosa del usuario
  desde el panel. Argumentos en `config.json: play.args` (por defecto `-windowed -ResX=1920
  -ResY=1080`) y mapa opcional en `play.map` (`/Game/...`).

## Disco

Regla del usuario: «No dejes históricos de paquete anda limpiando». Solo se conserva
`Build/Windows-actual/` del proyecto.

- La comprobación `build` borra su paquete (`.nomos/artifacts/tests/<id>/build/`) al terminar,
  pase o falle; quedan `log.txt`, capturas, hoja, log del juego y vídeo. Con menos de 10 GB
  libres no empaqueta: sale «no disponible» con «ejecuta nomos clean».
- `nomos build stamp Build/Windows-actual` borra del árbol desde el que estampas
  `Saved/StagedBuilds`, `Saved/Paquete-*` y su propio `Build/Windows-actual`.
- `nomos status` trae `disk.text` («Disco: 24 GB libres · ejecuta nomos clean» por debajo de 30 GB).
  Entonces `nomos clean --dry-run --data .nomos` (lista y suma), y `nomos clean --data .nomos`:
  paquetes de las comprobaciones, `Saved/StagedBuilds`, `Saved/Paquete-*`, `Build/Windows-*`
  (salvo el actual del proyecto), `Saved/Video*` y copias de `.nomos/integration/` que no son
  worktree de Git; retira los worktrees de tareas `done` con la rama en main. Nada cambiado en
  los últimos 30 min ni worktrees con cambios sin commit. Di al usuario los GB liberados.
- `nomos clean` también cierra servidores de Nomos huérfanos (líneas `servidor <pid>`): su `--data`
  ya no existe (10 min vivos) o está en Temp sin proyecto registrado (30 min). Nunca toca un
  servicio con datos fuera de Temp, como los de los juegos.

## Reanudación

`.nomos/reanudacion.md` (≤ 60 líneas, en tablas) lo escribe Nomos desde la base al cerrar cada tarea
(`finalize.run`), al parar el servicio y con `nomos reanudacion --data .nomos`: estado y versión del servicio,
tareas abiertas por estado con su espera, Decisiones abiertas, holds, lecciones y la orden exacta de `nomos vigila`.
Una sesión de director por hito y nunca más de 200 eventos del vigilante en la misma sesión: al cerrar el hito el
director lo anuncia en una línea y termina; la sesión siguiente arranca con `/nomos` y lee ese archivo. No lo edites a mano.

## Pausa

`nomos pausar` hace que el planificador no encole arranques: las tareas quedan
`preparada` con «Director en pausa» y sale `scheduler.paused` una vez. Integraciones,
cierres y workers en marcha terminan. `nomos reanudar` lo deshace.
