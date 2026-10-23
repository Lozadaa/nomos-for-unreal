# Criterios medibles

## Contraste (WCAG 2.1 AA)

Contraste = (L1 + 0,05) / (L2 + 0,05) con L la luminancia relativa
(`c ≤ 0,03928 ? c / 12,92 : ((c + 0,055) / 1,055) ^ 2,4`; L = 0,2126 R + 0,7152 G + 0,0722 B).

| Elemento | Mínimo |
|---|---|
| Texto normal (< 24 px a 1080p) | 4,5:1 |
| Texto grande (≥ 24 px o ≥ 19 px en negrita) | 3:1 |
| Iconos, barras, bordes de foco | 3:1 contra los colores vecinos |

Sobre escena 3D, mide contra el píxel más claro y el más oscuro que haya detrás del texto.

## Tamaños

| Resolución | Cuerpo mínimo | Icono mínimo | Objetivo pulsable |
|---|---|---|---|
| 1280×720 | 14 px | 16 px | 32 px |
| 1920×1080 | 18 px | 24 px | 48 px |

Margen seguro: 5 % del ancho y del alto por lado (TV). Nada esencial fuera de él.

## Escalado entre resoluciones

Con la curva DPI por defecto, un elemento de 1080p mide ~2/3 en 720p. Si mide lo mismo en
píxeles en ambas, no escala; si a 720p se sale o se solapa, el anclaje está mal.

## Foco y mando

- Un único elemento enfocado, distinguible sin color: borde ≥ 2 px o escala ≥ 1,03.
- Foco inicial en la acción principal; B/Esc vuelve; no hay elementos inalcanzables.

## Severidad

| Severidad | Ejemplos |
|---|---|
| bloqueante | La UI no aparece; texto ilegible (< 3:1); el foco no se ve; algo esencial fuera de pantalla |
| mayor | Contraste entre 3:1 y 4,5:1 en texto normal; texto truncado; solape con otro elemento |
| menor | Desalineado de 1-2 px; tamaño algo por debajo de la dirección sin perder legibilidad |
