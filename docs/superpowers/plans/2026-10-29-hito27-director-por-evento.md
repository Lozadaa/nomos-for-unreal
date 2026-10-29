# Hito 27 · Director por evento

> **For agentic workers:** worktree `C:/Users/richa/orca/workspaces/kratos/hito27-director-evento` de `C:/Users/richa/Documents/nomos` (rama `hito27-director-evento` desde `main`, que ya incluye los hitos 26, 30 y 29). Ponytail full: el diff más corto que funciona, sin dependencias nuevas. Lee solo lo que vayas a tocar. No toques los servicios de los puertos 8780 y 8781. Pruebas con `npm test`, `npm run test:panel`, `npm run build`. Un commit por tarea. No fusiones en main. No hagas push. Usa `superpowers:brainstorming` y `superpowers:writing-plans` antes de tocar código: el diseño del brief y de la cola importa más que el código.

**Por qué:** en Block Kings el director fue un Opus vivo durante días escuchando con `Monitor`: 1 847 turnos, 467 k tokens de contexto por turno, 862 M en total. El hito 24 lo acortó a una sesión por hito, pero sigue esperando con todo el historial en contexto. El servicio ya sabe cuándo pasa algo: puede lanzar al director como lanza a un worker, solo cuando hay que decidir, con un brief corto, y dejar que termine.

**Goal:** con `director.mode: "evento"`, no hay sesión de director permanente. El servicio lanza una sesión corta de Claude Code en el juego cuando ocurre un evento que exige decisión, con un brief de ≤ 2 pantallas, y la sesión termina al actuar. El coste por evento queda registrado como el de un worker.

**Hechos comprobados (no los investigues de nuevo):**
- Los workers se lanzan en terminales de Orca con `claude --model <modelo> --dangerously-skip-permissions` y `--session-id` (hito 24); `service/src/handlers/worker-launch.ts` y `worker-poll.ts` leen la terminal. Modelo por rol en `config.models` / `roleModel()`.
- `.nomos/reanudacion.md` se reescribe al cerrar cada tarea y al parar (`nomos reanudacion`). `nomos status` resume el estado. `nomos vigila` entrega eventos con cursor por sesión.
- Eventos que hoy despiertan al director (SKILL.md paso 3): `message.received, run.finished, worker.waiting, command.failed, review.finished, test.failed, task.moved, integration.completed, task.closing_blocked`, más `decision.opened/updated`.
- SKILL.md ya exige una sesión de director por hito y ≤ 200 eventos por sesión.

---

## Tarea 1 · Brief del director

**Archivos:** CLI (`nomos brief director --data .nomos`), `skills/nomos/references/brief-director.md` (nuevo, ≤ 40 líneas).

- Imprime en ≤ 2 pantallas (≤ 60 líneas): con `team.enabled` (hito 29), abre con «Equipo» (≤ 1 línea por persona: nombre, frente, presente/ausente, tareas, reservas, build, avisos de conflicto); después hito en curso y día de jam, tareas por estado (una línea cada una con su último evento), Decisiones y aprobaciones pendientes, mensajes del usuario sin responder, los eventos nuevos desde la última sesión de director (cursor propio `director`), y las 3 acciones más probables con su comando. Nada de historial.

Acepta: prueba del contenido con una base de ejemplo y del límite de líneas.

## Tarea 2 · Lanzamiento por evento

**Archivos:** servicio (nuevo handler `director.wake`, cola en la tabla `director`), `config.ts` (`director: {mode: "sesion"|"evento", debounceSeconds: 60}`), SKILL.md.

- Con `mode: "evento"`: los eventos de la lista de arriba (más `team.joined`, `lease.conflict` y los avisos de conflicto del hito 29) encolan un despertar; se agrupan durante `debounceSeconds`; nunca hay dos sesiones de director a la vez; si llega un evento con el director activo, se encola para la siguiente. El servicio lanza en Orca `claude --model <roleModel('director')> --session-id <id> --dangerously-skip-permissions` con el prompt «/nomos evento» más el brief. La sesión actúa con la CLI y termina; `run` con `role: director` y tokens como un worker. Tiempo máximo 20 min; si se agota, `command.failed` y el siguiente evento vuelve a lanzar.
- SKILL.md: sección «Modo evento» de ≤ 10 líneas: leer el brief, actuar, no armar `Monitor`, no esperar, terminar con una línea. El modo `sesion` queda como está.
- Panel: Producción enseña los despertares del director como runs, sin vista nueva.

Acepta: pruebas con Orca falso: agrupación de eventos, un director a la vez, reencolado, tiempo máximo; aceptación real en KratosFabTest con `--data .nomos-hito27` y `NOMOS_MEMORY=off`: un mensaje del usuario desde el panel despierta al director (sonnet), responde y la sesión termina; tokens en Producción; `docs/aceptacion-hito27.md` ≤ 60 líneas.

## Tarea 3 · Modo por defecto en jam

- `nomos jam init` deja `director.mode: "evento"`. Fuera de jam, por defecto `sesion`. Una línea en `references/jam.md`.

## Cierre

Informe final en ≤ 20 líneas: tabla con tarea, commit, pruebas; tokens de un despertar real; lo que no se probó.
