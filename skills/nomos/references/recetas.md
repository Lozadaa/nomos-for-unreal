# Recetas de editor (escena, sondeo, bp_datos)

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

Lo que no cubre (capturas con recorrido en el juego, importar FBX con opciones, Enhanced Input) sigue con `ue py`.
