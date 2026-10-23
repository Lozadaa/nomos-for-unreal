# Leer el estilo 3D del proyecto

## Fuentes, por orden

| Fuente | Qué buscar | Cómo |
|---|---|---|
| Mapas (`Content/**/*.umap`) | Cielo, luz, niebla, tono general | Captura de Kratos (`.kratos/artifacts/tests/<id>/*.png`) o una captura del editor |
| Packs (`Content/Fab`, `Content/<Pack>`) | Género visual y materiales dominantes | Nombres de carpeta y `kratos asset search` |
| Materiales (`M_*`, `MI_*`) | Colores base y si hay cel shading o contornos | Nombres y parámetros de color de las instancias |
| UI existente (`Content/UI`, `WBP_*`) | Fuentes, colores y estilos ya usados | Abrir los widgets o leer los nombres de estilos |
| Documentos (`docs/`, `README`) | Referencias de arte del equipo | Texto e imágenes enlazadas |

## Medir el contraste

Contraste WCAG = (L1 + 0,05) / (L2 + 0,05), con L la luminancia relativa de cada color:
para cada canal c en [0, 1], `c ≤ 0,03928 ? c / 12,92 : ((c + 0,055) / 1,055) ^ 2,4`, y
L = 0,2126 R + 0,7152 G + 0,0722 B. Anota el resultado con un decimal (p. ej. «7,4:1»).

Sobre el juego en movimiento el fondo cambia: mide el texto del HUD contra el color más claro
y el más oscuro de la captura del mapa. Si no llega a 4,5:1 en ambos, añade una placa
(superficie con opacidad ≥ 60 %) o un contorno de 2 px.

## Traducir el estilo 3D a la UI

- Realista: tipografía sans neutra, superficies translúcidas oscuras, acento escaso.
- Cel shading / cartoon: contornos sólidos, esquinas redondeadas, colores planos saturados.
- Low poly / geométrico: formas facetadas, iconos de trazo recto, paleta reducida.
- Pixel art: fuente bitmap a escala entera, sin suavizado, rejilla de 8 px.
