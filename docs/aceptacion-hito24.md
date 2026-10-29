# Aceptación del hito 24 en KratosFabTest

Fecha: 2026-10-29, 05:42-05:43 UTC. Proyecto `C:\Users\richa\Documents\Unreal Projects\KratosFabTest`, datos nuevos
`--data .nomos-hito24`, puerto 57146, sin `config.json`, `NOMOS_GRAPHIFY=off`. CLI del worktree `hito24-director-barato`.
Los servicios de los puertos 8780 y 8781 no se tocaron.

## Tarea 3 · Reanudación automática

| Paso | Resultado |
|---|---|
| `nomos start --port 57146 --no-open` | `ARRANCADO` |
| `nomos pausar` | `paused: true`: el planificador no lanza ningún worker real sobre el juego |
| `nomos task create --title 'Bloqueo con escudo (aceptación hito 24)' --area gameplay --spec-file …` | Tarea `4c6080a5` en `preparada`, espera «Director en pausa» |
| `nomos task hold 4c6080a5 --motivo 'Parada para la aceptación del hito 24'` | `hold` con el motivo; la tarea queda parada |
| `nomos stop` (05:43:09) | `DETENIDO`; el servicio escribe `.nomos-hito24/reanudacion.md` al parar (05:43:09.604) |
| Contenido | 35 líneas: servicio `parado` y versión `deb9226`; tabla de tareas `preparada · Bloqueo con escudo… · Director en pausa`; Decisiones «Ninguna»; hold «En espera: Parada para la aceptación del hito 24»; lecciones vacías; orden `nomos vigila --session <sesion> --data "…\.nomos-hito24" --types message.received,…,task.closing_blocked` |
| `nomos reanudacion --data .nomos-hito24` (servicio parado) | Reescribe el archivo (05:43:14) con el mismo contenido y lo imprime |
| Procesos | Ningún proceso `node` con `hito24` en la línea de órdenes tras `nomos stop` |

## Pruebas automáticas

| Tarea | Prueba | Resultado |
|---|---|---|
| 1 · Modelo por rol | `default-provider.test.ts`: `--model` por rol con y sin `models`, `workerModel` como defecto de implementación, `models` inválidos | Verde |
| 1 | `review-claude.test.ts`: el revisor arranca con `models.revisor`, no con `workerModel` | Verde |
| 2 · Tokens | `run-tokens.test.ts`: `.jsonl` de 3 turnos y dos modelos (líneas repetidas de un mensaje cuentan una vez) → 3 835 de entrada, `turns: 3`, modelo mayoritario | Verde |
| 2 | Run sin transcripción: reintento a los 60 s y después fila en 0 con «sin transcripción»; `tokensByRole` para `nomos status` | Verde |
| 2 | e2e `tokens.spec.ts` (Chromium y Firefox, 1366×768): «Tokens: 1,3 M · 42 turnos · opus», total de la tarea y total del proyecto con reparto por rol en el `title` | Verde · [captura](capturas-24/tokens-1366.png) |
| 3 · Reanudación | `resume.test.ts`: base con 3 estados, 1 Decisión y 1 hold → ≤ 60 líneas con todo y la orden del vigilante | Verde |
| 3 | `finalize.test.ts`: el cierre deja `reanudacion.md` al día (`0 abiertas, 1 terminadas`) | Verde |

## Lo que no se probó

- Tokens de una run real de Claude Code lanzada por Orca: la lectura se probó con una transcripción de ejemplo, no con un worker vivo.
- `lessons`: el cierre todavía no guarda ese campo, así que la sección de lecciones sale vacía (lo trae el hito 25).
