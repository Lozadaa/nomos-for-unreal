# Contrato de captura

Cada captura que revisas viene de `ui.cycle` de Nomos y lleva, en el brief y en la procedencia
del artefacto: tarea, run implementador, commit, versión del motor, mapa, resolución, método y fecha.

## Matriz

| Pantalla | 1280×720 | 1920×1080 |
|---|---|---|
| HUD durante el juego | con UI + control | con UI + control |
| Menús (si la tarea los toca) | con UI + control | con UI + control |

Añade mando, ultrapanorámico u otros idiomas solo si la tarea los declara soportados.

## Método

- El juego corre con `-game -windowed -ResX -ResY -ForceRes` desde el editor del proyecto.
- Espera a que haya un `UserWidget` en el viewport, pausa y captura con `Shot showui`.
- La captura de control oculta los widgets en el mismo fotograma pausado: solo cambia la UI.
- Nomos compara ambas antes de llamarte; si difieren menos del 0,5 % no llegas a revisarlas.

## Lo que una captura no prueba

Interacción, input, audio, rendimiento ni lógica. Una barra de vida que «baja al pulsar H» se
comprueba en el recorrido del implementador; tú revisas cómo se ve en el estado capturado.

## Comparar con una referencia

Si hay capturas aprobadas anteriores en `.nomos/artifacts`, mismas resolución y mapa: compara
y señala cambios no pedidos. No actualices referencias para ocultar diferencias.
