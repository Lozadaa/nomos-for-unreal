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
