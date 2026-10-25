# Aceptación del hito 18: el servicio sano no parece caído y las revisiones no se atascan

Rama `hito18-salud` sobre `main@d18e90b`.

## Tarea 1 · `/health` responde siempre y el vigilante no se precipita

### Qué paraba el bucle de eventos

Medido sobre una copia de la base de Block Kings (`nomos.db` de 113 MB: 99 954 eventos con 66 MB de `payload`,
13 057 comandos, 141 runs), en el scratchpad, sin tocar su `.nomos/` ni su servicio. Cada cifra es una llamada
síncrona de `node:sqlite` en el hilo del servicio: mientras dura, no contesta nada, tampoco `/health`.

| Sitio | Qué hacía | Antes | Después |
|---|---|---|---|
| `service/src/sse.ts` `streamEvents` → `listEvents(db, 0)` | El panel abre `/events` sin `since`: leía, parseaba y escribía los 100 000 eventos de golpe | 472 ms de lectura + 90 ms de `JSON.stringify` + 66 MB de `res.write` | Lotes de 500 (2 ms cada uno), cede con `setImmediate` y espera a `drain` |
| `service/src/store.ts` `pendingEvents` (lo llama `status()` en cada `GET /status`, el vigilante cada 2 s) | Parseaba todos los eventos posteriores al último ack (48 600, el director solo hace ack de mensajes) y filtraba en JS | 206 ms por `/status` | Filtro `type='message.received'` en SQL con índice: 1 ms |
| `service/src/routes/tasks.ts` `GET /tasks/:id` | `listEvents(db, 0).filter(taskId)` | 471 ms por detalle de tarea | `eventsOf` filtra en SQLite: 108 ms (ver pendientes) |
| `service/src/routes/runs.ts` `GET /runs/:id/output` | `listEvents(db, since).filter(worker.output && runId)` | hasta 470 ms | `eventsOf(..., 'worker.output')` |
| `service/src/archive.ts` `preserveTask` | Igual que el detalle de tarea, al cerrar | 471 ms una vez por tarea | `eventsOf` |
| `service/src/scheduler-state.ts` (consultas a `commands` por `type`) y eventos por `type` | Sin índice sobre `commands.type` ni `events.type` | pasada del planificador ~100 ms cada 5 s; `director.paused` 21 ms, `task.reconciled` 52 ms por tarea | índices `events_type(type, seq)` y `commands_type(type, state)` (`migrateIndexes`): planificador 18 ms, consultas por tipo < 1 ms |

`/health` ya no tocaba ni la base ni Git; ahora devuelve `{ok, pid, uptime}` y nada más.

Búsqueda de llamadas síncronas en caminos calientes (`execSync`, `spawnSync`, `execFileSync`, `readFileSync`,
`statSync`, `readdirSync`): Git y Orca van por `spawn` asíncrono y el hash del diff ya es por streaming (hito 16).
Lo síncrono que queda está en comprobaciones de un solo uso (PNG, informes de Unreal, migración de assets) salvo:

### Pendientes (no acotados en este hito)

- `service/src/play.ts:83-86` `withOrigin` → `service/src/build-info.ts:10` `execFileSync('git', …)` dos veces
  (`rev-parse --abbrev-ref HEAD` y `merge-base --is-ancestor`) en cada `GET /play`, que el panel pide cada 30 s y
  con cada `test.*`/`artifact.created`/`play.*`. En Block Kings, con la máquina libre, 37-47 ms por petición; con
  Unreal compilando, el arranque de procesos en Windows lo multiplica. Pasarlo a asíncrono cambia la firma de
  `latestBuild`/`playStatus`/`play` y la de `nomos play`; queda para otro hito.
- `eventsOf` (detalle de tarea, salida de run, archivo) sigue recorriendo la tabla con `json_extract(payload,'$.taskId')`:
  108 ms con 100 000 eventos. Lo arreglaría una columna `task_id` indexada en `events` (migración de datos).
- `GET /commands` sin `state` (`routes/commands.ts:86`) lee y decodifica los 13 000 comandos: 99 ms.
- `service/src/service-info.ts` `isAlive` usa 500 ms para `/health` + `/status`: con el servicio ocupado,
  `nomos start` puede creer que no hay servicio, borrar `service.json` y fallar al escuchar en el puerto ocupado.
  Con `/status` a 1 ms es mucho menos probable; no se ha tocado.

### Latencia de `/health` con carga, antes y después

`tests/health-load.test.ts`: servicio real (`nomos start`) con 100 000 eventos de 0,6 KB; cuatro SSE desde 0 y
cuatro `/status` mientras se sondea `/health` cada 20 ms.

- Antes (rama sin los arreglos, solo con `pid`/`uptime` en `/health`): peor `/health` **1 320 ms**.
- Después: peor `/health` **3 ms** y **6 ms** en dos pasadas. La prueba exige < 200 ms.

### El vigilante

`nomos vigila` ya no imprime `service_down` porque `/health` tarde: `probeService` (`service/src/watcher.ts`) reintenta
tres veces en 15 s (5 s cada una) y solo es caída sin `service.json`, con el pid muerto o con el puerto cerrado.
Vivo y con el puerto abierto: `{"warn":"service_slow","ms":N}`, como mucho una vez por minuto.
Pruebas en `tests/watcher-busy.test.ts`: `/health` que tarda 6 s una vez → un `service_slow` con `ms ≥ 5000` y
ningún `service_down`; pid vivo con el puerto cerrado → un `service_down`; pid muerto → `service_down` al momento.

## Tarea 2 · Las revisiones no se atascan tras una corrección

Al dar NOMOS_DONE la run guarda `metadata.doneCommit` (HEAD de su árbol; una llamada a Git solo cuando llega una marca
nueva). El barrido de atascos (`sweepStalls`, `service/src/stall.ts`, cada pasada del planificador) decide qué falta:

- `revisando`, HEAD ≠ `doneCommit` y ninguna revisión ha visto ese HEAD: si el terminal del worker está quieto (vivo y en
  reposo, o cerrado; la cuenta del hito 17, `terminalBusy` en `sweep.ts`) encola `review.start` con la misma lógica que
  `nomos task review` (ahora en `service/src/review-request.ts`) y emite `review.auto_requested {taskId, commit,
  reason:"commits tras DONE"}`, que también queda en el diario `logs/<día>.jsonl`. Sin Decisión. Si el terminal está
  ocupado (o Orca no contesta), espera a la pasada siguiente.
- `revisando` sin commits nuevos: Decisión «Pedir la revisión del commit abc1234»; la opción recomendada
  (`pedir_revision`) la pide Nomos en la pasada siguiente (`review.auto_requested` con `reason:"decisión"`).
- `implementando` con la run del responsable terminada sin marca: «El worker no dio NOMOS_DONE: leer su terminal»; la
  recomendada (`leer_terminal`) lee la pantalla y la deja como `worker.output` en la actividad de la tarea.
- Lo demás conserva «Tarea parada en «estado» sin ningún paso en marcha», ahora con el paso: «falta nomos task check».

Cada opción elegida se ejecuta una vez (`stall.step_done`). Pruebas: `tests/service/stall-review.test.ts` (fake de Orca y
Git real): DONE → commit → terminal quieto → revisión pedida sola y sin Decisión, y no se repite; DONE → commit →
terminal ocupado → nada; DONE sin commits → Decisión con el commit y la recomendada pide la revisión una sola vez;
implementando sin marca → «leer su terminal» y la lectura queda en un `worker.output`.

## Tarea 2b (añadido del orquestador) · DONE viejo tras la corrección y `worker.waiting` repetido

Commit aparte (`fix:`), porque toca otro camino (envío y sondeo del worker):

- Al enviar una corrección la run guarda `metadata.correctionHead`. Un NOMOS_DONE con `commits` declarados que llega sin
  que HEAD se haya movido es el viejo (o uno repetido antes de empezar): `worker.done_ignored {reason:"sin commit tras la
  corrección"}` y la run sigue viva. Con `commits: []` («sin cambios») cuenta. El que ya estaba en pantalla antes del
  envío ya lo descartaba la lista de marcas vistas.
- `worker.waiting` por reposo: 30 s sin salida (6 sondeos, antes 10 s), Orca en reposo y la última línea con texto es
  una pregunta o un prompt (`>`, `›`, el marco o el pie de Claude). El permiso de Claude solo cuenta en las últimas seis
  líneas y con forma de pregunta (`?` al final o `(y/n)`): «// Do you want to…» en el código ya no lo dispara. La misma
  espera (misma pregunta y misma última línea) se avisa una vez hasta la siguiente orden.
- Pruebas: `tests/service/worker-correction.test.ts` (fake de Orca). Se ajustaron cinco pruebas antiguas que daban
  NOMOS_DONE tras una corrección sin commit o esperaban «espera instrucciones» a los 10 s con la última línea sin pregunta.

## Aceptación en KratosFabTest

2026-10-25, horas UTC. `C:\Users\richa\Documents\Unreal Projects\KratosFabTest` (rama `master`, HEAD `9a1c3c7`), datos
nuevos `--data .nomos-hito18`, puerto 18880, CLI de esta rama (`f1190b2`). `config.json`:
`{"concurrency":{"claude":1,"codex":0,"opencode":0},"workerModel":"sonnet"}`. Orca 1.4.238. El servicio del 8780 y el de
Block Kings (8781) siguieron vivos (`/health` 200 antes y después) y no se tocaron. Ningún commit en `master` de
KratosFabTest; `Config/DefaultEngine.ini` sigue sin seguimiento y sin tocar. El token no sale en ninguna salida ni en el
diario.

Tarea «H18 commits tras DONE» (área qa, alcance `Docs/hito18`): el encargo pide un commit, NOMOS_DONE, `sleep 30`, otro
commit y **no** repetir la marca. Planificador en pausa y `nomos worker start <tarea> --provider claude`.

| Hora | Qué pasó |
|---|---|
| 05:06:10 | `worker start`; run en marcha a las 05:06:26 |
| 05:06:52 | NOMOS_DONE («Creado Docs/hito18/primero.md»): run `done`, `doneCommit` `46228f0`, tarea `revisando` |
| 05:07:24 | El worker hace `f841456 docs: segundo` en su rama y termina sin repetir la marca |
| 05:16:55 | Barrido de atascos (10 min quieta, terminal en reposo): `review.auto_requested {commit: f841456…, reason: "commits tras DONE"}`, también en `logs/2026-10-25.jsonl`; **sin Decisión** |
| 05:17:23 | `review.started` (revisor Claude) sobre `f841456` |
| 05:18:03 | `review.finished` aprobada; la tarea sigue en `revisando` con la revisión aprobada |
| 05:19 | `nomos stop --data .nomos-hito18` → `DETENIDO`; 18880 cerrado. Terminal del worker cerrado con `orca terminal close` (el del revisor ya lo había cerrado el barrido) |

`/health` del servicio de aceptación con el worker activo: 1-2 ms, cuerpo `{ok, pid, uptime}`.

Quedan en KratosFabTest la carpeta `.nomos-hito18/` (sin seguimiento, como las de hitos anteriores) y la rama
`nomos/44fd74a1` con los dos commits del worker. No se ejercieron en real la Decisión «Pedir la revisión del commit X»,
«leer su terminal» ni la Tarea 2b (DONE viejo y `worker.waiting`): están cubiertas por las pruebas con el fake de Orca.
