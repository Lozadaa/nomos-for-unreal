# Dirección de arte · Semilla

Antes de programar nada visible (ue-oficio, acabado.md). Cambia esto por lo de tu juego; los tokens viven en
`Source/Semilla/SemillaEstilo.h`.

## Motivo
Una frase: de qué va el juego y qué se tiene que sentir al verlo.

## Fuentes
- Títulos: Caveat Brush (OFL, `Content/Fuentes`).
- Texto: Patrick Hand (OFL, `Content/Fuentes`).

## Paleta
| Token | Uso |
|---|---|
| Fondo | pantalla de carga |
| Panel | paneles del menú, HUD y final |
| Tinta | texto |
| Acento | títulos y el dato del HUD |
| Suave | ayudas y etiquetas |

## Gesto propio
Lo que hace que esto no parezca de cualquier juego.

## Medidas
Las mismas para todas las tareas: escríbelas una vez, antes de colocar nada, y úsalas en vez de medir a ojo. En centímetros
(1 unidad de Unreal = 1 cm).

| Qué | Medida |
|---|---|
| Protagonista | alto y ancho en cm; en pantalla, al menos el 3 % del alto a 1280×720 |
| Zona de juego | ancho × fondo en cm; entera en cuadro o no |
| Cámara | distancia, altura e inclinación |
| Lo más pequeño que hay que distinguir | tamaño en cm y en píxeles a 1280×720 |

Si el juego se recorre a pie, parte de los valores por defecto de `ACharacter` del motor y no los contradigas sin querer:
cápsula de 68 × 176 cm (radio 34, media altura 88), escalón máximo de 45 cm, salto de unos 90 cm (`JumpZVelocity` 420).
Una puerta o un paso tiene que ser más ancho y más alto que la cápsula; un escalón de más de 45 cm es una pared.

## Plan de arte
Antes de programar nada visible. Una fila por cosa que ve (u oye) el jugador; ninguna celda vacía: `revisar_acabado.py` lo
exige en la tarea que empaqueta. Herramientas y su coste: `ue-oficio/references/arsenal-visual.md`. Forma básica del motor
solo con motivo escrito y nunca para protagonista, amenazas u objetivos.

| Qué | Herramienta | Por qué | Detalle buscado |
|---|---|---|---|
| Protagonista | | | |
| Amenazas | | | |
| Objetivos | | | |
| Suelo | | | |
| Fondo | | | |
| Luz | | | |
| Cámara | | | |
| Efectos | | | |
| Sonido | | | |
