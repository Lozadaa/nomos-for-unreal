# Ciclo UMG

Toda pantalla de UI pasa por crear → jugar → capturar → QA visual → corregir. Kratos dirige;
el servicio ejecuta. Nada de esto lo hace el director a mano.

## Antes de la primera pantalla

Si el juego no tiene `docs/ui-direction.md`, la primera tarea de área `ui` es para
`game-ui-art-director` (rol `ui`, spec «Dirección de arte de la UI»). Las demás tareas de UI
dependen de ella (`--depends`). El brief de todo worker `ui` incluye ese archivo si existe.

## Secuencia

1. El worker `ui` termina con `KRATOS_DONE` → `run.finished`.
2. El servicio encola `ui.cycle {taskId, runId}` (clave por run y corrección).
3. `ui.cycle` reserva `editor/<juego>` y, a 1280×720 y 1920×1080, lanza el juego con `-game`,
   captura con UI y sin UI (`Shot showui`, juego pausado) y compara: menos del 0,5 % de píxeles
   distintos → `TestRun umg failed` «la captura no contiene la UI» y corrección al implementador.
4. Con UI visible, la prueba `umg` queda `running` y se encola `review.start` con `qa`: un run
   revisor de Claude con `ue-visual-qa` y las capturas en `.kratos-review/`.
5. `KRATOS_REVIEW` aprobado → `TestRun umg passed`. Rechazado → `umg failed` y los hallazgos
   vuelven al mismo implementador como corrección; el siguiente `KRATOS_DONE` repite el ciclo.
6. La revisión de código (`kratos task review`) sigue siendo independiente. La tarea pasa de
   `probando` a `integrando` solo con todas sus comprobaciones en `passed`.

## Qué hace Kratos

- `review.finished` con `qa`: responde al usuario con veredicto, número de hallazgos y las rutas
  de las capturas (`kratos task show <id>` → artefactos `screenshot`).
- `test.failed` de `umg`: no reenvíes nada, el servicio ya avisó al implementador; informa en una línea.
- Para relanzar a mano: `kratos task check <id>` (si `umg` no tiene ciclo aprobado en el commit
  actual, encola `ui.cycle`).

## Límites conocidos

- La captura es del juego en `-game`, no de PIE: en el editor por lotes PIE captura la ventana
  entera del editor.
- El widget debe estar en el viewport al arrancar el mapa (o en ≤ 20 s).
- El QA ve capturas fijas: no prueba input ni animaciones.
