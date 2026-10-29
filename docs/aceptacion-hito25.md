# Aceptación del hito 25 en KratosFabTest

Fecha: 2026-10-29, 06:01-06:03 UTC. Proyecto `C:\Users\richa\Documents\Unreal Projects\KratosFabTest`, datos nuevos
`--data .nomos-hito25`, puerto 57147, `NOMOS_GRAPHIFY=off`. CLI del worktree `hito25-modo-jam`. Director en pausa
(sin workers). Los servicios de los puertos 8780 y 8781 no se tocaron.

## Modo jam y cierre de hito

| Paso | Resultado |
|---|---|
| `nomos start --port 57147 --no-open` y `nomos pausar` | `ARRANCADO`; `paused: true` |
| `nomos jam init --tema "Duelo de golpes en la arena" --dias 2` | Escribe `docs/plan-jam.md` (Idea, mecánica, arena, 3 filas, 5 recortes, 2 hitos con su cierre) y `config.json` `jam: {enabled: true, days: 2, start: "2026-10-29"}` |
| `nomos task create --title 'Cierre J1 · Duelo jugable (aceptación hito 25)' --area qa` | Tarea `a187a79c`; pasada a `cerrando` a mano en la base (no hubo worker que la llevara) |
| `nomos task finalize a187a79c` sin informe | `task.closing_blocked` `condition: lessons`, «Faltan las lecciones» |
| Con `docs/produccion/J1.md` y `## Lecciones` (2 líneas), `finalize` otra vez | `approval.requested` y `task.closing_blocked` `condition: approval`, «Falta tu aprobación sobre la build jugable» |
| Panel «Por aprobar» a 1366×768 | La tarjeta del cierre con el motivo en naranja · [captura](capturas-25/aceptacion-por-aprobar-1366.png) |
| `nomos build stamp <datos>/artifacts/tests/aceptacion-hito25/build/Windows` | `Build estampada: 9a1c3c7 (master)`; `play --status` la da como última build |
| `nomos approval approve e27d11d6` y `finalize` | `approval.approved` (06:02:46.3) → `task.done` (06:02:46.8) → `memory.saved` (06:02:47.0) |
| Nota en Second Brain | `brain.py` devolvió `knowledge/20261029T060247-6910e398f445.md`: «KratosFabTest · J1: lecciones», `learning`, `observed`, fuente `docs/produccion/J1.md @ sin integrar`, las 2 líneas |
| Artefacto de la tarea | `report` «Memoria guardada» con esa ruta |
| `.nomos-hito25/reanudacion.md` | `## Lecciones` con las 2 líneas (antes decía «Sin lecciones») |
| Limpieza | Nota borrada con su ruta (`profiles/personal/knowledge/20261029T060247-6910e398f445.md`); `docs/plan-jam.md` y `docs/produccion/` retirados del juego |
| `nomos stop` (06:03:12) | `DETENIDO`; ningún proceso `node` con `hito25` en la línea de órdenes |

## Pruebas automáticas

| Tarea | Prueba | Resultado |
|---|---|---|
| 1 · `jam init` | `cli-jam.test.ts`: plan con las 6 secciones, 3 filas, 5 recortes, un hito por día; `config.jam` conserva el resto; un segundo `init` falla sin `--force` y no toca el archivo; días inválidos | Verde |
| 2 · Cierre jugable | `finalize.test.ts`: sin aprobación, aprobado sin build, aprobación anterior a la build → bloqueado y pedido en «Por aprobar»; aprobado tras la build → `done` | Verde |
| 2 | `approvals.test.ts`: con `jam.enabled`, cierre con > 24 h sin aprobar abre «Hoy no hay build jugable aprobada» (Recortar/Seguir) una vez; sin jam o con aprobación reciente, nada | Verde |
| 2 | `PorAprobar.test.tsx` y e2e `aprobar.spec.ts` (Chromium y Firefox, 1366×768): la tarjeta bloqueada con su vídeo y el motivo | Verde · [captura](capturas-25/cierre-bloqueado-1366.png) |
| 3 · Lecciones | `finalize.test.ts` con `brain.py` falso: argumentos (`--cwd`, `capture`, título, fuente con commit, `learning`, `observed`), cuerpo, artefacto, `memory.saved` y reanudación | Verde |
| 3 | Sin `## Lecciones` → «Faltan las lecciones»; `brain.py` que falla → `command.failed` con la causa y la tarea cierra igual | Verde |

## Lo que no se probó

- Build real: el ejecutable estampado fue un marcador de 9 bytes en la carpeta de datos, no un paquete de Unreal.
- Ciclo real de worker → revisión → integración del cierre (la tarea se puso en `cerrando` a mano; fuente «sin integrar»).
- La Decisión de 24 h en el servicio vivo (solo prueba unitaria con fechas atrasadas).
