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
- Aplica TDD: observa la prueba fallar antes de implementar cada comportamiento.
- Haz un commit por paso. No hagas push ni merge.
- Si la tarea es un cierre de hito (título «Cierre…»), el informe (`docs/produccion/J<n>.md`) termina con `## Lecciones`: de 1 a 5 líneas que sirvan en otro juego (qué falló, qué funcionó, qué regla sale). Sin esa sección el cierre se bloquea.
- No incluyas .nomos-brief.md ni .nomos-inbox en commits.
- Termina con una línea NOMOS_DONE seguida de JSON con summary string, commits string[] y tests passed, failed o none.
- `summary` ≤ 280 caracteres: qué cambió para quien juega o mira, sin commits, pruebas ni cifras (eso va en `commits` y `tests`). Ejemplo: «El rival cae al suelo al recibir el tercer golpe».
- Si la tarea cambia lo que se ve o se juega, `focus` es obligatorio: de 2 a 4 frases de en qué fijarse al probarlo.
- Si corriges después de NOMOS_DONE, commitea y repite la marca; tras una corrección, una marca sin commit nuevo solo cuenta con commits [].
- Si necesitas una decisión, imprime una línea NOMOS_ASK seguida de JSON con question string y espera.
- Los marcadores deben comenzar la línea; no los repitas como ejemplos de salida.
{{turn}}{{rapido}}
Formato de cierre: `NOMOS_DONE {"summary":"Resumen","commits":[],"tests":"passed"}`.
Formato de pregunta: `NOMOS_ASK {"question":"Tu pregunta"}`.

Dos formas de entregar la marca: la línea de arriba, o el mismo JSON (sin el marcador) en
`.nomos-inbox/done.json` (`.nomos-inbox/ask.json` para preguntas). Si el JSON pasa de una línea
(resumen largo, varios commits), usa el archivo: el terminal parte las líneas largas y Nomos lee el
archivo antes que la pantalla.

## Contexto del proyecto

{{context}}
