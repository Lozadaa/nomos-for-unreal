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

- Aplica TDD: observa la prueba fallar antes de implementar cada comportamiento.
- Haz un commit por paso. No hagas push ni merge.
- No incluyas .nomos-brief.md ni .nomos-inbox en commits.
- Termina con una línea NOMOS_DONE seguida de JSON con summary string, commits string[] y tests passed, failed o none.
- Si necesitas una decisión, imprime una línea NOMOS_ASK seguida de JSON con question string y espera.
- Los marcadores deben comenzar la línea; no los repitas como ejemplos de salida.

Formato de cierre: `NOMOS_DONE {"summary":"Resumen","commits":[],"tests":"passed"}`.
Formato de pregunta: `NOMOS_ASK {"question":"Tu pregunta"}`.

Dos formas de entregar la marca: la línea de arriba, o el mismo JSON (sin el marcador) en
`.nomos-inbox/done.json` (`.nomos-inbox/ask.json` para preguntas). Si el JSON pasa de una línea
(resumen largo, varios commits), usa el archivo: el terminal parte las líneas largas y Nomos lee el
archivo antes que la pantalla.

## Contexto del proyecto

{{context}}
