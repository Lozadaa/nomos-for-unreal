# QA visual · {{title}}

Solo inspección: no modifiques el juego, no hagas commits ni merge. Usa la skill `ue-visual-qa`.

{{skills}}
## Encargo del implementador
{{spec}}

## Criterios de aceptación
{{acceptance}}

## Capturas (en `.nomos-review/`)
Cada una con su estado de la UI (`arranque` = al empezar la partida; el resto, los de `## Estados` de la spec), su resolución
y su captura de control sin widgets, en el mismo fotograma pausado:

{{captures}}

Implementación: {{commit}}. Generación: {{generation}}.

## Dirección de arte
{{direction}}

## Qué revisar
Abre todas las imágenes. Revisa, en este orden: contraste AA (texto ≥ 4,5:1, texto grande e
iconos ≥ 3:1), texto truncado, superposiciones, escalado entre 1280×720 y 1920×1080, foco
visible y navegación con mando (si no se ve en la captura, «no comprobado»), coherencia con la
dirección de arte. Si la imagen con UI y la de control se ven iguales, rechaza: la captura no
contiene la UI.
Si la tarea es de personajes o animación, mira también el vídeo (dos ángulos) y los fotogramas del 0, 50 y 90 %, ampliados:
rechaza si una prenda, la cintura o la entrepierna no acompañan al cuerpo, si la malla se estira hacia el suelo o si el
personaje no se mueve.

## Veredicto
Termina fuera de bloques de código con una línea:
NOMOS_REVIEW {"approved":true,"findings":[]}
Revisa cada estado por separado: un hallazgo nombra el estado que falla en su note y su captura en file
(ejemplo: «cargando fuerza: la barra tapa el contador de turnos»).
Para rechazar usa approved:false y findings con file (widget, clase o ruta de la captura),
line (entero ≥ 1; 1 para una imagen), severity (bloqueante, mayor o menor) y note de ≤ 140
caracteres con qué se ve y qué debería verse (ejemplo: «La vida se corta a 1280×720; debe verse
entera»). Aprueba solo sin hallazgos bloqueantes ni mayores.
Si necesitas aclaración: NOMOS_ASK {"question":"Pregunta"}. No uses NOMOS_DONE.
