# Cómo captura Nomos tu pantalla

Tras tu `NOMOS_DONE` en una tarea de área `ui`, el servicio encola `ui.cycle`:

1. Reserva el editor del proyecto (`editor/<Juego>`); si otro run lo usa, espera en cola.
2. Por cada resolución (1280×720 y 1920×1080) lanza el juego con
   `UnrealEditor-Cmd <uproject> <mapa> -game -windowed -ResX=<w> -ResY=<h> -ForceRes -ExecCmds="py nomos_pie_capture.py"`.
3. El script espera a que haya al menos un `UserWidget` en el viewport (o 20 s más), pausa el
   juego y toma dos capturas con `Shot showui`: con la UI y con los widgets ocultos (control).
4. Si las dos capturas difieren en menos del 0,5 % de los píxeles, la comprobación `umg` falla
   con «la captura no contiene la UI» y la tarea vuelve a ti.
5. Si hay UI, un run de QA de Claude revisa las capturas con `ue-visual-qa`. Sus hallazgos te
   llegan como corrección al mismo run.

## Qué necesita tu widget

- Estar en el viewport al arrancar el mapa (o en ≤ 20 s), sin pulsar nada.
- Ser una subclase de `UUserWidget` (los widgets Slate puros no se listan).
- Verse en la resolución pedida: anclajes y márgenes, no posiciones absolutas para 1080p.
- Mapa: el de la tarea, o el `GameDefaultMap` del proyecto si la tarea no dice otro.

`Shot showui` captura el viewport del juego con Slate/UMG; `HighResShot` no incluye la UI.
En PIE desde el editor por lotes la captura sale de la ventana entera del editor, por eso
Nomos usa `-game`.
