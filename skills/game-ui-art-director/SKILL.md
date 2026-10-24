---
name: game-ui-art-director
description: 'Fija la dirección de arte de la UI de un juego Unreal antes de la primera pantalla: lee el estilo 3D del proyecto y escribe ui-direction.md con tipografía, paleta con contraste medido, espaciado, iconografía, jerarquía, estados de foco y mando, con ejemplos de HUD y menús. Triggers: "dirección de arte de la UI", "estilo del HUD", "paleta de la interfaz", primera tarea ui en Nomos. No usar para construir widgets (ue-umg-ui) ni revisar capturas (ue-visual-qa).'
license: MIT
metadata:
  version: 0.1.0
---

# Dirección de arte de la UI

Decide cómo se ve la interfaz antes de que nadie construya una pantalla. El resultado es un
único archivo, `ui-direction.md` en la carpeta `docs` del juego, que el brief de todo worker
de UI incluye. Si el archivo ya existe, se amplía; nunca se reescribe sin una Decisión del usuario.

## 1. Leer el estilo del juego

Mira lo que el proyecto ya tiene; no inventes un estilo ajeno al juego.

1. `Content/`: carpetas de packs (`Fab/`, `Megascans`, estilos tipo `AdvancedCelShader`), mapas
   (`*.umap`) y la UI existente (`Content/UI/`, `WBP_*`). Anota el género visual: realista,
   cel shading, low poly, pixel art…
2. Catálogo de Nomos: `nomos asset search <palabra> --data .nomos` devuelve los packs del
   juego con su categoría y miniatura.
3. Paleta 3D: colores dominantes de los materiales principales y del cielo o la luz del mapa
   (si hay una captura de Nomos en `.nomos/artifacts/tests/`, úsala).
4. Fuentes: `Content/**/Fonts` o las del motor (Roboto) si el proyecto no trae ninguna.

Detalle de qué mirar y cómo medir: [references/leer-estilo.md](references/leer-estilo.md).

## 2. Escribir docs/ui-direction.md

Sigue la plantilla [references/plantilla.md](references/plantilla.md) completa. Cada sección
lleva valores concretos, no adjetivos:

- **Tipografía**: familia, pesos y escala en px a 1080p (título, cuerpo, etiqueta, cifra de HUD);
  mínimo 18 px de cuerpo a 1080p y 14 px a 720p.
- **Paleta**: 5-7 tokens con hex (fondo, superficie, texto, acento, peligro, éxito, foco) y el
  contraste medido de cada par texto/fondo. Texto ≥ 4,5:1; texto grande y bordes de foco ≥ 3:1.
- **Espaciado**: escala de 4 u 8 px, márgenes seguros (5 % por lado para TV) y anclajes del HUD.
- **Iconografía**: trazo o relleno, grosor, tamaño mínimo (24 px a 1080p) y qué conceptos llevan icono.
- **Jerarquía**: qué se ve primero en el HUD y en cada menú; máximo un acento por pantalla.
- **Estados**: normal, hover, foco, pulsado y desactivado, con el cambio exacto de cada uno.
- **Foco y mando**: foco inicial por pantalla, orden de navegación, botón de volver y anillo de
  foco visible con mando y teclado.
- **Ejemplos**: el HUD de juego (p. ej. barra de vida) y un menú de pausa descritos con esos tokens.

## 3. Entregar

Commit con `ui-direction.md` y un resumen de tres líneas: estilo leído, paleta elegida y
decisiones abiertas. Si el estilo del juego no se puede leer (proyecto vacío), escribe una
dirección neutra y márcala «provisional» en la primera línea.

## Comprobación

Antes de terminar verifica: todos los pares de la paleta tienen su contraste anotado y cumplen
los mínimos; hay tamaños para 1280×720 y 1920×1080; cada estado tiene un cambio visible además
del color (forma, borde o escala) para no depender solo del color.

## Problemas frecuentes

- El proyecto no tiene mapas ni packs: dirección neutra marcada «provisional».
- Un color del equipo no llega al contraste mínimo: no lo cambies; anótalo como decisión abierta.
- La UI existente contradice la escena 3D: manda la UI existente si ya está aprobada; si no, pregunta.

## Recursos

- [references/leer-estilo.md](references/leer-estilo.md): qué mirar del proyecto y cómo medir contraste.
- [references/plantilla.md](references/plantilla.md): plantilla completa de `ui-direction.md`.
- [evals/evals.json](evals/evals.json): casos de evaluación.
