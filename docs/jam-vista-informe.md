# Jam vista · informe (2026-11-10)

Plan: `docs/superpowers/plans/2026-11-10-jam-vista.md`. La fase 4 (repetir Candela) se canceló por decisión del usuario y la
sustituyó una comparación nueva con otro juego, «Trompo» (`docs/demo/segundo-juego.md`).

## Qué cambió en Nomos

1. **Un encargo pequeño, un worker.** `skills/nomos/SKILL.md` (0.7.0, «Repartir») y el brief del director: un juego que cabe
   en una hora es una sola tarea con alcance de todo el juego; se parte solo si lo piden, hay dos personas o pasa de una
   hora, y entonces por lo que se ve. Las specs copian las frases de calidad del usuario y llevan tres criterios fijos de
   lectura. En Trompo el director creó una sola tarea con esas frases y esos tres criterios.
2. **El worker y el revisor miran.** El brief del worker trae «Mira lo que hiciste» (tres capturas del modo demo, abrirlas,
   una línea `VISTO` por captura); el revisor recibe las rutas de las capturas y rechaza si no se lee.
3. **Una comprobación que mide la imagen.** `skills/ue-oficio/scripts/revisar_imagen.py` (negro puro, algo brilla, pantalla
   vacía, tamaño, borde y contraste del protagonista, escena en cuadro, algo cambia) con 13 pruebas, incluida la regresión
   con las capturas reales de Candela: B-30 falla por negro puro y A-30 pasa. La comprobación `imagen` del lote lanza el
   juego en `-game` con su modo demo (`service/unreal/nomos_demo.py`), saca tres capturas con su JSON de escena y pasa el
   script; va tras compilar y solo en la tarea que empaqueta. `doctor` enseña Pillow.
4. **Una semilla que ya se ve.** Luz de día suave con atmósfera, cielo y niebla; suelo que llega al horizonte; bloom;
   pantalla de carga del motor desde el primer fotograma; cámara que encuadra lo etiquetado `Escena`
   (`FSemillaCamara::Encuadrar`, probada con `Semilla.Camara`); `SemillaAspecto::Vestir` como único sitio del aspecto por
   rol; panel de ejemplo con forma. `nomos nuevo` saca un juego cuyo modo demo pasa `revisar_imagen.py` y cuyo `.exe` enseña
   la carga en el segundo 0 (`docs/aceptacion-semilla.md`).

## Recortes y desvíos del plan

- La comprobación `imagen` va **después** de compilar, no justo tras `acabado`: lanza el editor del juego, que tiene que
  estar compilado al día.
- La fórmula del tamaño del protagonista usa el FOV horizontal de Unreal (el plan la daba con el vertical);
  `TamanoEnPantalla` sigue la del plan (FOV vertical) y `FovVertical` convierte.
- `Prueba2` no se reempaquetó: se compiló y pasó la comprobación del modo demo; el empaquetado se probó con `Prueba`.
- Las pruebas del servicio se escribieron antes que el código pero no se vieron fallar una a una en todos los casos (la de
  `revisar_imagen` sí falló primero por dos casos mal construidos en la prueba).

## Lo no probado

- La comprobación `imagen` dentro del lote real de Nomos con Unreal: las pruebas usan el Unreal falso y en Trompo el lote
  no corrió (modo rápido sin criterios `check:`).
- Un juego oscuro a propósito fuera de las imágenes sintéticas.
- `revisar_imagen.py` mide el contraste del cuadro del protagonista, no si algo lo tapa del todo con el mismo tono.

## Trompo: la comparación nueva (`docs/demo/comparativa-trompo.md`)

| | A · agente solo | B · Nomos |
|---|---|---|
| Nota (media de dos jueces a ciegas + sonido) | 18 | **23,5** |
| Reloj de inicio a FIN | 39 min 49 s | **30 min 54 s** |
| Intervenciones | 0 | 0 |
| Fallos de acabado | 3 | **0** |
| Fallos de imagen (7 capturas) | 1 (arranca en negro) | 1 (la carga no tiene nada que brille) |

Candela era A 22 · B 14; Trompo es A 18 · B 23,5. **El umbral sigue sin cumplirse**: faltan 0,5 puntos para el 24, la
ventaja es +5,5 y no +8, y B tiene un fallo de imagen. El director creó una sola tarea con las frases del encargo, y el
worker usó la costura de aspecto, la cámara que encuadra y las tres capturas con líneas `VISTO`.

Causas de lo que faltó, para arreglar si se quiere: (1) la cámara siguió en 55° desde arriba aunque el encargo pedía «de
lado»: falta un criterio que copie la vista pedida; (2) la demo gana a los 10-20 s porque el worker optimizó para las
capturas de 3, 20 y 45 s: `-Demo` debería capturar donde dice el encargo; (3) la pantalla de carga de la semilla falla su
propia medida «algo brilla»; (4) en modo rápido el lote (`imagen`, `acabado`) no corre si ningún criterio empieza por
`check:`; (5) con todo el ruedo en cuadro, los trompos miden unos 40 px.

## Lo que le toca al usuario

- Jugar los dos `.exe` con ratón y oírlos: el sonido no lo ha oído nadie (`Escritorio/Trompo (con Nomos).lnk`,
  `Escritorio/Trompo-demo/`).
- Decidir si se arreglan las causas 2-4 antes de la jam (son pequeñas; la 4 cambia cuándo corren las comprobaciones).
- Revisar y, si quiere, subir `main` (no se ha hecho ningún push). Sus tres archivos sin commitear siguen intactos.
