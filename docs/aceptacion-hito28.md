# Aceptación del hito 28 · Líneas base por aprobar

29 oct 2026, 19:08-19:16 UTC. Proyecto `C:\Users\richa\Documents\Unreal Projects\KratosFabTest` (el original), datos nuevos
`--data .nomos-hito28`, puerto 58428, `NOMOS_MEMORY=off`, `NOMOS_GRAPHIFY=off`, `NOMOS_LAUNCHER=process`, registro de
proyectos en un temporal y `concurrency.claude: 0`. Nomos del worktree `hito28-lineas-base`, Unreal 5.8 real. Los puertos
8780 y 8781 y Block Kings no se tocaron.

La tarea («Luz de AnimTest», área escenarios) lleva una run implementadora terminada sin worktree (escrita en la base con
`startRun`/`finishRun`), así que la comprobación corre sobre el checkout del juego; el `.umap` se pasa en `checks.run.files`.

## Recorrido

| Hora (UTC) | Paso | Resultado |
|---|---|---|
| 19:08:21 | `nomos start --data .nomos-hito28 --port 58428 --no-open` | `ARRANCADO` |
| 19:08:50 | `checks.run` con `Content/Kratos/Maps/AnimTest.umap` | AnimTest es el mapa de animación (`animMap`): no cuenta como mapa de juego y se capturó el de por defecto, `/Engine/Maps/Entry`. Se adoptó la línea base antigua sin mapa (`map-1280x720.png` → `map-Entry-…`) y falló al 68,54 %. Se devolvió a su nombre a mano |
| 19:13:19 | `checks.run` con `Content/AdvancedCelShader/Maps/Sample.umap` (sin línea base) | 19:14:22 `test.passed`: «Sin línea base aprobada; propuesta enviada: map-Sample-1280x720»; `approval.requested` con `baseline`; `Docs/baseline/propuestas/map-Sample-1280x720.png` |
| 19:14:43 | «Por aprobar» del panel (build del worktree) | Tarjeta «Línea base: map Sample 1280x720» con la propuesta, «Aprobar» y «Rechazar» ([captura](capturas-28/aceptacion-1-propuesta-1366.png)) |
| 19:14:45 | **Aprobar** en el panel | `baseline.approved`; la propuesta pasa a `Docs/baseline/map-Sample-1280x720.png` y `propuestas/` queda vacía ([captura](capturas-28/aceptacion-2-aprobada-1366.png)) |
| 19:15:46 | `nomos stop --data .nomos-hito28` | `DETENIDO`; nada escucha en 58428 |

Después: se borraron `map-Sample-1280x720.png`, `propuestas/` y `.nomos-hito28`. Las cinco líneas base de
`Docs/baseline/` tienen el mismo MD5 que antes y `git status` del juego es idéntico al de antes de empezar.

## Capturas (1366×768, `docs/capturas-28/`)

| Archivo | Qué se ve |
|---|---|
| `linea-base-por-aprobar-1366.png` | E2E (`panel/e2e/aprobar.spec.ts`): propuesta, actual y diferencia en rojo, con Aprobar y Rechazar |
| `aceptacion-1-propuesta-1366.png` | KratosFabTest: la primera captura de `Sample` como propuesta |
| `aceptacion-2-aprobada-1366.png` | Tras «Aprobar»: «Aprobada · ya es la línea base» |

## Hallazgo

| Qué pasó | Arreglo |
|---|---|
| Las imágenes de la tarjeta no cargaban: el service worker solo pasaba `?token=` a la cabecera en `/artifacts/*` y otras rutas | `panel/public/sw.js` incluye `/approvals/*` (también arregla las imágenes pegadas en comentarios) |

## Lo que no se probó

| Qué | Por qué |
|---|---|
| Tercera comprobación de `Sample`, ya contra la línea base aprobada | Se encoló a las 19:15:31, pero se paró el servicio con la comprobación aún `pending`: el equipo iba justo de memoria (2 GB libres) y Claude Code cortó la espera. Ese camino (aprobada → «igual a la línea base») está cubierto en `tests/service/baseline-map.test.ts` |
| `visual: cambia` con diff y «Rechazar» en Unreal real | Solo en pruebas (`baseline-map.test.ts`, `cli-approval.test.ts`, e2e) |
| La línea base sin mapa adoptada (hito 5b) cuenta como aprobada y juzga | Así lo pide el plan («las existentes se consideran aprobadas»); en KratosFabTest esa antigua es de otro estado del mapa y falla |
