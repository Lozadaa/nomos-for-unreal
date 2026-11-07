# Cámara, pawn, posesión e input

## Cámara

- El pawn usa como vista la **primera cámara activa** que encuentra (`AActor::CalcCamera`). Deja exactamente una activa:
  con dos, el resultado depende del orden de los componentes. [fuente]
- Con `bUsePawnControlRotation=true` la cámara pisa su RelativeRotation en cada fotograma. Elige: cámara fija (false y
  rotación relativa) o cámara que sigue al ratón (true y solo desplazamiento). No mezcles. [fuente]
- La lente fuera de los límites de la malla del pawn (con un 10 % de margen). Dentro, solo se ve la sombra. [fuente]
- Antes de tocar la cámara, mide la malla y orienta su eje largo a +X del pawn: una vista de lado o desde abajo suele
  ser la malla girada, no la cámara. [fuente]
- Offsets relativos al pawn, nunca posiciones de mundo: así no derivan si cambia el origen. [fuente]
- Con geometría compleja, SpringArm con `bDoCollisionTest=false` o cámara sin brazo: con la prueba de colisión el brazo
  choca y la cámara salta. [plan]
- El retardo (`CameraLag`) solo existe en el SpringArm: brazo de longitud 0, todo el desplazamiento en RelativeLocation
  y lag ≈4 conserva el encuadre y solo retrasa la traslación. [plan]
- Quita la colisión a las mallas decorativas pegadas al pawn. [plan]

## Posesión y aparición

- PlayerStart unos cm por encima de un suelo con colisión Block. Enterrado, el motor expulsa al pawn; sin PlayerStart,
  aparece en el origen, a menudo en el aire. Con World Partition la colisión exige la celda cargada. [fuente]
- Cuando no hay GameMode en WorldSettings (su propiedad se llama `DefaultGameMode`), manda `GlobalDefaultGameMode` de
  `DefaultEngine.ini`: léelo del disco. [probado]
- Si fijar el GameMode por propiedad falla, alternativa: el pawn colocado en el nivel con `AutoPossessPlayer=Player0`.
  [probado]

## Comprobar que el jugador está bien, con números [probado]

- El pawn se busca en el mundo de juego (en PIE, prefijo `UEDPIE_0_`), no en el del editor.
- En el suelo: la Z del pawn queda unos cm por debajo de la del PlayerStart (165 frente a 169) y la base de la cápsula
  no está bajo el suelo.
- El log no tiene «fell out of world», «KillZ» ni «No PlayerStart».
- La posesión se demuestra mejor con una línea de log que solo emite el pawn controlado que leyendo Controller/Pawn
  por reflexión.

## Input

- Si el personaje no se mueve, mira el input antes que el movimiento: el Input Mapping Context se añade en BeginPlay
  desde el subsistema Enhanced Input del PlayerController. Revisa también quién posee el pawn y el foco del viewport.
  [fuente]
