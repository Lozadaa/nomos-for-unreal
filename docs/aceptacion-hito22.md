# Aceptación del hito 22 en KratosFabTest

Fecha: 2026-10-25, 16:44-16:47 UTC. Proyecto `C:\Users\richa\Documents\Unreal Projects\KratosFabTest`, datos nuevos
`--data .nomos-hito22`, puerto 57144, `config.json` `{"concurrency":{"claude":1}}`. El servicio del 8780 y el de Block Kings
(8781) no se tocaron (ambos respondían `/health` 200 al terminar). La RAM se simuló con `NOMOS_MACHINE_FAKE` (un JSON en el
scratchpad que se edita en caliente); no se lanzó ningún worker real ni Unreal.

## 1. Recuperación tras un reinicio y comando zombi (Orca real)

Antes de arrancar se sembró en la base: la tarea pesada «J-ANIM Animaciones de pelea» en `implementando` con una run
`running` cuyo terminal no existe en Orca (como tras el reinicio del 25), y un `checks.run` de «J1.2 Golpes» (`done`) aplazado
«Esperando decisión: Comprobación no disponible: animation». RAM simulada: 4,1 GB.

| Hora (UTC) | Qué pasó |
|---|---|
| 16:44:55 | `nomos start` |
| 16:44:57 | `command.cancelled {reason:'decisión caducada'}` para el zombi, al abrir la base (estado `failed`, «Cancelado: decisión caducada») |
| 16:45:05 | La run del terminal muerto pasa a `failed` con `terminal_handle_stale` (10 s tras el arranque; el 25 tardó 59 min) y se encola `worker.recover` |
| 16:45:05 → | `worker.recover` se aplaza cada 5 s con «4,1 GB libres, hacen falta 6»: el relanzamiento respeta la regla de RAM |

## 2. «Por aprobar» (mismo servicio)

`nomos task create --title "J1.6 Reacciones a los golpes" --area gameplay`, después `nomos approval request`,
`nomos approval comment … --text "El destello del golpe me gusta"`, `nomos approval list`, `nomos status` y
`nomos approval approve`:

- `approval.requested` (16:45:21), la lista con 1 pendiente y su comentario, `status.approvals = 1` y
  `holds = ["En espera: Esperando tu aprobación"]`.
- El comentario llegó como `message.received` («Comentario sobre «J1.6 …» (Por aprobar): …») y `approval.commented`.
- `approval.approved` (16:45:22), 0 pendientes. La integración no se pidió porque la tarea no había pasado por revisión
  (`integration: null`, como debe); la guarda `approval_pending` de `task integrate` la cubren las pruebas del servicio.
- La sección del panel con vídeo e imágenes está en la e2e `panel/e2e/aprobar.spec.ts` y su captura en
  `docs/capturas-22/por-aprobar-1920.png`.

## 3. Una pesada espera RAM y arranca al liberarse (Orca fuera del PATH)

Se reinició el servicio sin Orca en el PATH, para que el arranque se viera encolado sin abrir un worker real.

| Hora (UTC) | Qué pasó |
|---|---|
| 16:46:12 | «J2.2 Golpe pesado» (área `animacion`) queda `preparada`; `scheduler.waiting {reason:'4,1 GB libres, hacen falta 6'}` una sola vez |
| 16:46:21 | `nomos status` → `unreal: ["J2.2 espera: 4,1 GB libres, hacen falta 6"]` |
| 16:46:21 | Se edita la RAM simulada a 9,3 GB |
| 16:46:23 | `task.waiting {reason:null}` y el planificador encola `worker.start`, que se aplaza «Orca no está abierto» (lo esperado sin Orca) |
| 16:46:34 | `nomos status` → `unreal: []` |

`nomos stop --data .nomos-hito22` al final: DETENIDO. Ningún proceso `node` con la ruta del worktree quedó vivo y el
registro de proyectos volvió a sus dos entradas.

## Lo que esta aceptación no prueba

- El relanzamiento real en el mismo worktree: la run sembrada apuntaba a un árbol inexistente y, al liberar la RAM,
  `worker.recover` falló con el error de git de esa ruta. El relanzamiento con terminal nuevo y nota de continuación lo cubre
  `tests/service/worker-recover.test.ts` con el fake de Orca y un repositorio real.
- La tarea programada de arranque: solo en seco (`scripts/instalar-arranque.ps1 -WhatIf`), como pedía el encargo.
