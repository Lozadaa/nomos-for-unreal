# x10 · acelera: turno por orden, capturas sin espera fija y recetas de editor

Fecha: 2026-11-07. Rama `acelera`. Mismo PC que [caliente-fastvfx.md](caliente-fastvfx.md) (Windows 11, 32 GB, RTX serie 50),
UE 5.8.3. Un solo Unreal abierto a la vez en todas las medidas. Datos crudos: `acelera-a-turno.txt`,
`acelera-b-capturas.jsonl` y `acelera-c/`.

## Antes y después

### A. Turno de Unreal por orden (analisis.md, punto 3)

Medido con Unreal real: el editor caliente de `FastVfxBench` y el servicio en proceso (`requestTurn`, `releaseTurn` y
`withEditor` de verdad sobre SQLite en memoria). Un worker hace 5 `ue py` con 8 s de «pensar» entre ellos. A los 5 s llega
una comprobación que reintenta cada segundo y dura 2 s. Script: `acelera-a-sim.mjs`. Es una simulación del reparto, no
una producción.

| Qué | Antes (turno a mano toda la sesión) | Después (turno por orden) |
|---|---|---|
| Espera de la comprobación | 56,8 s (hasta que el worker suelta el turno) | 13,6 s (lo que tardaba el 1.er `ue py` en abrir el editor) |
| Turno retenido por el worker | 59,0 s seguidos | 12,3 + 12,4 + 0,12 + 0,12 + 0,13 s |
| Tiempo total del worker | 61,8 s | 66,6 s (+4,8 s: la comprobación cerró el caliente y el 2.º `ue py` lo volvió a abrir) |

En Herbalist el turno se retenía 7,6 min de mediana (p90 53,5 min). Con turno por orden, una comprobación espera como
mucho lo que dura un script, más un arranque del editor si lo pilla abriéndose. El precio: una reapertura del caliente
(~12 s) cada vez que entra una comprobación con Unreal entre dos scripts.

### B. Capturas con `-game` sin espera fija (nomos_pie_capture.py)

3 pasadas alternas por modo. «Antes» es el mismo script con `NOMOS_WAIT_FIJA=1`, que hace la espera fija de `main`.

| Caso | Antes: total (espera) | Después: total (espera) | Captura |
|---|---|---|---|
| Mapa sin UI (`FastVfxBench`, `L_FastVfxPreview`, como la comprobación `map`) | 65,0 / 65,1 / 68,1 s (50 s: 30 + 20 esperando una UI que no hay) | 21,5 / 21,5 / 21,0 s (6 s: listo en 1 s + 5 s de margen de UI) | Igual. Diferencia media de 0,34 a 0,39 sobre 255 y 0 % de píxeles que cambien más de 16 |
| UI con captura de control (`Cropout`, `MainMenu`, como `umg`) | 48,0 / 48,5 / 48,6 s (30 s) | 18,9 / 20,0 / 19,4 s (1 s) | Completa: isla, árboles y menú. No se compara por píxeles: la isla se genera al azar en cada arranque |

Medianas: el mapa pasa de 65,1 a 21,5 s (−67 %) y la UI de 48,5 a 19,4 s (−60 %). En la primera prueba suelta de
Cropout, el criterio esperó 6,9 s y no 1 s: la isla se estaba generando con tirones.

### C. Recetas de editor (`nomos ue receta`)

Patrones elegidos a partir de las 1 059 transcripciones de Herbalist: 173 escrituras de scripts con `import unreal`,
129 nombres distintos. Clasificación heurística por nombre y contenido:

| Patrón | Scripts | Escrituras | Ejecuciones | «A mano» en Herbalist (mediana, de la 1.ª escritura a la última ejecución buena) |
|---|---|---|---|---|
| Captura o recorrido en el juego | 42 | 102 | 311 | 19,7 min. Lo ataca B; los recorridos siguen con `ue py` |
| VFX y materiales | 30 | 91 | 216 | 41,9 min. Ya lo cubre FASTVFX |
| **Sondeo e inventario** → `sondeo` | 25 | 38 | 68 | 2,0 min (p75 16 min) |
| **Escena: montar y colocar actores** → `escena` | 13 | 40 | 57 | 8,3 min (p75 47 min), 3 escrituras de mediana |
| **BP hijo + DataAsset (crear y editar)** → `bp_datos` | 14 | 25 | 38 | 0,3 min crear, 2,8 min editar |
| Importar FBX, texturas o fuentes | 5 | 16 | 45 | 17 min. Fuera: opciones de FBX por juego |
| UMG | 2 | 4 | 1 | Fuera: el árbol de widgets lo hace el C++ de Herbalist; el script solo crea WBP finos |

Medido en `FastVfxBench` con las tres recetas de `acelera-c/`:

| Receta | Frío (`NOMOS_CALIENTE=off`, UnrealEditor-Cmd) | Caliente | Repetida sin cambios |
|---|---|---|---|
| `bp_datos`: BP hijo de Actor con 2 componentes y un DataAsset | 14,6 s | 17,7 s la 1.ª (abre el editor; script 0,37 s); 0,24 s al rehacerla | caché |
| `escena`: mapa nuevo con base y 5 actores (BP, mallas con material, luz con color, texto, 2 apoyados) | 14,9 s | 0,23 s (script 0,18 s), 3 veces seguidas, repetible: borra los 9 suyos y los vuelve a poner | 8 ms, sin abrir el editor |
| `sondeo`: carpeta con componentes y actores del mapa | 15,9 s | 0,22 s | no se cachea |

«A mano frente a receta»: en Herbalist cada uno de estos scripts costó de 0,3 a 8,3 min de reloj de mediana. Ese tiempo
incluye al modelo escribiéndolo y corrigiéndolo. La receta se escribe una vez y tarda 0,2 s en el editor caliente. No se
midió con un worker escribiendo recetas: el tiempo del modelo en escribir el JSON queda sin medir.

## Qué cambió

- **A.** `ue py`, `ue test` y `ue receta` aceptan `--tarea ID`: piden el turno al empezar, esperan si está ocupado y lo
  sueltan al acabar, sin cerrar el caliente. El servicio apunta qué caliente quedó abierto.
  - A quien recibe el turno se le dice qué calientes de otros cerrar (`cerrar`). Una comprobación (`withEditor`) con la
    reserva libre cierra antes el caliente de su proyecto o worktree: un editor a la vez.
  - Compatibilidad: `worker turn --wait|--release` sigue igual. Si el turno ya era del worker, `ue py` no lo suelta.
  - Tope de inactividad: un turno retenido por un worker sin ningún proceso de Unreal durante 3 min (`turnIdleMs`) se
    libera cuando alguien lo espera. Cuenta como proceso de Unreal un editor, UBT, UAT, UnrealPak o ShaderCompileWorker.
    Deja el evento `editor.released` con `motivo: inactivo`.
  - Brief y `references/maquina.md` actualizados.
- **B.** `nomos_listo.py`. En UE 5.8.3 el Python del juego no tiene `ShaderCompilingManager`, `AssetCompilingManager`
  ni `IsAsyncLoading`; lo comprobé con `dir(unreal)` en `-game`. Se captura cuando se cumplen dos cosas:
  - 10 fotogramas seguidos de menos de 0,1 s;
  - la CPU de los ShaderCompileWorker no crece en 0,5 s (Toolhelp + GetProcessTimes con ctypes, unos 13 ms por consulta).
  - Además: mínimo 1 s (`NOMOS_WAIT_MIN`) y `NOMOS_WAIT` como tope.
  - Sin UI pedida (ni control ni widgets), el margen para que aparezca la UI baja de 20 a 5 s.
  - `nomos_anim_capture.py` usa el mismo criterio para su espera de 10 s. `NOMOS_WAIT_FIJA=1` vuelve a la espera fija.
- **C.** `service/src/editor/recetas.ts` (validación y caché) y `service/unreal/nomos_recetas.py`.
  - Comparten con FASTVFX la tabla `fastvfx_cache` y `archivoAsset`, y con `ue py` el editor caliente, el turno y la
    vuelta en frío.
  - `nomos ue recetas` lista las plantillas; `ue receta R.json [--validar] [--forzar]`.
  - Brief del worker, `SKILL.md` y `references/recetas.md`.
- **Tests intermitentes.**
  - `runWarm` daba el editor por cerrado si el latido tenía más de 15 s o no se podía leer mientras se reemplazaba,
    aunque el proceso siguiera vivo con el tick ocupado. Ahora mira el pid. El editor falso y `nomos_caliente.py` ya no
    se caen si falla el reemplazo del latido. Test nuevo: un script que bloquea los ticks 2,5 s sin latido.
  - `orca-create`: el plazo de 500 ms no cubría el arranque del Orca falso (node) con la suite cargando la máquina; pasa a 4 s.
  - Salió otro en las pasadas completas: «el editor caliente se cierra solo…» (2 de 5) daba «no arrancó a tiempo».
    - Causa: el editor falso contaba los 0,5 s de inactividad desde que arrancaba el proceso, no desde que estaba listo.
      Con carga, vencían antes del primer latido.
    - Arreglo: el falso cuenta desde que está listo y el test usa 2 s.
  - En una pasada, `runner-lifecycle` falló con EPERM al borrar su carpeta temporal y el proceso se quedó colgado; lo
    maté a mano. No toca nada de esta rama y no se repitió en las otras 5 pasadas.

## Lo que no se pudo hacer o probar

- **A en producción**: no lo he visto con workers lanzados por Nomos ni en Herbalist. La simulación usa el servicio real
  en proceso, no el HTTP del servicio con un worker vivo. Los calientes apuntados se guardan en memoria: si el servicio
  se reinicia, un caliente abierto no se cierra por el registro. Sí se cierra si una comprobación abre el mismo
  proyecto o worktree, y si no, a los 10 min de inactividad.
- **A, tope de inactividad**: mira el PC entero. Un Unreal ajeno abierto mantiene el turno retenido. Solo se probó con el
  test de unidad.
- **B, compilación de shaders**: no vi trabajar ningún ShaderCompileWorker en las medidas, porque la DDC estaba caliente.
  `recompileshaders global` en `-game` es síncrono y no lanza workers. La señal de CPU de los SCW no está probada con una
  compilación real; los fotogramas estables sí cortan las cargas con tirones (Cropout, 6,9 s).
  - El streaming de texturas no tiene señal propia: queda cubierto por el mínimo de 1 s y por los fotogramas estables.
    En las capturas no vi mips bajos.
- **B, captura de animación** (`nomos_anim_capture.py`): cambiada pero no probada en real; hace falta el mapa de
  personaje de Nomos.
- **B, comprobación `map`**: antes jugaba 30 s, ahora unos 6 s. Un fallo del juego que salga entre esos 6 y 30 s ya no lo
  ve esa comprobación.
- **C**:
  - `escena` se probó en un mapa nuevo con base. La captura en `-game` de ese mapa no sirve como prueba visual: sin
    PlayerStart, el pawn aparece en el origen. Las posiciones se comprobaron con `sondeo`.
  - `bp_datos` se probó con padre nativo (Actor) y un DataAsset nativo (`PrimaryAssetLabel`). Con padre Blueprint y
    DataAsset Blueprint no se probó.
  - Las propiedades con espacios en el nombre («Equip Item Position», como en Herbalist) no se probaron.
- `orca-create`: la causa se dedujo del código y de los tiempos, no se reprodujo. Pasa 4 de 4 sola.
