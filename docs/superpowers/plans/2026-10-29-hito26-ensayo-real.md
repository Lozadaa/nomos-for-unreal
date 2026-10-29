# Hito 26 · Ensayo real de jam y blindaje

> **For agentic workers:** worktree `C:/Users/richa/orca/workspaces/kratos/hito26-ensayo` de `C:/Users/richa/Documents/nomos` (rama `hito26-ensayo` desde `main`). Ponytail full: el diff más corto que funciona, sin dependencias nuevas. Lee solo lo que vayas a tocar con grep y rangos de `sed`. No toques los servicios de los puertos 8780 y 8781 ni la carpeta de Block Kings. Pruebas con `npm test`, `npm run test:panel`, `npm run build`. Un commit por tarea. No fusiones en main. No hagas push.

**Por qué:** los hitos 23-25 se fusionaron con 761 pruebas verdes pero cuatro piezas nunca corrieron en condiciones reales. Además, cualquier prueba que lleve una tarea de cierre a `done` sin `memory.enabled:false` escribe una nota real en Second Brain (pasó en el hito 25 y hubo que borrarla a mano).

**Goal:** las pruebas no pueden tocar Second Brain, y un ensayo de jam de principio a fin en KratosFabTest deja medidas reales (tokens por rol, tiempos, qué falló) en `docs/aceptacion-hito26.md`.

**Hechos comprobados (no los investigues de nuevo):**
- La memoria se escribe en `service/src/handlers/finalize.ts` (~línea 45): `memory?.enabled === false` es la única salida. Por defecto escribe. `NOMOS_GRAPHIFY=off` ya existe como patrón de apagado por entorno.
- Las pruebas corren con `node tests/run.ts` (package.json `test`).
- `worker.poll` es un comando interno del servicio (lee la terminal de Orca); no entra en el contexto del worker. No lo toques.
- Tokens por run (hito 24): `--session-id` al lanzar, filas `tokens` en `spends`, ficha de la tarea, Producción y `nomos status`. Modelos por rol en `config.models` (`roleModel()`: implementación opus, el resto sonnet).
- Aceptaciones anteriores en `C:/Users/richa/Documents/Unreal Projects/KratosFabTest` con `--data .nomos-hitoNN` y puerto libre; `docs/aceptacion-hito25.md` es el formato a seguir. KratosFabTest tiene `Source/` y `Build/Windows`.
- graphify: ejecutar `graphify . --no-viz --code-only` con cwd en el juego; con ruta con espacios falla y sale 0. Consultas en español no casan (nota en Second Brain `knowledge/20261029T052636`).

---

## Tarea 1 · Las pruebas nunca escriben en Second Brain

**Archivos:** `finalize.ts`, `tests/run.ts`, `doctor` si enseña la memoria, `skills/nomos/references/cierre.md` (una línea).

- `NOMOS_MEMORY=off` desactiva la escritura igual que `memory.enabled:false`; `tests/run.ts` lo fija antes de cargar nada. Las pruebas que necesiten comprobar la memoria usan el fake de `brain.py` con `memory.command` explícito y fijan `NOMOS_MEMORY` solo dentro de ese test.
- Mismo tratamiento para cualquier otro efecto externo que encuentres en `finalize`/`integrate` (graphify ya lo tiene).

Acepta: prueba de que con `NOMOS_MEMORY=off` y `memory` ausente no se lanza ningún proceso ni hay `memory.saved`; `grep -rn "SecondBrain" tests/` no encuentra rutas reales.

## Tarea 2 · Ensayo de jam en KratosFabTest

Datos nuevos `--data .nomos-hito26`, puerto libre, `NOMOS_GRAPHIFY` activo, memoria activa solo en el paso del cierre (borra la nota después con su ruta). Modelo del worker: sonnet (medimos el circuito, no la calidad). Anota hora de inicio y fin de cada paso.

| Paso | Qué debe verse |
|---|---|
| `nomos jam init --tema "<tema>" --dias 2` | `docs/plan-jam.md` y `config.jam` |
| Grafo al arrancar | `graphify-out/graph.json` del juego y filas `graphify` en `doctor` |
| Una tarea pequeña real en `Source/` (p. ej. un log o un valor en un actor existente) con worker lanzado por Orca | Run con `sessionRef`, commit en el worktree, filas `tokens` en `spends`, tokens en la ficha, en Producción y en `nomos status` |
| Revisión con sonnet e integración | `review.finished`, `integration.completed`, `graphify --update` termina y `graph.json` cambia de fecha |
| Tarea de cierre con build real | `nomos build` (adaptador `unreal-build.ts`) empaqueta de verdad; `nomos build stamp`; `play --status` sin `stale` |
| Aprobación y cierre | `closing_blocked` → `approval approve` → `done` → `memory.saved` con la ruta real |
| Decisión de 24 h en servicio vivo | Atrasa `config.jam.start` dos días y arranca el servicio: la Decisión «Hoy no hay build jugable aprobada» aparece sin tocar la base a mano. Si no aparece, es un defecto: anota cada cuánto la comprueba el servicio |
| Parada y limpieza | `nomos stop`, nota de Second Brain borrada, `docs/plan-jam.md` y `docs/produccion/` retirados del juego, worktree del worker retirado |

Defectos: si un paso falla por un defecto de Nomos y la causa raíz cabe en una hora, corrígela en esta rama con su prueba y un commit propio; si no, descríbela en `docs/pendientes.md` (tabla: qué, cómo reproducir, dónde está) y sigue.

Acepta: `docs/aceptacion-hito26.md` en tablas, ≤ 70 líneas: pasos con hora y resultado; tabla de tokens por rol (worker, revisor, total) y por run; tabla de defectos (corregidos y pendientes); «Lo que no se probó».

## Tarea 3 · graphify solo donde hay código

**Archivos:** donde se decide `graphify.enabled` al iniciar un juego, `doctor`, `skills/nomos/SKILL.md` (una línea), `references/jam.md` (una línea).

- Si el juego no tiene archivos `.cpp`/`.h` bajo `Source/`, graphify queda desactivado al iniciar con una línea en `doctor`: «graphify: sin código C++, apagado (solo indexa código; no ve Blueprints ni mapas)». Con código, como hasta ahora.

Acepta: prueba de la decisión con y sin `Source/`.

## Cierre

Informe final en ≤ 20 líneas: tabla con tarea, commit, pruebas; la tabla de tokens del ensayo; una línea con lo que no se probó.
