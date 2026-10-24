# Aceptación del hito 13 · operación sin callejones sin salida

Fecha: 2026-10-24. Rama `hito13-operacion` sobre `main@5257962`. Todo lo de abajo se ejecutó; lo que no, está marcado.

## Commits

| Commit | Tarea |
|---|---|
| `dbd0f97` feat: reconciliar workers sin callejón sin salida | 1 |
| `7bcb5c6` feat: los workers terminados no dejan terminales vivos | 2 |
| `b72a831` feat: el planificador respeta la prioridad del director | 3 |
| `6c8cf5b` test: nomos vigila encadenado entrega cada evento por la tubería | 4 |
| `beeff2a` fix: las marcas largas partidas por el terminal se leen enteras | 5 (adenda) |
| `660211c` fix: rearrancar tras reconciliar con el mismo worktree de Orca | 1, hallado en esta aceptación |

## Pruebas automáticas

Antes de cada commit: `npm test` dos veces, `npm run test:panel`, `npm run build`; skillsmith cuando se tocó la skill;
Playwright cuando se tocó el panel (Tarea 3). Estado final, con el último commit:

- `npm test`: 625/625, dos veces (la base era 592/592).
- `npm run test:panel`: 316/316. `npm run build`: correcto.
- `npx -y @lozadaa/skillsmith@1.2.0 --path skills/nomos --report`: 98 (los mismos dos avisos de siempre: S01 nombre sin gerundio, S03 sin disparador negativo).
- `cd panel && npx playwright test`: 127 aprobadas, 3 omitidas (Tarea 3). Playwright reescribe capturas de hitos anteriores en `docs/capturas-7` y `docs/capturas-10`; se restauraron y no van en ningún commit.

Pruebas nuevas: `tests/service/reconcile.test.ts` (cancelación con árbol limpio que vuelve a arrancar sin Decisión; worker que no cierra → reintento a los 30 s sin tocar el árbol; cambios sin registrar con Descartar, Commitear al run y Esperar; `task reconcile` sobre run incierta con worktree y Git real; la Decisión de `worker.start` con sus tres opciones; mismo id de worktree al rearrancar; bloqueo de un fallo levantado al reconciliar), `tests/service/sweep.test.ts` (fake de Orca), `tests/service/priority.test.ts`, `panel/src/components/TaskRow.priority.test.tsx`, `tests/cli-operacion.test.ts` (`task reconcile`, `--priority`, `task priority`, `vigila | lector` por tubería) y `tests/service/marker-reassembly.test.ts` (pantalla partida a 80 columnas con y sin viñeta o sangría, stream partido entre dos lecturas, límite de 40 líneas / 8 KB, `done.json` y `ask.json`, brief).

## Aceptación real en KratosFabTest

Servicio propio con `--data .nomos-hito13` en el puerto 8793 (el del 8780 no se tocó). `config.json`:
`{"concurrency":{"claude":1,"codex":0,"opencode":0},"workerModel":"sonnet"}`. Orca 1.4.207. Horas en UTC.

### Primera pasada (código de `6c8cf5b`): encontró un fallo

1. 22:49 tarea A «cancelar y reconciliar» creada (`preparada`, prioridad 0), planificador en pausa, `nomos worker start A --provider claude`.
2. 22:50:01 run 1 en marcha. El worker terminó solo en ~18 s (NOMOS_DONE con un commit); a las 22:51:01 `nomos worker stop` sobre esa run ya `done`.
3. Resultado: tarea `preparada`, `worktreeId` nulo, run `uncertain=false` y `discarded=true`, terminal `exited`, carpeta del worktree retirada, evento `task.reconciled`, ninguna Decisión abierta. Orca conservó la rama renombrada `nomos/5f51a593`.
4. 22:51:31 `nomos reanudar`: el planificador arrancó solo el intento 2 (sin Decisión de reconciliar), pero la preparación falló: **`UNIQUE constraint failed: worktrees.id`**. Orca crea el worktree nuevo en la misma ruta y le da el mismo id que al retirado; la fila cerrada chocaba con la clave única. El fallo dejó además la tarea bloqueada con el error de Orca y un worktree huérfano en Orca (creado, sin registrar).
5. Corrección con prueba en rojo primero (`660211c`): la fila cerrada se reutiliza y reconciliar levanta el bloqueo que dejó el fallo de una run de la tarea. El worktree y el terminal huérfanos de este intento se retiraron a mano con `orca terminal close` y `orca worktree rm` (el servicio nunca supo de ellos).

### Segunda pasada (código de `660211c`)

1. 22:59:52 servicio rearrancado, `nomos task reconcile A`: tarea `preparada`, sin bloqueo, sin Decisión.
2. 23:00 `nomos reanudar`: el planificador arrancó solo el intento 3, en la misma ruta y con el mismo id de worktree; el worker terminó. `worker stop` sobre esa run: reconciliada igual que en el paso 3 de arriba.
3. Tarea B «worker vivo» (el worker espera 3 min antes de escribir), creada con `--priority 2`. Con cupo para un solo Claude, al reanudar a las 23:02:07 el planificador arrancó **B antes que A** (más antigua); A quedó con «Sin hueco en claude».
4. 23:03:08, a los 61 s de la run de B en marcha y con su terminal `running`: `nomos worker stop`. A las 23:03:12: run `cancelled`, `uncertain=false`, `discarded=true`, tarea `preparada`, `worktreeId` nulo, terminal `exited`, carpeta retirada, sin Decisiones.
5. 23:03:30 el planificador volvió a arrancar B (intento 2) sin Decisión. Planificador en pausa y `worker stop` a las 23:03:49: terminal `exited`, carpeta retirada.
6. `nomos status`: `workers` = `{"alive":0,"expected":0,"text":"procesos de workers vivos: 0"}`. Esa cuenta es la del barrido al arrancar el servicio (22:59:52); la siguiente tocaba a los 10 min y el servicio se paró antes. Las cinco runs tienen el terminal cerrado (`terminalClosed` o `exited` en Orca), salvo la del intento fallido, que nunca tuvo terminal registrado.
7. 23:04:01 `nomos stop --data .nomos-hito13`: `DETENIDO`.

Quedan en KratosFabTest la carpeta `.nomos-hito13/` (sin seguimiento, como las de hitos anteriores) y las ramas de sus workers. Orca borró la rama que había creado (`nomos-5f51a593`) y la vacía de B, y conservó `nomos/5f51a593`, que tenía un commit: por eso la rama nueva no pisa una existente (`nomos/<id>-<run>`).

### Lo que no se probó en real

- La Decisión «Descartar / Commitear al run / Esperar» al cancelar con cambios sin registrar: solo con fake de Orca y Git real.
- Las opciones «Reconciliar y reintentar», «Reconciliar y dejar preparada» y «Cancelar la tarea»: con la cancelación nueva no se llegó a abrir esa Decisión en real; las cubren las pruebas.
- El cierre (`task finalize`) de una tarea revisada e integrada: la aceptación cierra cancelando; el cierre normal ya cerraba terminales (hito 6) y ahora el barrido lo repite.
- El barrido de los 10 min y el aviso de «más procesos vivos que runs en marcha»: solo con el fake.
- Marcas partidas en un worker real: el caso real del diario de Block Kings (evento 66253, J1.6) se pasó por el lector nuevo y se lee con el resumen correcto; el corte duro a 80 columnas solo se probó con filas sintéticas.
