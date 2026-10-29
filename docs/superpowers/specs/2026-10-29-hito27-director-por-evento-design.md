# Hito 27 · Director por evento: diseño

Plan: `docs/superpowers/plans/2026-10-29-hito27-director-por-evento.md`. Sin humano en el bucle: las decisiones de abajo son del worker.

## Por qué
Un director vivo días con `Monitor` arrastra todo el historial en cada turno (467 k tokens/turno en Block Kings). El servicio ya
ve los eventos: lanza una sesión corta solo cuando hay que decidir, con lo justo para decidir, y la sesión termina.

## Brief (`nomos brief director`)
- `service/src/director.ts: renderDirectorBrief(db, dataDir)`; plantilla `skills/nomos/references/brief-director.md` (≤ 40 líneas,
  `{{clave}}` como `brief-worker.md`). La CLI abre la base como `nomos reanudacion` (sin servicio) y lo imprime.
- Secciones, en orden y cada una con tope: Equipo (solo con `team.enabled`, 1 línea por peer), Hito (tarea «Cierre…» abierta más
  antigua) y día de jam (`jam.start`), Tareas abiertas (≤ 12, estado · título · id8 · último evento), Pendientes (Decisiones abiertas ≤ 5 y
  aprobaciones pendientes ≤ 5), Mensajes sin responder (≤ 5, con `seq` y `messageId`), Eventos nuevos (≤ 10, `seq > director.wake_seq`,
  solo tipos que despiertan), Acciones probables (3, con su orden). Corte duro a 60 líneas. Nada de historial.
- Acciones: por prioridad, responder mensaje → contestar worker que espera → revisar/integrar la tarea que lo pide → «Sin nada que
  decidir: termina». Heurística mía, sencilla a propósito.

## Cola y lanzamiento
- Cursor propio: columna `director.wake_seq` (la tabla `director` ya existe). La cola son los eventos que despiertan con
  `seq > wake_seq`; no hay tabla nueva.
- Tipos que despiertan: los de SKILL.md paso 3 + `requiredTypes` del vigilante (Decisiones y «Por aprobar») + `team.joined`,
  `team.request`, `lease.conflict`, `integration.conflict`. Se excluye lo que provoca el propio director: `run.finished` de su run
  (`taskId: 'director'`) y `command.*` de órdenes `director.*` (si no, cada sesión despertaría a la siguiente).
- `directorTick(ctx)` en la pasada del planificador (5 s), solo con `director.mode: "evento"`: si hay una run de director en marcha,
  nada (lo nuevo espera a la siguiente: reencolado gratis por cursor); si el primer evento pendiente tiene ≥ `debounceSeconds`,
  encola `director.wake` (clave idempotente por `seq`).
- `director.wake`: vuelve a comprobar que no hay otro director; escribe el brief en `<datos>/director-brief.md`, avanza
  `wake_seq` al último evento, crea la run (`taskId: 'director'`, `role: 'director'`, `provider: 'claude'`, `sessionId`, plazo 20 min)
  y abre terminal en la raíz del juego con `orca.terminalCreate` (el mismo lanzador de los workers: Orca o proceso `claude -p`)
  con `claude --model <roleModel('director')> --dangerously-skip-permissions --session-id <id> "/nomos evento: lee <brief>"`.
- `director.poll` cada 5 s: lee el terminal; terminada = hubo salida y el terminal está en reposo en dos sondeos seguidos
  (proceso salido o TUI de Orca quieta). Cierra la run `done` con la última línea como resumen y cierra el terminal. Pasados
  20 min: run `failed`, terminal cerrado y la orden falla (`command.failed`); el siguiente evento lanza otra.
- Tokens: `finishRun` ya encola `run.tokens`; para el director la transcripción está en la carpeta del juego y el gasto va al
  presupuesto del workspace.
- Modelo: `director` entra en `config.models`; por defecto sonnet.
- No ocupa cupo de workers Claude; `GET /runs/:id` acepta runs sin tarea.

## SKILL.md y panel
- SKILL.md «Modo evento» ≤ 10 líneas. `nomos jam init` deja `director.mode: "evento"`.
- Producción: una línea «Director: N despertares · X tokens» a partir de las runs `director` vistas; sin vista nueva.
- Chat: `GET /messages` da `from` («Ana (UI)») a los mensajes con origen `equipo` y les quita ese prefijo al texto; la burbuja firma
  con `from` en vez de «Tú».

## Fuera
Sin vista nueva, sin cambios al modo `sesion`, sin reintentos propios: el siguiente evento es el reintento.
