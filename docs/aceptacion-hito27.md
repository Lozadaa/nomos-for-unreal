# Aceptación del hito 27 en KratosFabTest

Fecha: 2026-10-29, 18:48:57-18:50:43 UTC. Proyecto `C:\Users\richa\Documents\Unreal Projects\KratosFabTest`, datos nuevos
`--data .nomos-hito27`, puerto 57270, `NOMOS_LAUNCHER=process`, `NOMOS_MEMORY=off`, `NOMOS_GRAPHIFY=off`. CLI del worktree
`hito27-director-evento`. Los puertos 8780 y 8781 no se tocaron (ningún servicio escuchando antes ni después).

`config.json`: `{"director":{"mode":"evento","debounceSeconds":5},"models":{"director":"sonnet"},"concurrency":{"claude":0},
"memory":{"enabled":false},"graphify":{"enabled":false}}`.

## Recorrido

| Hora (UTC) | Paso | Resultado |
|---|---|---|
| 18:48:57 | `nomos start --data .nomos-hito27 --port 57270 --no-open` | `ARRANCADO`; sin vigilante ni sesión de director |
| 18:49:02 | Mensaje del usuario por la API del panel (`POST /messages`): «¿qué tareas hay abiertas ahora mismo?» | `message.received` seq 1 |
| 18:49:08 | Ventana de 5 s cumplida → `director.wake` | `.nomos-hito27/director-brief.md` (32 líneas); run `308f8583` `role: director`, `taskId: director`, `model: sonnet`; `claude -p --model sonnet --dangerously-skip-permissions --session-id …` real, proceso hijo en la raíz del juego |
| 18:49:27-28 | El director actúa con la CLI | `message.read` → `director.typing` → `message.replied` «Ahora mismo no hay ninguna tarea abierta.» |
| 18:49:38 | Proceso salido y terminal en reposo dos sondeos | `run.finished done`, resumen «Respondí al mensaje 1 («Ahora mismo no hay ninguna tarea abierta») tras confirmar su recepción.»; terminal cerrado |
| 18:50:0x | `run.tokens` (30 s después) | fila `tokens` en `spends`: 182 739 (ver abajo); `/status.tokens` `{"total":182739,"porRol":{"director":182739}}` |
| 18:50:2x | Producción (build del panel del worktree) | «Director: 1 despertar · 0,2 M tokens» ([captura](capturas-27/produccion-director-1366.png)) |
| 18:50:43 | `nomos stop --data .nomos-hito27` | `DETENIDO`; nada escucha en 57270 |

Su `run.finished` y sus órdenes `director.*` no volvieron a despertarlo: una sola run de director en la base.

## Tokens del despertar (sonnet)

| Entrada fresca | Caché leída | Caché escrita | Total registrado | Salida | Turnos |
|---|---|---|---|---|---|
| 6 | 137 873 | 44 860 | **182 739** | 450 | 3 |

Contra el director permanente de Block Kings (467 k de contexto por turno), un despertar entero cuesta menos que un turno.
La mayor parte es el prompt de sistema y las skills cargadas (caché), no el brief.

## Pruebas con Orca falso (`tests/service/director-wake.test.ts`)

- Dos eventos dentro de `debounceSeconds` → un solo `director.wake`; el brief recoge los dos.
- Con un director en marcha no se lanza otro; el mensaje llegado durante la sesión lanza el siguiente al terminar.
- Sus propios eventos (`run.finished` de la run `director`, `command.*` de `director.*`) no lo despiertan.
- Plazo de 20 min: run `failed`, terminal cerrado, `command.failed` de `director.poll`; el siguiente evento vuelve a lanzar.
- Modo `sesion` (por defecto): nunca se lanza. El director no ocupa cupo de workers Claude. `GET /runs/:id` responde sin tarea.

## No probado

- Lanzamiento por Orca (`terminalCreate` en la raíz del juego con Orca abierto): la aceptación usó el lanzador de proceso.
  Con Orca, la sesión es interactiva y termina cuando la TUI queda en reposo dos sondeos; sin ensayo real.
- La skill `/nomos` global apunta al `main` sin la sección «Modo evento»; el director siguió el brief igualmente.
- Equipo, Decisiones y aprobaciones en un despertar real (solo con base de ejemplo en `director-brief.test.ts`).
