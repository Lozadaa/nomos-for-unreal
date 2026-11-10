# Aceptación de la semilla (`nomos nuevo`)

## Jam vista, 2026-11-10: luz, carga desde el primer fotograma, cámara que encuadra y aspecto por rol

Unreal 5.9 MegaJam Preview, este PC. `Prueba` regeneró el mapa con el `montar_contenido.py` nuevo; `Prueba2` salió de la
semilla ya con ese mapa dentro.

| Paso | Prueba | Prueba2 |
|---|---|---|
| `Scripts/compilar.ps1` | 58 s, a la primera | 100 s, a la primera |
| `nomos ue py Scripts/montar_contenido.py` | 42 s (editor 38 s, script 4 s): `L_Principal`, `M_Suelo`, `M_Horizonte`, `M_Base` | no hace falta |
| `nomos ue test Prueba` | `Reglas` y `Camara`: 2 de 2 en 7 s | — |
| `Scripts/capturar.ps1 -Demo` + `revisar_imagen.py` | 67 s; **0 fallos, 0 avisos**; protagonista de 28 px a 720 | 1.ª: **1 fallo** (el panel del final tapaba al protagonista); panel subido arriba → 0 fallos |
| `revisar_acabado.py` | 0 fallos, 0 avisos | — |
| `Scripts/empaquetar.ps1` (Shipping) | 183 s | no repetido (recorte) |
| `.exe`, toma del segundo 0 | **pantalla de carga** (fondo y punto del acento), no negro | — |

- [Segundo 0 del `.exe`](aceptacion-semilla/vista-exe-0.png) · [segundo 3 del `.exe`](aceptacion-semilla/vista-exe-3.png) ·
  [captura del modo demo a los 20 s](aceptacion-semilla/vista-demo-mitad.png).
- Lo que cambió: suelo de albedo medio y sol de 8 lux a 6500 K con atmósfera, cielo y niebla ligera; un suelo «Horizonte» que
  llega a la niebla (sin vacío negro); bloom 0,8; la cámara la coloca `EncuadrarEscena` sobre lo etiquetado `Escena`
  (inclinación 55°); pantalla de carga del motor desde el primer fotograma (`MoviePlayer`); panel de ejemplo con esquinas
  redondas y filo de otro color; un protagonista, una amenaza, un objetivo y un muro de ejemplo vestidos por `SemillaAspecto`.
- Mirado a ojo: se lee, pero es un día pálido y plano; es un punto de partida, no un estilo.
- La comprobación cazó un fallo real: el panel del final, centrado, tapaba al protagonista (en `Prueba` pasó por suerte, el
  protagonista estaba en otro punto de su vuelta). El panel del final va ahora arriba.

## Primera versión, 2026-11-10

Unreal 5.9 MegaJam Preview, este PC. Dos juegos: `Prueba` (la semilla sin mapa todavía: lo creó `montar_contenido.py`)
y `Prueba2` (la semilla ya con mapa, suelo y fuentes dentro: nadie abrió Unreal a mano).

| Paso | Prueba | Prueba2 |
|---|---|---|
| `nomos nuevo` | 31 s | 7 s |
| `Scripts/compilar.ps1` | 86 s (falló: el test en `Tests/` no veía la cabecera) → 27 s tras moverlo | 59 s, a la primera |
| `nomos ue py Scripts/montar_contenido.py` | 42 s (editor caliente 41 s, script 1,3 s): crea `L_Principal` y `M_Suelo` | 29 s: «ya existe», no toca nada |
| `nomos ue test <Juego>.Reglas` | 1 de 1 en 6 s | 1 de 1 en 6 s |
| `revisar_acabado.py` | 0 fallos, 0 avisos | 0 fallos, 0 avisos |
| `Scripts/empaquetar.ps1` (Shipping) | 146 s | 118 s |
| Captura del `.exe` | menú con la fuente propia y «menú» con tilde | carga → HUD «Puntuación 0/5» → final «¡Partida terminada!» en modo demo |

Capturas del `.exe` empaquetado:
- [Prueba, menú](aceptacion-semilla/prueba-menu.png)
- [Prueba2, HUD a los 2 s con `PRUEBA2_AUTO=1`](aceptacion-semilla/prueba2-hud.png)
- [Prueba2, final a los 9 s](aceptacion-semilla/prueba2-final-demo.png)

Sin material de cuadros ni fuente del motor en ninguna. Los paneles son de color liso (sin material), las fuentes
(Caveat Brush y Patrick Hand, OFL) llevan tildes, ñ y «¡».

## Lo que salió al probar

- **La captura del `.exe` mentía.** `captura_empaquetado.ps1` grababa la ventana por título (`gdigrab title=`): con DX12
  devuelve un fotograma viejo o negro. Las tomas de los segundos 1, 4 y 10 salían idénticas y parecía un juego
  congelado a mitad del fundido de carga. Ahora graba la zona de pantalla de la ventana y cada toma es distinta.
  Cualquier captura anterior hecha con ese script puede ser de un solo fotograma.
- La primera ejecución de un `.exe` recién empaquetado tarda unos segundos en pintar (shaders): las tomas antes de los
  3-4 s pueden salir negras.
- El cielo sale casi negro: sol de 6 lux con exposición manual en 0. Vale para un patio de noche; un juego de día sube el
  sol y el bias en `montar_contenido.py` o en su propio nivel.

`Prueba` y `Prueba2` se borraron después de medir.
