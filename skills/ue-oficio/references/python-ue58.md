# API de Python de UE 5.8: lo que hay que saber antes de escribir el script

Se ejecuta con `nomos ue py --tarea ID script.py` (editor caliente) o en `-game` desde las comprobaciones. Unidades:
centímetros, Z arriba, ejes de mano izquierda.

## Subsistemas en vez de librerías viejas [fuente]

| Para | Usa | No uses |
|---|---|---|
| Actores del nivel: listar, colocar, borrar, seleccionar | `get_editor_subsystem(unreal.EditorActorSubsystem)` | `EditorLevelLibrary` (en desuso) |
| Abrir, crear, guardar nivel; PIE | `get_editor_subsystem(unreal.LevelEditorSubsystem)` | |
| Mundo del editor, cámara del viewport | `get_editor_subsystem(unreal.UnrealEditorSubsystem)` | |
| Mallas (LOD, colisión) | `get_editor_subsystem(unreal.StaticMeshEditorSubsystem)` | |
| Assets ya existentes: cargar, duplicar, guardar | `get_editor_subsystem(unreal.EditorAssetSubsystem)` | |

Pide el subsistema con `get_editor_subsystem(Clase)`; instanciar la clase (`unreal.EditorActorSubsystem()`) no te da
el del editor.

## Colocar y transformar

- Una malla en el nivel: `spawn_actor_from_object(static_mesh, location, rotation)` crea el StaticMeshActor directamente.
  `spawn_actor_from_class` es para clases y Blueprints. [fuente]
- En el editor no hagas spawn con `GameplayStatics`: necesita un mundo de juego vivo. [fuente]
- `unreal.Rotator(roll, pitch, yaw)` por posición. Escribe `unreal.Rotator(pitch=…, yaw=…, roll=…)`. `Transform.rotation`
  es un Quat, no un Rotator. [fuente]
- Un set parcial resetea lo que no envías: mover solo la posición dejó la escala en 1 a 79 actores; un Rotator sin
  roll lo pone a 0. Lee el transform y escríbelo entero. [probado]
- La rotación de una DirectionalLight va en el actor, no en su componente. [probado]
- Para apoyar algo en el suelo: un trace hacia abajo antes de colocar. `snap_to_ground` puede dejarlo encima de otro
  objeto, y un BP recién creado solo tiene el billboard, así que sus límites aún no valen. La receta `escena` de Nomos ya
  apoya con trace. [probado]

## Propiedades

- `set_editor_property` cambia el valor y dispara `PostEditChangeProperty`, pero **no** llama al BlueprintSetter. Si la
  propiedad tiene función propia (`set_static_mesh`, `set_asset`/`set_system` de Niagara, `update_sun`…), úsala o el
  mundo no reacciona. [probado]
- Los nombres cambian entre clases que parecen iguales (en nodos de material, `Constant` usa `r` y `Constant3Vector`
  usa `constant`). Lista las propiedades de la clase antes de escribir: un nombre mal escrito puede fallar en silencio.
  [probado]
- Una propiedad de tipo clase (`TSubclassOf`, p. ej. un GameMode) se pasa con la clase generada `…_C`; en un plugin, la
  ruta empieza por `/NombrePlugin/`, no por `/Game/`. [plan]
- Las rutas de assets van completas: `/Game/X/Asset.Asset`. La ruta de paquete sola da «not a valid object path». [probado]
- Una función C++ que recibe un `FVector` empaquetado no acepta tres floats sueltos: `unreal.Vector(x=…, y=…, z=…)`. [probado]

## Importar [fuente]

- Ficheros nuevos: `unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])` con `AssetImportTask`
  (`automated=True`, `save=True`, `replace_existing=True`). `EditorAssetSubsystem` solo trabaja con assets que ya existen.
- El resultado está en `task.imported_object_paths` (o `get_objects()`); `task.result` está en desuso.
- Después de importar, mide: ver [importar](importar.md).

## Niveles

- Un nivel sin nombre («Untitled») no se guarda por script: créalo con ruta desde el principio
  (`LevelEditorSubsystem.new_level(ruta)` y `save_current_level`). [probado]
- Un nivel duplicado queda modificado y su carga se niega: guárdalo antes de abrirlo. Antes de cambiar de nivel,
  comprueba que el actual no tiene cambios sin guardar. [probado]
- Con World Partition, los actores que no están cargados se ven en pantalla pero no salen al listar actores. Construye
  lejos de lo que ya hay o carga la celda. [probado]
- No enfoques el viewport (`FocusOnActors`) en actores que aún cargan de forma asíncrona (tilesets, streaming): crash por
  puntero nulo. [probado]

## En `-game` (lo que hace Nomos al capturar) [probado en Nomos, UE 5.8.3]

- Los actores no exponen `get_actor_hidden_in_game`; la propiedad `hidden` sí se lee con `get_editor_property`.
- No hay `ShaderCompilingManager`, `AssetCompilingManager` ni `IsAsyncLoading`: Nomos espera a fotogramas estables
  (`nomos_listo.py`).
- Desde Python no se pueden crear actores en el mundo de juego; para mover la vista, la cámara libre del
  PlayerCameraManager (`camera freecam`).
- Aparecen actores de depuración que no se ven (`ChaosDebugDrawActor`, `GameplayDebuggerCategoryReplicator`).

## Por qué Nomos no usa el MCP de Epic [fuente]

El sandbox de su `execute_tool_script` no tiene el módulo `unreal` (solo `json`, `math`, `datetime`, `copy`, `re`,
`time`; sin `exec`, `eval` ni `compile`; `open` solo lee dentro del proyecto) y solo llega a herramientas registradas,
que leen y escriben propiedades pero no llaman UFUNCTIONs ni consola. Ampliarlo exige C++ y reiniciar el editor. La
ejecución remota de Python por UDP/TCP tampoco sirve con varios editores: el cliente coge el primero que responde y
puede escribir en el worktree equivocado. La cola por archivos del editor caliente evita las dos cosas.

## Documentación

La referencia web de la API de Python responde 403 sin `?application_version=5.5`; con ese parámetro carga, y para
estas clases 5.5 y 5.8 coinciden según el harness de origen (no comprobado clase a clase).
