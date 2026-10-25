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
