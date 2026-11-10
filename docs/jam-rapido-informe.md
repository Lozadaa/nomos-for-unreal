# Jam rápido · informe (2026-11-10)

Plan: `docs/superpowers/plans/2026-11-10-jam-rapido.md`. Rama `jam-rapido`, fusionada en `main` por fases. Sin push.

## Lo que queda hecho

| Fase | Resultado |
|---|---|
| 0 · Disco | 3,4 GB → 48 GB libres (Papelera y cachés autorizadas de CrazyPadel y Herbalist). Referencia de Canicas-6 copiada a `Documents/nomos-ref`. Línea base: 866/866. |
| 1 · Nada se queda parado | Integra en cuanto pasan las comprobaciones; un `claude -p` que acaba sin marca recibe un aviso al momento y, al tercero, un worker nuevo en el mismo árbol; aviso a los 10 min sin señal de vida y reenvío a los 20 (si no hay Unreal ni compilación); la marca dentro de un bloque de código cuenta; cada juego usa el motor de su `.uproject` y `doctor` dice cuál falta; el modo rápido es el modo; la regla automática nunca cancela una tarea. |
| 2 · Camino corto | Tabla «Quiero / Usa / No uses» en `ue-oficio` y dentro del brief de cada worker; tres skills obligatorias por worker (el resto «si las necesitas»); `SKILL.md` del director habla solo del modo rápido (295 → 250 líneas, el modo completo en `references/modo-completo.md`). |
| 3 · Semilla | `nomos nuevo <Nombre>`: juego UE 5.9 con menú, HUD, carga, fuentes propias, mapa, scripts de compilar/empaquetar/capturar, Git con LFS y Nomos dentro. Probado de punta a punta en 5.9: `docs/aceptacion-semilla.md`. |
| 4 · Equipo | La tarjeta cuenta lo hecho y la cabeza de `main`; `main` se pone al día solo (sin tocar un checkout con cambios); `nomos equipo` y la franja del panel; lo aprendido viaja en el brief. Aceptación con dos clones: `docs/aceptacion-jam-equipo.md`. Guía de una página: `docs/jam-equipo.md`. |
| 5 · Candela | Ver «Comparativa». |

Pruebas al cerrar: ver «Estado final».

## Lo que salió al probar de verdad (y ya está arreglado en `main`)

- **El director solo leía 90 caracteres del encargo.** En la primera pasada de Candela inventó otro juego (una vela, viento,
  5 faroles). Ahora el mensaje entero va a `.nomos/mensajes/<id>.md` y el brief manda leerlo.
- **Una `NOMOS_REVIEW` con JSON roto paraba la tarea.** Ahora Nomos pide al revisor repetirla en `review.json`.
- **La tabla de tareas rechazaba `vfx`, `camara` e `ia`** (la API las aceptaba): error 500 al crear la tarea.
- **Sin persona delante, «Por aprobar» paraba la tarea sin plazo.** Ahora, con el director por evento, se aprueba sola a los
  15 min (`approval.autoMinutos`).
- **El `.exe` se perdía al cerrar la tarea** (se empaquetaba dentro del worktree). La semilla empaqueta siempre en la carpeta del juego.
- **La captura del `.exe` mentía**: `gdigrab title=` con DX12 devolvía un fotograma viejo o negro. Ahora graba la zona de pantalla.
- **`fastvfx crear` abría el 5.8** aunque el juego fuera 5.9.
- La revisión final independiente (Opus) encontró 7 fallos importantes, todos arreglados con su prueba: límites de silencio
  que tumbaban la config, el relevo que rompía revisiones, avisos duplicados con un hook, el contador de finales sin marca,
  el primer `REVIEW` ganaba al último, `nomos nuevo` dejaba carpetas a medias y `doctor` se caía con una config inválida.

## Comparativa (detalle en `docs/demo/comparativa.md`)

| | A · sin Nomos | B · con Nomos (2.ª pasada) |
|---|---|---|
| Nota (juez a ciegas + sonido) | **22/30** | 14/30 |
| Reloj de inicio a FIN | 63 min (≈ 23 de trabajo + 40 de atasco del arnés) | **39 min** |
| Fallos de acabado | 4 | **0** |
| Intervenciones | 1 | 2 |
| Test de reglas · `.exe` 60 s | pasa · sí | pasa · sí |
| Tokens de entrada · salida | 7,5 M · 92 k | 9,9 M · 73 k |

**El umbral de «gran diferencia» no se cumple.** Nomos entrega el encargo completo y con el acabado que exige (fuentes
propias, carga, empaquetado, 0 fallos), pero el juego del agente solo se lee y se ve mejor. La primera pasada de B hizo
otro juego por un fallo de Nomos; tras arreglarlo, la segunda fue fiel al encargo. No hay tercera pasada (plan 5.4).

Lo que haría falta para que B gane (no hecho):
- Una semilla que se vea bien sin tocarla: hoy el patio sale casi negro (sol de 6 lux, exposición 0).
- Que el director parta el trabajo en paralelo y no en serie, y meta «se lee a 1280×720» en los criterios de lo visual.
- Que la pantalla de carga tape el primer arranque (la toma del segundo 0 de B es negra).

## Recortado o cambiado respecto al plan

- Fuentes de la semilla: Caveat Brush y Patrick Hand (ya probadas en 5.9 con sus `FF_*.uasset`) en vez de bajar Bricolage
  Grotesque y Atkinson Hyperlegible.
- Al tercer final sin marca, el worker se releva por otro en el mismo árbol (relevo de Nomos) en vez de volver a `preparada`.
- La rama A fue un subagente de Claude Code, no `claude -p` (lo bloqueó el clasificador de permisos).
- B1 se paró a los 26 min en vez de esperar a los 120: hacía otro juego.
- La aceptación de equipo (4.6) es mixta: Ana con un servicio real y Richard con las funciones del servicio en un proceso.

## Sin probar

- Dos máquinas reales con GitHub y Git LFS (la guía trae una prueba de 10 minutos para hacerla juntos).
- Nadie ha jugado Candela con ratón ni oído su sonido: todo se midió en modo demo.
- La pantalla de derrota de las dos ramas.
- Los arreglos posteriores a B2 (aprobación automática a los 15 min, `.exe` en la carpeta del juego, `nomos ue --proyecto`)
  tienen su prueba, pero no se han visto en una pasada real de Nomos.
- Una jam real con el director por evento y personas delante.

## Te toca a ti

1. `git push origin main` en `Documents/nomos` (no hice push).
2. Crear el repo del juego de la jam: `nomos nuevo <Nombre>`, crear el repo en GitHub y subirlo.
3. Pasar `docs/jam-equipo.md` al equipo y hacer juntos la prueba de 10 minutos.
4. Tus tres archivos sin commitear en `main` (`worker-launch.ts`, `tests/fakes/orca.ts`, `worker-launch.test.ts`) siguen
   como estaban.

## Estado final

- `npm test`: 904 de 905. El que falló («proceso colgado aborta en menos de 1,5 s», `orca.test.ts`) tardó 1516 ms; repetido
  solo pasa 28 de 28 dos veces. Es de tiempo con la máquina cargada.
- `npm run test:panel`: 356 de 356. `npm run build`: sin errores.
- Todo fusionado en `main` del checkout `Documents/nomos`. Sin push.
- Disco: 36,9 GB libres al cerrar. `Unreal Projects/Candela` (la demo, con `Empaquetado/`) y `CandelaSolo` (sin `Intermediate`
  ni `Saved/StagedBuilds`) se quedan.
