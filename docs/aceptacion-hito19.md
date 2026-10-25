# Aceptación del hito 19: el disco no se llena y los workers largos no se cortan

Rama `hito19-retencion` sobre `main@dd6e9ef`.

## Tarea 1 · Retención de paquetes y limpieza

- La comprobación `build` (`service/src/checks/build.ts`) envuelve el empaquetado: al terminar, pase, falle o lance,
  `retainCheck` (`service/src/retention.ts`) saca a la carpeta de la comprobación el log del juego y las capturas que
  estaban dentro del paquete y borra `build/`. Quedan `log.txt`, capturas, hoja, log del juego y traza. El artefacto
  `build` apunta a `Build/Windows-actual/<Proyecto>.exe` si su `build-info.json` coincide (commit, run y fecha); si no,
  `provenance.removed: true` y el panel dice «Empaquetado · paquete retirado (solo se guarda la build actual)» sin
  «Abrir original».
- Con menos de 10 GB libres en la unidad del proyecto la comprobación no empaqueta: `unavailable` con «El empaquetado
  necesita 10 GB libres. Disco: N GB libres · ejecuta nomos clean» (la puerta de pruebas ofrece Reintentar o Continuar).
- `nomos build stamp Build/Windows-actual` borra del árbol desde el que se estampa `Saved/StagedBuilds`,
  `Saved/Paquete-*` y su `Build/Windows-actual` (nunca la carpeta estampada). Estampar otra carpeta no borra nada.
- `nomos clean [--dry-run]` (`service/src/clean.ts`), sin servicio: ver la regla en `skills/nomos/references/cierre.md#disco`.
  Mide con `lstat` (no sigue enlaces ni uniones) y salta todo lo que tenga algo cambiado en los últimos 30 min.
- `GET /status` (y `nomos status`) trae `disk: {free, low, text}`; `low` por debajo de 30 GB.

Pruebas: `tests/service/retention.test.ts` (7), `tests/service/clean.test.ts` (5, Git real con worktrees),
`/status` en `project-status.test.ts`, el caso del panel en `Entregas.revisar.test.tsx`.

## Tarea 2 · Relevo antes del límite de Orca

`service/src/handlers/worker-relay.ts`, llamado desde el sondeo (`worker-poll.ts`) cuando la run no está parada por
una Decisión. A los `orca.maxWorkerMinutes - 15` desde `startedAt` (240 por defecto; el plazo duro `deadlineAt` sale
ahora del mismo valor): escribe `.nomos-inbox/relevo-<run>.md` («Commit WIP: relevo por límite de tiempo») y se lo
manda al terminal; en los sondeos siguientes, en cuanto el árbol está limpio o pasan 5 min, commitea lo que quede
(«… (Nomos)»), añade al `.nomos-brief.md` la sección «Relevo por límite de tiempo» (último commit, 15 últimas líneas
del terminal, «continúa donde lo dejó; no repitas lo hecho»), abre un terminal nuevo en el mismo worktree con la orden
del proveedor y el brief como argumento, cierra la run vieja (`cancelled`, «Relevado por el límite de tiempo de Orca»),
crea la nueva (mismas reservas, `relayOf`, plazo propio) y emite `worker.relayed {taskId, oldRun, newRun}`. La tarea no
cambia de estado y no hay Decisión. Pruebas: `tests/service/worker-relay.test.ts` (4) con el fake de Orca, que ahora
entiende `terminal create`.

## Aceptación en KratosFabTest

2026-10-25, horas UTC. `C:\Users\richa\Documents\Unreal Projects\KratosFabTest` (rama `master`, HEAD `9a1c3c7`), datos
nuevos `--data .nomos-hito19`, puerto 18890, CLI de esta rama. `config.json`:
`{"concurrency":{"claude":1,"codex":0,"opencode":0},"workerModel":"sonnet","orca":{"maxWorkerMinutes":17}}` (relevo a
los 2 min). Los servicios del 8780 y de Block Kings (8781) dieron `/health` 200 antes y después y no se tocaron. Ningún
commit en `master`; `Config/DefaultEngine.ini` sigue sin seguimiento. El token no sale en ninguna salida.

### `nomos clean`

KratosFabTest no tenía `Saved/StagedBuilds`, `Saved/Paquete-*`, `Saved/Video*` ni `Build/Windows-*` reales (solo
`Build/Windows`, que la regla no toca). Carpetas creadas para la prueba, con fecha de hace dos horas salvo las «recientes»:

| Carpeta | Tamaño | Resultado |
|---|---|---|
| `.nomos-hito19/artifacts/tests/aceptacion-viejo/build` (con `log.txt` al lado) | 40 MB | borrada; `log.txt` se queda |
| `.nomos-hito19/artifacts/tests/aceptacion-nuevo/build` (reciente) | 10 MB | no listada |
| `Saved/Paquete-Hito19` | 30 MB | borrada |
| `Saved/VideoHito19` | 20 MB | borrada |
| `Saved/VideoHito19Reciente` (reciente) | 5 MB | no listada |
| `.nomos-hito19/integration/KratosViejo` (no es worktree) | 25 MB | borrada |
| `Build/Windows-Hito19Viejo` | 15 MB | borrada |

`nomos clean --dry-run` listó las cinco y «Se liberarían 130 MB (5 carpetas)» sin borrar; `nomos clean`, las mismas y
«Liberados 130 MB». La primera pasada decía «0 GB» por carpeta (se redondeaba a GB): arreglado en esta rama, ahora KB,
MB o GB según toque (prueba en `clean.test.ts`). Las dos carpetas recientes las borré a mano después.
`nomos status`: `"disk":{"free":85285982208,"low":false,"text":"Disco: 79 GB libres"}`.

### Relevo con un worker Claude sonnet

Tarea «H19 relevo por límite de tiempo» (área qa, alcance `Docs/hito19`): seis partes, un commit por parte y `sleep 60`
entre ellas; si una parte existe, seguir por la siguiente. Planificador en pausa y `nomos worker start <tarea> --provider claude`.
El vigilante que iba a subir el límite a 240 tras el primer relevo falló, así que hubo dos relevos seguidos:

| Hora | Qué pasó |
|---|---|
| 06:11:07 | `worker start`; run `0846d731` en marcha |
| 06:11:41, 06:12:45 | `docs: parte 1`, `docs: parte 2` |
| 06:13:18 | `worker.relay_requested` (2 min de vida): el terminal recibe «Lee el archivo .nomos-inbox/relevo-0846d731.md…» |
| 06:13:24 | Árbol limpio: sin commit de Nomos. `0846d731` `cancelled`, run `f5e27530` en un terminal nuevo del mismo worktree, `worker.relayed` |
| 06:13:37–06:15:38 | `docs: parte 3`, `4`, `5` (el nuevo vio las partes 1 y 2 y siguió) |
| 06:15:35 / 06:15:41 | Segundo relevo: `f5e27530` → `ecfd93ac` |
| 06:15:57 | `docs: parte 6` |
| 06:16:04 | NOMOS_DONE de `ecfd93ac` («Las partes 1 a 5 ya existían con su commit. Añadí la parte 6…»); tarea `revisando` |
| 06:23:56 | `nomos stop --data .nomos-hito19` → `DETENIDO`; 18890 cerrado; terminal del último worker cerrado con `orca terminal close` |

Ninguna Decisión; la tarea pasó `implementando` → `revisando` sin estados intermedios. Los dos terminales relevados
quedaron `exited`. Seis partes, sin repetidas, rama `nomos/6941eb7b`. La nota del brief del tercer worker:
«Último commit: 7b1801a docs: parte 5» y las 15 últimas líneas del terminal anterior.

### Lo que no se ejerció en real

- El commit de Nomos de lo que queda sin commitear y la espera de 5 min (en real el worker siempre lo tenía
  commiteado): cubiertos por `worker-relay.test.ts`.
- La retirada de worktrees de Orca de tareas cerradas por `nomos clean` (`.nomos-hito19` no tenía ninguna) y el borrado
  del paquete al terminar una comprobación `build` con Unreal real: cubiertos por `clean.test.ts` y `retention.test.ts`.

Quedan en KratosFabTest la carpeta `.nomos-hito19/` (sin seguimiento, como las de hitos anteriores) y la rama
`nomos/6941eb7b` con su worktree.
