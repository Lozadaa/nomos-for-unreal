# Ciclo UMG

Toda pantalla de UI pasa por crear → jugar → capturar → QA visual → corregir. Nomos dirige;
el servicio ejecuta. Nada de esto lo hace el director a mano.

## Antes de la primera pantalla

Si el juego no tiene `docs/ui-direction.md`, la primera tarea de área `ui` es para
`game-ui-art-director` (rol `ui`, spec «Dirección de arte de la UI»). Las demás tareas de UI
dependen de ella (`--depends`). El brief de todo worker `ui` incluye ese archivo si existe.

## Secuencia

1. El worker `ui` termina con `NOMOS_DONE` → `run.finished`.
2. El servicio encola `ui.cycle {taskId, runId}` (clave por run y corrección).
3. `ui.cycle` reserva `editor/<juego>` y, a 1280×720 y 1920×1080, lanza el juego con `-game`,
   captura con UI y sin UI (`Shot showui`, juego pausado) y compara: menos del 0,5 % de píxeles
   distintos → `TestRun umg failed` «la captura no contiene la UI» y corrección al implementador.
   Si la spec trae `## Estados`, en la misma sesión de juego, tras esas capturas de arranque, cada
   estado aplica `checks.captureCvars` y sus órdenes, espera 3 s, pausa y vuelve a capturar con y
   sin UI: todos a 1280×720 y solo el primero a 1920×1080. Un estado sin UI falla con su nombre
   («1280×720 · fin de partida: la captura no contiene la UI»); los demás se miden igual.
4. Con UI visible, la prueba `umg` queda `running` y se encola `review.start` con `qa`: un run
   revisor de Claude con `ue-visual-qa` y las capturas en `.nomos-review/`.
5. `NOMOS_REVIEW` aprobado → `TestRun umg passed`. Rechazado → `umg failed` y los hallazgos
   vuelven al mismo implementador como corrección; el siguiente `NOMOS_DONE` repite el ciclo.
6. La revisión de código (`nomos task review`) sigue siendo independiente. La tarea pasa de
   `probando` a `integrando` solo con todas sus comprobaciones en `passed`.

## Estados de la UI (`## Estados` en la spec)

Una HUD con varios estados (apuntando, cargando fuerza, turno de la CPU, fin de partida con panel)
no se juzga con la captura de arranque. Escribe en la spec de la tarea `ui`:

```markdown
## Estados
- apuntando: Metras.Estado 0
- cargando fuerza: Metras.Estado 1; Metras.Fuerza 0.6
- fin de partida: Metras.FinPartida 1
```

Cada línea es `- nombre: orden1; orden2`: CVars o comandos de consola (exec) que el juego debe
exponer para poner ese estado; el worker los implementa si no existen (inclúyelo en el alcance y
en los criterios). Sin comas ni comillas, como `checks.captureCvars`; `nomos task create --spec-file`
rechaza lo que no cumpla. Las capturas quedan como artefactos con `{check:'umg', resolution, estado}`;
el QA visual las recibe etiquetadas y nombra el estado que falla. Los estados no tienen línea base:
solo la captura de arranque se compara.

## Qué hace Nomos

- `review.finished` con `qa`: responde al usuario con veredicto, número de hallazgos y las rutas
  de las capturas (`nomos task show <id>` → artefactos `screenshot`).
- `test.failed` de `umg`: no reenvíes nada, el servicio ya avisó al implementador; informa en una línea.
- Para relanzar a mano: `nomos task check <id>` (si `umg` no tiene ciclo aprobado en el commit
  actual, encola `ui.cycle`).

## Límites conocidos

- La captura es del juego en `-game`, no de PIE: en el editor por lotes PIE captura la ventana
  entera del editor.
- El widget debe estar en el viewport al arrancar el mapa (o en ≤ 20 s).
- El QA ve capturas fijas: no prueba input ni animaciones. Los estados solo se ven si una orden de
  consola los provoca (`## Estados`).
