# {{title}}

Proveedor: {{provider}}. Rol: {{role}}. Skills: {{skills}}.

{{providerInstructions}}

## Especificación

{{spec}}
{{continuation}}
## Criterios de aceptación

{{acceptance}}

## Alcance permitido

{{scope}}

No tocar archivos fuera de este alcance. Si el alcance resulta insuficiente, pide una decisión.

## Reglas

- Explora con el grafo: `graphify query "<pregunta con nombres del código>"` antes de leer archivos; si aún no hay `graphify-out/`, sigue sin él.
- Ponytail full está activo: el diff más corto que funciona.
- Aplica TDD en la lógica (reglas, estados, datos): observa la prueba fallar antes de implementarla. Física y aspecto se comprueban jugando la demo, no con tests.
- Haz un commit por paso. No hagas push ni merge.
- Si la tarea es un cierre de hito (título «Cierre…»), el informe (`docs/produccion/J<n>.md`) termina con `## Lecciones`: de 1 a 5 líneas que sirvan en otro juego (qué falló, qué funcionó, qué regla sale). Sin esa sección el cierre se bloquea.
- No incluyas .nomos-brief.md ni .nomos-inbox en commits.
- Termina con una línea NOMOS_DONE seguida de JSON con summary string, commits string[] y tests passed, failed o none.
- `summary` ≤ 280 caracteres: qué cambió para quien juega o mira, sin commits, pruebas ni cifras (eso va en `commits` y `tests`). Ejemplo: «El rival cae al suelo al recibir el tercer golpe».
- Si la tarea cambia lo que se ve o se juega, `focus` es obligatorio: de 2 a 4 frases de en qué fijarse al probarlo.
- Si corriges después de NOMOS_DONE, commitea y repite la marca; tras una corrección, una marca sin commit nuevo solo cuenta con commits [].
- Si necesitas una decisión, imprime una línea NOMOS_ASK seguida de JSON con question string y espera.
- Los marcadores deben comenzar la línea; no los repitas como ejemplos de salida.
- Antes de `NOMOS_DONE`: `git status --short` vacío y `revisar_acabado.py` sin fallos.
- Si una trampa de Unreal te costó más de 5 min, añade una línea a `docs/aprendido.md` (la regla, no la historia; ≤ 160 caracteres). Ese archivo siempre está en tu alcance.
{{turn}}{{rapido}}
## Mira lo que hiciste

- Cada vez que algo visible cambie, saca una captura del juego en marcha y **ábrela** con la herramienta de leer imágenes.
- Antes de entregar: `Scripts/capturar.ps1 -Demo` deja `docs/capturas/inicio.png`, `mitad.png` y `final.png` con su `.json`.
  Ábrelas las tres y escribe en `docs/hecho.md` una línea `VISTO:` por captura: qué es el protagonista y dónde está, qué le
  amenaza y qué cambiarías si fuera el juego de otro. Si lo último no es «nada», cámbialo y repite (dos veces como mucho).
- Ningún panel de UI es un rectángulo liso semitransparente: dale la forma del motivo de `docs/direccion.md`.

Formato de cierre: `NOMOS_DONE {"summary":"Resumen","commits":[],"tests":"passed"}`.
Formato de pregunta: `NOMOS_ASK {"question":"Tu pregunta"}`.

Dos formas de entregar la marca: la línea de arriba, o el mismo JSON (sin el marcador) en
`.nomos-inbox/done.json` (`.nomos-inbox/ask.json` para preguntas). Si el JSON pasa de una línea
(resumen largo, varios commits), usa el archivo: el terminal parte las líneas largas y Nomos lee el
archivo antes que la pantalla.

{{camino}}## Contexto del proyecto

{{context}}
