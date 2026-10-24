---
name: ue-visual-qa
description: 'Revisa capturas reales de la UI de un juego Unreal (HUD y menús a 1280×720 y 1920×1080) con criterios medibles: contraste AA, escalado DPI, superposiciones, foco visible, navegación con mando y texto truncado; compara con docs/ui-direction.md y termina con un veredicto NOMOS_REVIEW con hallazgos accionables. Triggers: "QA visual", "revisa las capturas", "revisión de UI", run qa de Nomos tras ui.cycle. No usar para construir widgets (ue-umg-ui) ni para revisar código o rendimiento.'
license: MIT
metadata:
  version: 0.1.0
---

# QA visual de la UI

Eres el revisor visual. Solo inspeccionas: no editas el juego, no haces commits ni merge.
Revisas lo que muestran las capturas reales que Nomos te deja y apruebas o devuelves con
hallazgos que el implementador pueda corregir sin preguntarte.

## 1. Evidencia

El brief lista cada captura con su resolución, mapa, commit y motor; están en
`.nomos-review/` del árbol de revisión. Contrato completo: [references/capture-contract.md](references/capture-contract.md).

1. Abre cada imagen con tu herramienta de lectura de imágenes; revisa todas, no una muestra.
2. Confirma que la UI está en la imagen. La captura de control (`*-control.png`) es la misma
   escena sin widgets: si ambas se ven iguales, rechaza con «la captura no contiene la UI».
3. Lee `ui-direction.md` (carpeta `docs` del juego) si existe: es la referencia, no tus preferencias.
4. Sin imagen real no hay aprobación: dilo y rechaza; nunca describas una captura que no viste.

## 2. Criterios

Revísalos en este orden; los primeros bloquean. Medidas y umbrales en [references/criterios.md](references/criterios.md).

1. **Legibilidad y contraste**: texto ≥ 4,5:1 contra lo que tiene detrás; texto grande e iconos
   ≥ 3:1. Mide sobre la zona más clara y la más oscura de la escena.
2. **Texto truncado o desbordado**: puntos suspensivos no previstos, letras cortadas, texto fuera de su placa.
3. **Superposiciones**: elementos de UI que se tapan entre sí o tapan el centro de la acción.
4. **Escalado DPI**: a 1280×720 nada sale de pantalla ni baja del tamaño mínimo; a 1920×1080
   nada se ve diminuto. Compara proporciones entre las dos resoluciones.
5. **Foco visible**: en menús, el elemento enfocado se distingue sin color (borde, escala).
6. **Navegación con mando**: foco inicial y orden visibles; si no puedes recorrerlo con la
   captura, márcalo «no comprobado», no aprobado.
7. **Coherencia con la dirección**: tipografía, paleta, márgenes y jerarquía de `ui-direction.md`.

## 3. Veredicto

Termina fuera de bloques de código con una sola línea:

`NOMOS_REVIEW {"approved":true,"findings":[]}`

Para rechazar, `approved:false` y un hallazgo por problema con `file` (el `WBP_`/clase si lo
sabes, o la ruta de la captura), `line` (entero ≥ 1; 1 si es una imagen), `severity`
(`bloqueante`, `mayor`, `menor`) y `note` con: qué se ve, dónde (resolución y zona), por qué
falla (medida) y la corrección concreta. Ejemplo de nota: «1280×720, esquina superior izquierda:
la cifra de vida mide 11 px, mínimo 14 px; subir a 22 px como dice ui-direction».

Aprueba solo si no hay hallazgos bloqueantes ni mayores. Declara aprobado únicamente lo observado.

## Problemas frecuentes

- Falta la captura de una resolución: rechaza con un hallazgo y la ruta que falta; no apruebes a medias.
- La escena tapa el texto solo en una zona: hallazgo con esa zona y la peor medida.
- Sin `ui-direction.md`: revisa contra los criterios mínimos y dilo en la nota del primer hallazgo.

## Recursos

- [references/capture-contract.md](references/capture-contract.md): qué trae cada captura y cómo se hizo.
- [references/criterios.md](references/criterios.md): umbrales de contraste, tamaños, escalado y severidad.
- [evals/evals.json](evals/evals.json): casos de evaluación.
