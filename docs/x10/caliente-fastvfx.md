# x10: FASTVFX y tests de automatización en el editor caliente

Fecha: 2026-11-07. Rama `caliente2`. Mismo PC que el benchmark de FASTVFX (Windows 11, 32 GB, RTX serie 50), UE 5.8.3,
proyecto limpio `FastVfxBench`. «Antes» es el mismo código con `NOMOS_CALIENTE=off`: UnrealEditor-Cmd en frío para
generar y `-game` para capturar, como en `main`. Un solo Unreal abierto a la vez en todas las medidas; sin renders en
paralelo (a diferencia del benchmark anterior).

## Antes y después (medido)

| Qué | Antes (frío) | Después (caliente) | Notas |
|---|---|---|---|
| FASTVFX, una tarea (5 tareas sueltas: M01, M02, N01, N02, N03) | mediana 38,6 s; total 196 s; 2 aperturas por tarea | mediana 3,5 s; total 31,6 s; 1 apertura en total | la 1.ª tarea, 17,6 s (arranque del editor incluido); las otras 3,0–4,4 s |
| FASTVFX, retoque de esas 5 (solo cambia la MI) | mediana 37,5 s; total 188 s | mediana 3,1 s; total 16,2 s; 0 aperturas | |
| Generación dentro de una tarea | mediana 18,0 s (arranque del editor) | mediana 0,33 s | |
| Preview (captura) dentro de una tarea | mediana 20,1 s (arranque de `-game`) | mediana 2,3 s (SceneCapture2D en el editor) | 2 s de calentado + captura |
| FASTVFX, lote de 20 tareas (12 assets) | 54,2 s; 2 aperturas; 1.ª preview a los 43,2 s | 27,1 s; 1 apertura (el arranque); 1.ª preview a los 23,8 s | generación 20,4 s, preview 5,9 s |
| FASTVFX, retoque de las 20 con el editor ya abierto | — (en el benchmark anterior: mediana 39,4 s, total 817 s) | mediana 3,5 s; total 125 s; 20/20 bien | N09 y N10 cayeron al reintento en `-game` (26,5 y 38,4 s), ver abajo |
| `nomos ue test System.Core.Math` (40 tests) | 22,0 y 21,9 s | 1.º 22,7 s (abre el editor); después 9,8 y 9,7 s | 3,8 s son los tests; 5 s fijos de `FWaitForInteractiveFrameRate` del controlador |

Datos crudos: `bench-caliente-*.json` en esta carpeta (salidas de `nomos fastvfx bench` y de `nomos ue test`).

### Coste del RHI real en el editor caliente

| Arranque del caliente (hasta el primer latido) | Tiempo | Memoria (working set, 5 s después) |
|---|---|---|
| `-NullRHI` | 14,4 s y 11,1 s | 2,93 GB |
| `-RenderOffscreen` | 12,7 s y 12,9 s | 3,93–3,97 GB |

Decisión: **un solo modo, `-RenderOffscreen`**. Arranca igual de rápido y cuesta ~1 GB más; a cambio FASTVFX compila
shaders (`get_statistics`: 132 instrucciones de píxel y 297 de vértice; con NullRHI daba 0) y captura sin `-game`.
`nomos ue py` sigue funcionando igual.

## Qué cambió

- `nomos_caliente.py`: un script puede dejar `nomos_pendiente` y seguir en los ticks siguientes (tests, capturas), con
  un límite por trabajo. El caliente arranca con `-RenderOffscreen` y `-ReportExportPath`.
- `nomos ue test FILTRO [--proyecto X] [--timeout S]`: `Automation RunTests FILTRO; Now` en el caliente, espera el
  `index.json` y devuelve JSON (`pasados`, `fallidos`, `fallos` con sus errores), exit 1 si falla o no casa ningún test.
  Si el caliente no arranca o muere, en frío con `-ExecCmds="Automation RunTests …; Quit"`. El brief del worker lo pide
  en vez de UnrealEditor-Cmd.
- FASTVFX (`motor.ts`): generación y preview en el caliente del proyecto.
  - Un Niagara existente se borra con `delete_asset` dentro del editor (acción `borrar`, también en frío): rehacer un
    sistema cargado tras borrarlo así funcionó 3 de 3 veces en la misma sesión. Ya no se borra el `.uasset` del disco.
  - El caliente del mismo proyecto no cuenta para «un editor a la vez»; otro editor cualquiera sigue abortando. La
    reserva `editor/<proyecto>` no cambia (FASTVFX la toma mientras usa el editor).
  - Captura en el editor (`nomos_fastvfx_captura.py`): SceneCapture2D en la cámara del nivel de preview, Niagara llevado
    a su edad con `advance_simulation` (el mundo del editor no lo simula solo), recarga del paquete de los Niagara
    generados en la sesión (si no, no se activan y la captura sale vacía) y, al final, vuelve a cargar el nivel que había.
  - Si una captura del caliente sale vacía, esa receta se repite en `-game` antes de darla por mala.
- Vuelta atrás: `NOMOS_CALIENTE=off`, o automática si el caliente no arranca o muere (se cierra y se sigue en frío).

## Lo que no se pudo hacer o probar

- **Capturas que no cuadran con el juego**: la captura del editor no tiene la exposición automática del juego, así que
  sale más oscura (suelo casi negro; holograma `MI_Holo_Cian` 0,0039 de píxeles de efecto frente a 0,0112 en `-game`).
  En 37 capturas reales, 2 quedaron por debajo del umbral (0,0005) y se repitieron en `-game`: `MI_Holo_Verde` (0,00024,
  una vez en un lote) y `FX_Energy_Blanca` en N09 (0 px: el sistema no pintó, dos veces seguidas en la misma tarea; no
  encontré la causa). Probé fijar la exposición en el SceneCapture y no cambió nada; no lo dejé.
- **Juego con captura de los workers (`-game`, 359 llamadas en Herbalist)**: sigue en frío. Lo que cubre esto es la
  preview de FASTVFX; las capturas de UI de un juego necesitan el juego de verdad (HUD, GameMode, input), que no corre
  en el mundo del editor sin PIE, y PIE no se ha probado en el caliente offscreen.
- **`ue test` con un test que falla de verdad**: solo se probó con el editor falso; en real, 40 tests que pasan y un
  filtro que no casa con ningún test (lo detecta).
- Los 5 s de `FWaitForInteractiveFrameRate` antes de cada pasada de tests son del motor con RHI real; solo se saltan
  con NullRHI.
- No se midió en un juego real (Herbalist) ni con workers lanzados por Nomos.
