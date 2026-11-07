# Recetas de editor

Los workers de Herbalist escribían un script de Python por tarea para lo mismo: montar actores en un mapa (13 scripts,
40 escrituras), inventariar assets (25) y crear un Blueprint hijo con su DataAsset (14). Ahora es una receta JSON que
valida Nomos y ejecuta `service/unreal/nomos_recetas.py` en el editor caliente (mismo turno por orden que `ue py`).

```
nomos ue recetas                                    # plantillas y campos
nomos ue receta --tarea <taskId> receta.json        # ejecuta; JSON con lo hecho; exit 1 si algo falla
nomos ue receta receta.json --validar               # solo valida, sin Unreal
nomos ue receta --tarea <taskId> receta.json --forzar   # salta la caché
```

La misma receta con su resultado aún en disco no abre el editor (caché de FASTVFX, `acierto: true`). El sondeo no se
cachea. Valores de `propiedades`: número, booleano, texto (una ruta `/Game/…` o `/Engine/…` se carga como asset),
`{"vector": [x,y,z]}`, `{"rotador": [pitch,yaw,roll]}`, `{"color": [r,g,b,a]}`, `{"transform": {"pos","rot","escala"}}`.
Cada propiedad va al primer objeto que la acepta (el actor y luego sus componentes).

```json
{"receta": 1, "plantilla": "escena", "mapa": "/Game/Pruebas/L_Prueba", "etiqueta": "H3.1", "nuevo": true, "base": true,
 "actores": [
  {"nombre": "Maceta", "bp": "/Game/Jugador/BP_Maceta", "pos": [-175, -40, 0], "apoyar": true, "carpeta": "Plantas"},
  {"nombre": "Lampara", "clase": "PointLight", "pos": [0, 0, 300], "propiedades": {"intensity": 5000}},
  {"nombre": "Mesa", "malla": "/Engine/BasicShapes/Cube", "pos": [0, 0, 40], "escala": [2, 1, 0.8], "material": "/Game/M/MI_Madera"},
  {"nombre": "Rotulo", "clase": "TextRenderActor", "pos": [0, 0, 200], "texto": "Invernadero"}]}
```

- `escena`: borra los actores con la `etiqueta` y los vuelve a poner (repetible). `base` en un mapa nuevo añade suelo,
  sol, cielo y cámara. `apoyar` baja el actor hasta lo que haya debajo.
- `sondeo`: `carpetas`, `clases` (Blueprint, StaticMesh…), `componentes` (los de cada Blueprint con malla y
  materiales), `mapa` (sus actores) y `limite`.
- `bp_datos`: `ruta`, `padre` (Blueprint o `/Script/Modulo.Clase`), `componentes`, `propiedades` (valores por defecto)
  y `datos: {ruta, clase, propiedades}` para el DataAsset.

## Recetas del harness (probadas en el juego de ejemplo PiedraPapel, UE 5.8.3)

```json
{"receta": 1, "plantilla": "importar_malla", "fuente": "C:/arte/roca.fbx", "destino": "/Game/Arte", "modulo": true, "alto_cm": [10, 400]}
{"receta": 1, "plantilla": "camara_tercera_persona", "bp": "/Game/ThirdPerson/Blueprints/BP_ThirdPersonCharacter", "brazo": 560, "offset": [0, 60, 170], "fov": 75, "lag": 8}
{"receta": 1, "plantilla": "post_exterior", "mapa": "/Game/Juego/L_Arena", "exposicion": 0, "sol": {"pitch": -28, "yaw": 135, "kelvin": 5200}, "niebla": {"densidad": 0.004, "opacidad_max": 0.7}}
{"receta": 1, "plantilla": "poblar_pcg", "mapa": "/Game/Juego/L_Arena", "etiqueta": "rocas", "pos": [700, 2100, 0], "extension": [2200, 700, 100],
 "paleta": [{"malla": "/Game/LevelPrototyping/Meshes/SM_ChamferCube", "peso": 3, "material": "/Game/M/MI_Roca"}], "separacion": 380, "escala": [0.7, 2.2], "semilla": 7}
```

- `importar_malla`: importa y mide. Falla si la malla mide más de 50 m (¿×100?) o menos de 2 cm (¿×0,01?), si el alto
  sale de `alto_cm` o, con `modulo`, si el pivote no está en la base. Apaga sRGB en texturas de datos por el nombre
  (altura, máscara, rugosidad, ORM, AO). No se cachea.
- `camara_tercera_persona`: ajusta el brazo y la cámara del Blueprint, también si vienen de C++, o los añade. Deja una
  sola cámara activa y falla si la lente queda dentro de la malla del pawn.
- `post_exterior`: completa sol, SkyAtmosphere, SkyLight y niebla si faltan; PostProcess sin límites con exposición
  manual y sin motion blur. Avisa de duplicados, sol bajo sin atmósfera y niebla opaca.
- `poblar_pcg`: construye su grafo (rejilla, variación, spawner con la paleta) o usa `grafo`, recrea el volumen en cada
  pasada y falla con 0 instancias. Solo en el editor caliente: PCG genera en varios ticks.

Lo que no cubre (capturas con recorrido en el juego, Enhanced Input) sigue con `ue py`. Si Unreal se cae, `nomos ue
crash` lee el informe más reciente del proyecto y del motor.
