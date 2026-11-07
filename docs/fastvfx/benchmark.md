# FASTVFX · Benchmark A vs B vs C

Fecha: 2026-11-07, 03:42–04:30 UTC. Mismo PC (Windows 11, 32 GB, RTX serie 50), UE 5.8.3, proyecto limpio
`FastVfxBench` (Blank, sin Starter Content), mismas 20 tareas (`docs/fastvfx/tareas.json`: 10 materiales y 10 Niagara,
8 de ellas repiten un asset con un parámetro distinto). Datos crudos en `docs/fastvfx/bench-*.json`; la tabla sale de
`node scripts/fastvfx-informe.ts <archivos>`.

## Flujos

- **A · hoy en Nomos**: un LLM escribe a mano el Python de editor que construye el material o el sistema Niagara desde
  cero, lo ejecuta con `UnrealEditor-Cmd -ExecutePythonScript` y lo corrige hasta que funciona; después se captura con
  el mismo script de preview que B/C. Scripts y tiempos en `docs/fastvfx/flujo-a/` (`tiempos.log`, `ua.sh`).
- **B · FASTVFX en frío**: `nomos fastvfx bench --modo frio` borra `Content/FastVfx`, `Saved/FastVfx` y la caché de
  FASTVFX y ejecuta las 20 recetas una a una (como 20 llamadas de worker). La primera de cada plantilla construye el
  maestro o el sistema base. **B-lote**: las 20 recetas en una sola llamada.
- **C · FASTVFX con caché**: con lo que dejó B. **C-acierto**: el estado final de cada asset otra vez (12 recetas).
  **C-retoque**: cada una de las 20 con `Intensidad` × 1,1 (el «súbelo un poco» del director). **C-repetición**: las 20
  en el orden original (los pares que comparten asset se pisan entre sí, así que solo 4 son aciertos).

Cada tarea de B y C abre el editor (si hay algo que generar) y el juego para la captura (si falta la captura); la
captura forma parte del tiempo total y de «1.ª preview» (momento en que el PNG está en disco).

## Resultados

| Flujo | Tareas | Éxito | Mediana (s) | p95 (s) | Total (s) | 1.ª preview mediana (s) | Compilación mediana (s) | Guardado mediana (s) | Aperturas del editor | Operaciones de editor | Llamadas LLM | Aciertos de caché |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A · Python a mano | 6 | 6/6 | 69,5 | 81,1 | 420 | 67,2 | 1,5 | 0,2 | 13 | 13 | 7 (tiempo incluido) | 0 |
| B · frío, una a una | 20 | 20/20 | 41,2 | 44,7 | 793 | 38,3 | 0,1 | 0,1 | 38 | 56 | 20 recetas (tiempo no incluido) | 0 |
| B · frío, en lote | 20 (12 assets) | 12/12 | — | — | **55,2** | 44,1 | 0 | 0,1 | **2** | 44 | 1 lote | 0 |
| C · retoque | 20 | 20/20 | 39,4 | 53,1 | 817 | 36,4 | 0 | 0,1 | 38 | 42 | 20 | 0 |
| C · acierto | 12 | 12/12 | **0,01** | 0,04 | 0,2 | 0,01 (captura reutilizada) | — | — | **0** | 0 | 12 | **12** |
| C · repetición en orden | 20 | 20/20 | 38,6 | 57,1 | 609 | 36,0 | 0 | 0,1 | 28 | 24 | 20 | 4 |

«Operaciones de editor» = acciones que ejecuta el script de editor (maestro, MI, sistema, copia, escenario) o, en A,
ejecuciones de script. «Compilación» = recompile + `get_statistics` (que espera a `FinishCompilation`).

### Las mismas 6 tareas en A y en B

| Tarea | A total (s) | B total (s) | A 1.ª preview (s) | B 1.ª preview (s) | Clase en B |
|---|---|---|---|---|---|
| M01 escudo azul | 68,1 | 42,8 | 64,3 | 39,9 | estructural |
| M02 escudo, intensidad 7 | 52,6 | 41,2 | 49,3 | 38,4 | parámetros |
| M06 holograma cian | 70,0 | 40,6 | 67,3 | 37,9 | estructural |
| N01 estallido azul | 82,2 | 41,3 | 79,2 | 38,4 | estructural |
| N02 estallido +30 % | 78,0 | 42,7 | 75,6 | 39,7 | parámetros |
| N03 estallido rojo | 69,1 | 40,6 | 67,0 | 37,4 | nuevo |
| **Suma** | **420** | **249** | | | |

### Por clase de cambio (B y C juntos)

| Clase | Qué hace | Mediana (s) | n |
|---|---|---|---|
| acierto | nada (ni editor ni juego) | 0,01 | 16 |
| usuario | solo `Particulas`/`Vida`/`Escala` de Niagara: solo la captura | 22,0 (B) · 23,4 (C) | 4 |
| parámetros | actualiza la MI | 40,6 (B) · 39,7 (C) | 21 |
| estáticos | MI con otra permutación de shader | 45,2 (B) · 40,0 (C) | 3 |
| nuevo | MI o copia del sistema | 41,8 | 9 |
| estructural | maestro o sistema base | 41,3 | 3 |

## Qué dicen los números

- **Por tarea suelta, FASTVFX es ~1,7× más rápido que A** (mediana 41 s frente a 70 s; 249 s frente a 420 s en las
  mismas 6 tareas) sin llamadas de corrección: 0 de 20 recetas fallaron, A necesitó una corrección (N02: el sistema ya
  existía y no se puede rehacer cargado; hubo que borrar el `.uasset` y volver a lanzar).
- **El tiempo de B es casi todo arranque de Unreal**: mediana 19,7 s de la apertura del editor de generación y 20,8 s
  de la del juego para la captura; el trabajo dentro del editor es de 0,3–5 s (compilación mediana 0,1 s). Por eso
  B frío y C retoque cuestan casi lo mismo por tarea suelta.
- **Lo que de verdad acelera es el lote y la caché**: las 20 tareas en un lote tardan **55 s** con 2 aperturas
  (14× menos que B una a una, 793 s). A no se midió en las 20; a su mediana (69,5 s) serían ~1.390 s
  (**extrapolación, no medida**), es decir, ~25× el lote. Un acierto de caché tarda 10–40 ms (0 aperturas).
- **Compilación de shaders**: una MI con solo valores dinámicos compila en 11–55 ms; una MI con otra permutación
  estática (M03, M09, M10) en 3,8–4,1 s. Los maestros compilaron en 64 ms en B porque la DDC del motor (que el modo
  frío no borra) ya tenía sus shaders de corridas anteriores; la primera compilación real de `M_Master_VFX` en este PC
  (prueba previa) tardó 4,5 s. En A, cada material nuevo compiló 2,5–3,6 s.
- **Instrucciones (get_statistics, D3D SM5)**: MIs de `M_Master_VFX` 122–158 de píxel / 297 de vértice; holograma 173;
  materiales de A 118–170.
- **Calidad**: las capturas están en `docs/fastvfx/capturas/` (A-* y B-*). En A-N01 la «onda» es un disco hexagonal
  lleno (el material rápido del LLM no hace anillo); en B la onda es un anillo que crece con la edad. No hay
  evaluación por visión: la única comprobación automática es que la captura tenga píxeles de efecto.

## Lo que no se pudo medir o sesga la comparación

- **A lo ejecutó el mismo agente que construyó FASTVFX** (Claude Opus) escribiendo Python a mano, sin generador. Ya
  conocía las trampas del API (descubiertas al hacer FASTVFX), así que A acertó a la primera en 5 de 6: es una cota
  **optimista** de A. No se lanzaron workers `claude --dangerously-skip-permissions` aparte (la sesión no tenía
  permiso para crear agentes así). Solo 6 de 20 tareas en A por tiempo.
- **Tiempo del LLM**: en A está dentro (duración del turno que escribe el script: 21–35 s los nuevos, 5–16 s las
  ediciones). En B/C el LLM escribe una receta de 3–8 líneas que **no está cronometrada**.
- **Nº de partículas vivas**: Python no expone el recuento del sistema en ejecución; se informa el configurado
  (`Particulas`) y el valor por defecto que el asset guarda, leído con `NiagaraComponent.get_variable_int`.
- **Carga del PC**: durante todas las corridas había renders de vídeo en paralelo (1–3 `ffmpeg`, 21–33 `chrome`,
  anotado por tarea en los JSON). A corrió justo después de B (03:55–04:01), con los renders terminando; no fue
  posible medir con el PC en reposo.
- **C-retoque**: 4 tareas (M02–M05) se bloquearon en la primera pasada porque otro agente abrió un editor de Unreal; la
  guarda «un editor a la vez» de FASTVFX se negó a abrir otro. Se repitieron justo después; ambos intentos están en
  los JSON.
- Las tareas «frío» no borran la DDC del motor (borrarla obliga a recompilar los shaders globales: varios GB en un
  disco con 3,5 GB libres).
