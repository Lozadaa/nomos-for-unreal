# Aceptación del hito 26 en KratosFabTest

Fecha: 2026-10-29, 15:07-15:26 UTC. Proyecto `C:\Users\richa\Documents\Unreal Projects\KratosFabTest`, datos nuevos
`--data .nomos-hito26`, puerto 57148, `config.json` `{"workerModel":"sonnet","concurrency":{"claude":1},"memory":{"enabled":false}}`
(memoria activa solo en el cierre), graphify real. CLI del worktree `hito26-ensayo`. Los puertos 8780 y 8781 no se tocaron.

## Ensayo de jam

| Hora (UTC) | Paso | Resultado |
|---|---|---|
| 15:07:31 | `nomos jam init --tema "Raqueta contra la pared" --dias 2` | `docs/plan-jam.md` y `config.jam {enabled, days: 2, start: "2026-10-29"}` |
| 15:07:37-41 | Grafo al arrancar (sin `graphify-out/` previo) | `graph.update` `done` en 4 s; `graph.json` 80 nodos; `doctor`: `graphify OK …\graphify.exe` |
| 15:07:59-15:09:37 | «J1 · Log de arranque de la raqueta» (`Source/`), worker Claude sonnet por Orca | Run con `sessionRef` y `--session-id`; commit `aee691a` en el worktree en 42 s; **quedó en `worker.waiting`**: defecto 1 |
| 15:12:09-15:12:29 | Corrección + reinicio + «repite tu NOMOS_DONE» | `run.finished` y `revisando`; fila `tokens` en `spends` |
| 15:13:04-15:13:35 | Revisión sonnet | `review.finished approved:true`, `approval.requested` |
| 15:13:59-15:14:12 | `approval approve` + `task integrate` | `integration.completed` `master@4ab3625`; `graph.update` con `--update`; `graph.json` 12:07:41 → 12:14:11 (hora local) |
| 15:14:46 | `task finalize` de J1 | `done` |
| 15:13:39-15:19:30 | «Cierre J1: build jugable» (dependía de J1) | Arrancó con J1 aprobada pero sin integrar; el servicio pidió «Falta fusionar master» (2.ª vuelta, 15:15:07); revisión aprobada 15:19:02; integrado `master@f15a988` |
| 15:19:46 | `finalize` sin build | `task.closing_blocked condition: approval`, «Falta tu aprobación sobre la build jugable» |
| 15:20:04-15:22:58 | Build real con `buildCookRun` (`unreal-build.ts`) | `ok: true`, 2,9 min, sin errores, `KratosFabTest.exe` |
| 15:23:17 | `nomos build stamp Build/Windows-hito26` + `play --status` | `Build estampada: f15a988 (master)`; «Build de f15a988, 0 min, al día con main», `stale: false` |
| 15:23:44-15:23:53 | `approval approve` → `finalize` (memoria activada) | `approval.approved` → `task.done` → `memory.saved` `knowledge/20261029T152353-fd57d248139b.md` (fuente `docs/produccion/J1.md @ f15a988`, 2 lecciones); `reanudacion.md` con `## Lecciones` |
| 15:24:22 | «Cierre J2» abierto, `jam.start` → 2026-10-27, reinicio | **Sin Decisión**: defecto 4 (el barrido corre al arrancar y cada 10 min) |
| 15:25:32 | Corregido y reiniciado | Sin Decisión: J1 se aprobó a las 15:23 (correcto) |
| 15:25:59 | Aprobaciones atrasadas 25 h en la base (entrada, no la Decisión) y reinicio | `decision.opened` «Hoy no hay build jugable aprobada» (Recortar/Seguir) a las 15:26:00 |
| 15:26:25 | Parada y limpieza | `DETENIDO`; ningún `node` con `nomos-hito26`; nota borrada (`profiles/personal/knowledge/20261029T152353-fd57d248139b.md`); `docs/plan-jam.md` borrado, `Docs/produccion/J1.md` retirado en `4b37faa`, paquete borrado; worktrees de workers retirados por el cierre |

Tokens visibles en la ficha (`task show` → `tokens` por run), en Producción («Tokens del proyecto: 1,6 M»,
[captura](capturas-26/produccion-tokens-1366.png)) y en `nomos status` (`{"total":1629126,"porRol":{"implementacion":836627,"revisor":792499}}`).

## Tokens del ensayo (sonnet; entrada fresca + caché)

| Run | Rol | Turnos | Registrado en `spends` | Transcripción completa | Salida |
|---|---|---|---|---|---|
| `67ba86ca` J1 | worker | 7 | 537 791 | 642 179 | 2 126 |
| `fc6fc7e0` J1 | revisor | 4 | 279 198 | 279 198 | 929 |
| `92cd86c3` Cierre J1 | worker (2 vueltas) | 7 | 298 836 | 558 823 | 1 695 |
| `4ea178eb` Cierre J1 | revisor | 7 | 513 301 | 513 301 | 2 279 |
| **Total** | worker / revisor | | 836 627 / 792 499 = **1 629 126** | 1 201 002 / 792 499 = **1 993 501** | 7 029 |

La diferencia son los defectos 2 y 3 (ya corregidos para las runs nuevas).

## Defectos

| # | Qué | Estado |
|---|---|---|
| 1 | Claude Code 2.1.312 pinta «No changes this session» a la derecha de `NOMOS_SKILLS`; la marca no decodificaba y su bucle se tragaba las filas de debajo, incluido `NOMOS_DONE` | Corregido `a031ffe` (prueba con la pantalla real) |
| 2 | Una run reabierta (fusionar master) solo contaba los tokens de la primera vuelta | Corregido `96b4dc4` |
| 3 | La medición 2 s tras el fin perdía el último turno de la transcripción | Corregido `cacfc68` (espera 30 s) |
| 4 | La Decisión de 24 h medía desde la creación de la tarea de cierre, no desde `jam.start` ni desde la última build aprobada | Corregido `75899bb` |
| 5 | Una dependencia cuenta como cumplida con la revisión aprobada sin integrar: el cierre arrancó sobre la base vieja y gastó una vuelta extra | Pendiente, ver [pendientes](pendientes.md) |
| 6 | La revisión del cierre pedida a las 15:14:43 no arrancó hasta las 15:17:58 | Pendiente, ver [pendientes](pendientes.md) |

## Lo que no se probó

- Jugar la build: se empaquetó y estampó, pero nadie abrió el `.exe` ni buscó el log «lista para jugar».
- La comprobación `check:build` de una tarea (la build la lanzó el director con el adaptador, no un `checks.run`).
- Si la sincronización Git de Second Brain llegó a subir la nota antes de borrarla.
- La Decisión de 24 h con el reloj real: se atrasaron las aprobaciones en la base para no esperar 24 h.
