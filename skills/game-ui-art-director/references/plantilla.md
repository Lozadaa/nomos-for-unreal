# Plantilla de docs/ui-direction.md

```markdown
# Dirección de arte de la UI · <Juego>

Estilo leído: <género visual en una frase, de dónde se dedujo>.
Fecha: <AAAA-MM-DD>. Estado: vigente | provisional.

## Tipografía
| Uso | Familia | Peso | 1080p | 720p |
|---|---|---|---|---|
| Título | Roboto | Bold | 48 px | 32 px |
| Cuerpo | Roboto | Regular | 24 px | 16 px |
| Etiqueta | Roboto | Medium | 18 px | 14 px |
| Cifra de HUD | Roboto Mono | Bold | 32 px | 22 px |

## Paleta
| Token | Hex | Uso | Contraste |
|---|---|---|---|
| fondo | #0E1116 | Placas del HUD (70 %) | — |
| texto | #F2F4F7 | Texto sobre fondo | 17,2:1 |
| acento | #4FB3FF | Selección y foco | 8,3:1 sobre fondo |
| peligro | #FF5A5A | Vida baja, errores | 6,2:1 sobre fondo |
| éxito | #4CD38A | Confirmaciones | 9,9:1 sobre fondo |

## Espaciado
Escala 8 px (8, 16, 24, 32, 48). Margen seguro 5 % por lado. HUD anclado a esquinas.

## Iconografía
Trazo de 2 px, esquinas redondeadas, 24 px mínimo a 1080p. Llevan icono: vida, munición, objetivo.

## Jerarquía
HUD: vida > munición > objetivo. Menús: título > opción enfocada > resto. Un acento por pantalla.

## Estados
| Estado | Cambio |
|---|---|
| Normal | Superficie, texto |
| Hover | Superficie +8 % de luz |
| Foco | Borde de 3 px en acento + escala 1,03 |
| Pulsado | Superficie −8 % de luz, escala 0,98 |
| Desactivado | Opacidad 40 %, sin borde |

## Foco y mando
Foco inicial: primera opción. Orden: de arriba abajo. B / Esc vuelve. El borde de foco se ve con mando y teclado.

## Ejemplos
- Barra de vida: esquina superior izquierda, 320×24 px a 1080p, relleno «peligro» bajo el 25 %, cifra a la derecha.
- Menú de pausa: placa centrada 480 px de ancho, título 48 px, tres opciones, foco en «Continuar».
```
