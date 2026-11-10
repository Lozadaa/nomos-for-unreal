# Modo completo (`rapido: false`)

Desde el 2026-11-10 el modo rápido es el modo de Nomos ([SKILL.md](../SKILL.md#repartir)). El completo queda como salida
de emergencia: `nomos rapido off --data .nomos` (o `"rapido": false` en `.nomos/config.json`). Cambia esto:

| | Rápido (por defecto) | Completo |
|---|---|---|
| Director | por evento, sin `Monitor` | de sesión con `Monitor` (salvo `director.mode: "evento"`) |
| Correcciones por tarea | 1 | 3 |
| Plazas de Unreal · RAM libre | 2 · 1,5 GB | 1 · 6 GB, y espera a que se cierre un Unreal ajeno |
| Skills obligatorias por worker | 3 (núcleo del área) | todas las del área |
| Reparto | dos pistas, sin base | base corta y pistas que cuelgan de ella |

## Director de sesión

Al invocar, tras `nomos status --data .nomos`: si otra sesión tiene vigilante vivo, conserva esa directora. Si no, arma
`Monitor` durante 30 minutos con `nomos vigila --session <sesion> --data .nomos --types <tipos>` con
`message.received,run.finished,worker.waiting,command.failed,review.finished,test.failed,`
`task.moved,integration.completed,task.closing_blocked`.
`--types` reemplaza los defaults; `decision.opened/updated` llegan siempre; rearmar no repite eventos (cursor por sesión).
Anuncia escucha en una línea solo cuando Monitor esté armado. Si la herramienta no está disponible, explica la
limitación; no afirmes estar escuchando.

Al expirar Monitor, reármalo a 30 minutos con la misma sesión y tipos; con Run activo, pregunta pendiente o Decisión
abierta sigue escuchando. Tras dos expiraciones vacías (60 min) sin trabajo activo, apágalo y dilo; el siguiente
`/nomos` lo arma de nuevo.

El cursor de eventos vive en `.nomos/watcher-cursors.json`, separado de `lastAckSeq`; rearmar reentrega mensajes sin
confirmar sin repetir eventos del director ya impresos (ausente: desde cero; corrupto: avisa del replay).
`watcher_checkpoint_error` detiene el vigilante: conserva el archivo y `.tmp`, corrige acceso o espacio y rearma con la
misma sesión.

**Una sesión de director por hito; nunca más de 200 eventos del vigilante en la misma sesión.** Cuando la tarea de cierre
del hito queda `done`, anuncia en una línea que terminas la sesión y que la siguiente arranca con `/nomos` y lee
`.nomos/reanudacion.md` (Nomos lo reescribe al cerrar cada tarea y al parar; `nomos reanudacion --data .nomos` lo
regenera): [reanudación](cierre.md#reanudacion).

## Correcciones

Máximo tres por tarea; si la tercera no cumple, el servicio abre la Decisión antes de una cuarta.

## Pistas con base

Divide una petición cuando tiene partes independientes o un orden real (base antes que uso). Crea primero la base y
pasa su ID en `--depends`; las banderas se aplican antes de preparar, así el planificador nunca la ve a medias.
Un plan de hitos no es una fila de tareas: una base corta (≤ 15 min: módulo, clases vacías, GameMode, mapa con cámara y
luz) y, colgando de ella, pistas que avanzan a la vez, cada una con varios hitos y archivos propios (p. ej. física y
tiro · aspecto de la pieza · reglas y CPU · HUD). Nada de una tarea por hito con `--depends` en cadena. Para que dos
pistas no se esperen:
- lo que una pista añade al nivel lo crea su C++ en `BeginPlay` (o un `Spawner` propio), no editando el `.umap`; el
  mapa solo lo reserva la base;
- cada pista tiene su clase/archivo; el punto de unión (GameMode, Build.cs) lo deja preparado la base;
- `concurrency.claude` ≥ número de pistas y `scheduler.heavy.maxConcurrent` 2-3 (cada worker abre su Unreal; la RAM
  libre manda).
