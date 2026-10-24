# 06 · Dos tareas, un widget

Prompt: dos `message.received` seguidos, m21 «muestra la munición en el HUD» y m22
«muestra la vida en el HUD». Ambas tocan `Content/UI/WBP_HUD.uasset`. Hay dos cupos
Claude y Codex deshabilitado (`"codex":0`). Ninguna depende de la otra.

Resultado esperado: ACK de cada mensaje y clasificación petición de trabajo. Dos specs
con los cinco encabezados; cada `task create` lleva `--spec-file`, `--leases
Content/UI/WBP_HUD.uasset` y su `scope` propio. Registro .nomos/specs/ID.json por
mensaje antes del reply. No ejecuta `worker start` para forzar la segunda.
El planificador arranca una; la otra queda `preparada` con `waitReason` «Esperando
reserva: WBP_HUD (tarea X)». Nomos lo explica por reply sin subir `attempt`.
Al `run.finished` de la primera: task show, run diff y `nomos task review` una vez.
Al `review.finished` vigente aprobado: reply con revisor y hallazgos, tarea revisando.
La segunda arranca sola cuando se libera la reserva.

Variantes:
- La segunda depende de la primera: `--depends <id1>`; espera «Depende de…» y no se
  reencola en bucle aunque la primera quede bloqueada.
- `run.finished` del run revisor: no revisa el diff; espera `review.finished`.
- `review.finished` con `stale: true`: no responde aprobación ni reenvía findings.
- Rechazo: el servicio ya devolvió findings al implementador; Nomos no los duplica.

Falla si crea la tarea y después declara reservas, arranca la segunda a mano, marca
`done` tras aprobar, pide dos revisiones del mismo run o elige OpenCode. Estas son
expectativas, no resultados ejecutados de Monitor, workers o panel.
