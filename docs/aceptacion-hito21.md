# Aceptación del hito 21: las esperas a propósito no parecen atascos

Rama `hito21-esperas` sobre `main@1a707e5`. Commits: `0ebcd0a` (`worker start` sin intento), `61b46f7` (vigilante),
`de7a126` (prueba del CLI sin carrera), `864266e` (esperas), más el ajuste de `updated_at` de la espera y estos docs.

## Tarea 1 · Esperar a propósito no abre Decisión de atasco

- Con la revisión aprobada y sin integración pedida, una tarea en `revisando` no cuenta como atasco hasta 30 min
  (`approvedQuietMs`; el resto de estados, 10). Pasado ese umbral, la Decisión dice «Revisión aprobada: falta pedir la
  integración» (en `integrando`, «Lista para integrar: …»). Su opción recomendada, `integrar`, pide la integración
  igual que `nomos task integrate`, y solo una vez. En los demás atascos, «Retomar» dice ahora que Nomos no ejecuta nada.
- `nomos task hold ID --motivo "…" [--hasta N|tipo.evento]` guarda la espera en `tasks.hold` (columna nueva, migración
  `migrateHold`) y emite `task.held`. Mientras dura, ningún barrido abre Decisión de atasco sobre esa tarea.
  `nomos status` la lista en `holds`, y en el panel aparece como `waitReason` «En espera: motivo» (fila: «En espera»).
  Vence a los N minutos o con el primer evento de ese tipo posterior a marcarla. Pedir la integración la quita
  (`task.hold_lifted`). Marcarla no toca `updated_at`: cuando vence, el atasco se cuenta desde el último cambio real.
- Pruebas: `tests/service/stall-hold.test.ts` (5) y `tests/cli-hold.test.ts`.

## Tarea 2 · `worker start` sin intento

El CLI mandaba `attempt: 1` por defecto, así que la clave `worker.start:TAREA:1` devolvía el arranque de ayer. Ahora,
sin `--attempt`, decide el servicio. Si la run del último intento sigue viva o la orden aún no ha arrancado, usa ese
intento y repetir devuelve la misma orden. Si esa run ya terminó o la orden falló, usa el siguiente (`nextAttempt`, el
mismo que usa el planificador). Pruebas en `routes-worker.test.ts` y `cli-worker.test.ts`.

## Tarea 3 · El vigilante

- `decision.opened` y `decision.updated` se entregan siempre, aparezcan o no en `--types`. Es lo menos sorprendente:
  ningún director quiere perderse una Decisión, y añadirlos no rompe ninguna lista.
- `watcher-cursors.json` pasa a `version: 2`, con un cursor por sesión. Rearmar con otra lista de tipos sigue desde el
  último evento entregado a esa sesión. Un archivo `version: 1` (clave `[sesión, tipos]`) migra solo: cada sesión
  queda con el mayor de sus cursores.
- Pruebas en `tests/watcher.test.ts`: rearme con tipos distintos, Decisión fuera de la lista y migración v1.

## Aceptación en KratosFabTest

Datos nuevos `--data .nomos-hito21`, puerto 18931, servicio de este worktree. El 8780 no se paró. Se repitió tras
el reinicio del equipo, con el árbol final (incluido el ajuste de `updated_at`) y una carpeta de datos nueva; abajo, esa
pasada. El estado de partida
se preparó con las funciones del propio servicio, como lo habrían dejado workers reales: A, B y C con la revisión
aprobada en «revisando» (40, 40 y 15 min sin cambios); D preparada, con el intento 1 terminado y una Decisión abierta
para que el arranque nuevo se encole sin lanzar un worker real; el planificador, en pausa.

```
== 14:56:20Z nomos start --port 18931 --no-open
ARRANCADO
== 14:56:21Z nomos task hold A --motivo "Un Unreal pesado a la vez: espero a J5.1" --hasta integration.completed
waitReason: En espera: Un Unreal pesado a la vez: espero a J5.1
== 14:56:21Z espera de 15 s (tres pasadas del barrido)
A «J2.0a · retenida a propósito»: estado=revisando · Decisión=ninguna · En espera: Un Unreal pesado a la vez: espero a J5.1
B «J2.0c · aprobada sin espera»: estado=revisando · Decisión=«Revisión aprobada: falta pedir la integración» opciones=Pedir la integración (recomendada) / Cancelar
C «J2.0d · aprobada hace 15 min»: estado=revisando · Decisión=ninguna
nomos status → holds: [{"title":"J2.0a · retenida a propósito","text":"En espera: Un Unreal pesado a la vez: espero a J5.1","untilEvent":"integration.completed"}]
== 14:56:37Z nomos worker start D (sin --attempt)
commandId nuevo: true · intento 1 era 6a5fc8c2 · devuelto 6dfddb3d
== 14:56:37Z nomos worker start D (repetido)
mismo commandId que el anterior: true
worker.start de D: [{"intento":1,"clave":"worker.start:D:1","estado":"done"},{"intento":2,"clave":"worker.start:D:2","estado":"pending"}]
== 14:56:37Z nomos vigila --session acept21 --types run.finished (10 s)
9 eventos; tipos: ["run.finished","decision.opened"] · último seq 27
Decisiones recibidas: ["24 decision.opened Aceptación hito 21: no lanzar worker real","27 decision.opened Revisión aprobada: falta pedir la integración"]
watcher-cursors.json: {"version":2,"cursors":{"acept21":33}}
== 14:56:47Z rearme: --types task.priority,worker.waiting,run.finished (a los 4 s, nomos task priority C 1)
1 eventos: ["35 task.priority"] · ninguno anterior al cursor: true
== 14:56:57Z nomos stop
DETENIDO
```

Después: ningún proceso `node` con este worktree o `.nomos-hito21` en la línea de órdenes; 8780 y 8781 seguían
escuchando. `Config/DefaultEngine.ini` de KratosFabTest no se tocó. Con la clave antigua por tipos, la lista nueva habría
empezado en el cursor 0 y habría vuelto a entregar los `run.finished` de A–D que ya había recibido la primera.

## Al reiniciar con el main nuevo (directores)

- Al abrir la base se añade la columna `tasks.hold`; no hay nada que hacer.
- El primer `nomos vigila` reescribe `watcher-cursors.json` en `version: 2`, con el mayor cursor de cada sesión. Si
  rearmaste con varias listas de tipos, se sigue desde el más avanzado, sin reentregar historia. Ya no hace falta
  adelantar el cursor a mano.
- Las Decisiones llegan sin poner `decision.opened` en `--types`.
- Para retener una tarea aprobada, `nomos task hold ID --motivo "…" [--hasta integration.completed|N]`. Con
  `nomos task integrate` la espera se quita sola.
- `nomos worker start ID` sin `--attempt` relanza el intento siguiente; ya no hace falta poner `--attempt N`.
