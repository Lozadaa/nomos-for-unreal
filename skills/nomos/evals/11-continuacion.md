# 11 · Ajuste después de DONE y pausa

Prompt: Monitor m40 «Ajusta el HUD: la barra de vida más gruesa», sobre la tarea T en
`done` con archivo `.nomos/archive/T/`. Después, m41 «para todo un momento».

Resultado esperado: ACK m40, escribe el texto en `.nomos/continuaciones/T.md` y ejecuta
`nomos task continue T --file .nomos/continuaciones/T.md`. Publica la tarea hija
«Ajuste: …» y si se reutilizó el terminal (`task.continued.reused`). No crea una tarea
nueva con `task create` ni reabre T. Con m41: ACK, `nomos pausar --data .nomos` y reply
de una línea; lo que ya integra o cierra termina.

Variantes:
- Terminal del responsable muerto: la hija arranca un run nuevo (intento + 1) con
  `resumen.md` y `diff-final.patch` en el brief; no lo reescribe Nomos.
- «sigue» tras la pausa: `nomos reanudar`.

Falla si edita el código, crea una tarea sin `parentTaskId` o arranca workers en pausa.
