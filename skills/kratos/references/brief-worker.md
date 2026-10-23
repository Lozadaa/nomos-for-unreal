# {{title}}

Proveedor: {{provider}}. Rol: {{role}}. Skills: {{skills}}.

## Especificación

{{spec}}

## Criterios de aceptación

{{acceptance}}

## Alcance permitido

{{scope}}

No tocar archivos fuera de este alcance. Si el alcance resulta insuficiente, pide una decisión.

## Reglas

- Aplica TDD: observa la prueba fallar antes de implementar cada comportamiento.
- Haz un commit por paso. No hagas push ni merge.
- No incluyas .kratos-brief.md ni .kratos-inbox en commits.
- Termina con una línea KRATOS_DONE seguida de JSON con summary string, commits string[] y tests passed, failed o none.
- Si necesitas una decisión, imprime una línea KRATOS_ASK seguida de JSON con question string y espera.
- Los marcadores deben comenzar la línea; no los repitas como ejemplos de salida.

Formato de cierre: `KRATOS_DONE {"summary":"Resumen","commits":[],"tests":"passed"}`.
Formato de pregunta: `KRATOS_ASK {"question":"Tu pregunta"}`.

## Contexto del proyecto

{{context}}
