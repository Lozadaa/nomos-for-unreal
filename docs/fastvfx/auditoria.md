# FASTVFX · Auditoría: VFX y materiales en Nomos antes de FASTVFX

Fecha: 2026-11-07. Rama `fastvfx` cortada de `main` f5c21df. UE 5.8.3 (`C:\Program Files\Epic Games\UE_5.8`).

## Qué hay hoy en Nomos para VFX y materiales

| Pieza | Dónde | Qué hace con VFX/materiales |
|---|---|---|
| Skills por rol | `service/src/skills.ts` | El grupo `ability` añade `ue-niagara-effects` al brief del worker. No hay grupo ni rol de VFX/materiales; las skills globales `materials`, `vfx-fx` y `ue-materials-rendering` existen en `~/.claude/skills` pero Nomos no las asigna. Son texto de orientación, no herramientas. |
| Conexión con Unreal | `service/src/adapters/unreal-cmd.ts` | `runPython()` lanza `UnrealEditor-Cmd -ExecutePythonScript` con `-NullRHI` (o `-game` para capturas). Sirve para cualquier script; no hay ninguno de VFX. |
| Cola de editor | `service/src/editor/queue.ts` | `withEditor()`: una reserva `editor/<proyecto>` por proyecto, RAM y editores vivos (`machine.ts`). |
| Scripts de editor | `service/unreal/*.py` | Importar, validar, compilar BP, personajes, capturas PIE/juego. Ninguno crea materiales ni Niagara. `nomos_verify.py` solo lista materiales asignados a mallas. |
| Comprobaciones | `service/src/checks/` | `asset.ts` (material vacío en un slot), `visual.ts` (regresión de píxeles contra línea base, con margen de ruido «exposición, TAA, partículas»). Ninguna mide un material (instrucciones, compilación) ni un sistema Niagara. |
| Base de datos | `service/src/db.ts` (`node:sqlite`) | Tareas, runs, reservas, eventos. Nada de caché de assets generados. |
| Catálogo | `service/src/catalog/` | Indexa packs y clips del motor; «los ABP, rigs y materiales no se listan» (`sources/engine.ts`). |

Conclusión: Nomos no tiene ningún subsistema de VFX ni de materiales. Un efecto lo construye el worker escribiendo Python de editor a mano.

## Cómo lo hace hoy un worker (evidencia de juegos dirigidos con Nomos)

- **Herbalist** (`Content/Herbalist/Efectos/Scripts/`): 26 scripts de VFX, materiales, bancos de prueba y hojas de captura, 4.298 líneas; solo los `crear_efectos_h5x/h6x/h7x.py` suman 2.273 líneas (204–465 cada uno). 35 commits tocaron esa carpeta en 6 días (19 el 2026-11-02). Cada hito vuelve a escribir el material desde cero (`delete_asset` o `delete_all_material_expressions` y nodo a nodo) y el usuario acabó diciendo (2026-10-31) que los VFX eran «horrendos… exagerados 0 realistas».
- **Block Kings** (`docs/produccion/evidencia/J1.9/scripts/crear_sangre.py` 317 líneas, `J2.2/scripts/crear_fx.py` 494 líneas): materiales y Niagara con `FXConverterUtilitiesLibrary`, nodo a nodo; los comentarios del propio script recogen las trampas (no se puede rehacer un sistema cargado, `em.finalize()` duplica módulos).
- Trampas que cada worker redescubre (notas de Second Brain observadas en H5.6, H6.2b, H6.3, H6.4, J1.9, J2.2): módulos Lightweight que Python no expone (hizo falta un ayudante C++), `EmitterState` obligatorio, orden de módulos, `HighResShot` que cuelga la GPU, `EditorAssetLibrary` dentro de un tick de `-game` cierra el juego.
- Comprobadas al construir FASTVFX en UE 5.8.3 (este trabajo):
  - `MaterialEditingLibrary.set_material_instance_*_parameter_value` devuelve **siempre False** (el `.cpp` nunca asigna `bResult`): un script que confíe en el retorno cree que falló.
  - Con `-NullRHI` (lo que usa `runPython` por defecto) no se compilan shaders: `get_statistics` da 0 instrucciones y el «tiempo de compilación» no significa nada. Con `-RenderOffscreen` sí (132 instrucciones de píxel en `M_Master_VFX`).
  - Los parámetros de usuario de un sistema Niagara (`ExposedParameters`) no son accesibles desde Python y `NiagaraExternalEditUtilities` (nuevo en 5.8) no tiene `UFUNCTION`: solo C++.

## Cuellos de botella

1. **Todo desde cero en cada tarea.** El grafo se escribe nodo a nodo por el LLM cada vez; una variación de color es otro script u otra reconstrucción.
2. **Iteración a golpe de editor.** Cada prueba es una apertura de `UnrealEditor-Cmd` (17–30 s de arranque en este PC antes de ejecutar una línea) más una llamada al LLM para leer el log y corregir.
3. **Sin caché.** Nada recuerda qué se construyó con qué parámetros; repetir o retocar cuesta lo mismo que crear.
4. **Sin preview determinista.** Las capturas se hacen con scripts propios por hito (`hoja_h6x.py`, `capturar_h71b.py`), con tiempos y cámaras distintos.
5. **Sin medida.** Nadie sabe cuánto tarda compilar o guardar ni cuántas instrucciones tiene el material; con `-NullRHI` ni siquiera se puede saber.
6. **Rehacer Niagara es frágil.** Un sistema cargado no se puede borrar y rehacer en la misma sesión; los workers borran el `.uasset` a mano con el editor cerrado.

## Qué cambia FASTVFX (resumen; detalle en `skills/nomos/references/fastvfx.md`)

La IA elige plantilla y valores en una receta JSON; un generador determinista (`service/unreal/nomos_fastvfx.py`) construye una vez el maestro o el sistema base y después solo crea Material Instances y copias del sistema; la caché en el SQLite de Nomos decide qué hace falta; un lote entero va en una apertura del editor y las capturas en otra.
