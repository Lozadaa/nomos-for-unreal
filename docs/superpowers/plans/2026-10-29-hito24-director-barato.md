# Hito 24 · Director barato

> **For agentic workers:** worktree de `C:/Users/richa/Documents/nomos` (rama `hito24-director-barato` desde `main`, que ya incluye el hito 23). Ponytail full: el diff más corto que funciona, sin dependencias nuevas. Lee solo lo que vayas a tocar con grep y rangos de `sed`. No toques los servicios de los puertos 8780 y 8781. Pruebas con `npm test`, `npm run test:panel`, `npm run build`. Un commit por tarea. No fusiones en main.

**Por qué (medido el 2026-10-29 en las transcripciones de Claude Code de Block Kings):** el director Opus consumió 862 M tokens en 1 847 turnos (467 k de contexto medio por turno) porque vive días en la misma sesión con el vigilante; los workers Opus 1 289 M (314 k por turno); los revisores solo 68 M. Nomos no sabe cuánto cuesta cada run: la tabla `spends` está vacía.

**Goal:** revisión, QA e integración corren con Sonnet por defecto; cada run registra sus tokens y el panel los enseña por tarea; el director puede reiniciarse al cerrar cada hito sin perder nada porque Nomos escribe solo el documento de reanudación.

**Hechos comprobados (no los investigues de nuevo):**
- Los workers se lanzan con `claude --model <workerModel> --dangerously-skip-permissions` desde el servicio (busca `workerModel` en `service/src`). `workerModel` vale para implementador y revisor por igual.
- Claude Code acepta `--session-id <uuid>` al lanzar y escribe la transcripción en `~/.claude/projects/<carpeta-con-guiones>/<uuid>.jsonl`; cada línea `type:"assistant"` lleva `message.usage` con `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` y `message.model`. La carpeta se deriva del cwd del worker (ruta absoluta con `:`/`\`/`/` sustituidos por `-`).
- `spends` tiene columnas `id, created_at, updated_at, budget_id, run_id, kind, amount, note`.
- Hoy el documento de reanudación (`.nomos/reanudacion.md` en Block Kings) lo escribió el director a mano.

---

## Tarea 1 · Un modelo por rol

**Archivos:** config del servicio (`config.json` del juego y su lectura en `service/src`), el lanzador de workers, `skills/nomos/SKILL.md` (sección Repartir), README.

- `models` en `config.json`: `{"implementacion":"opus","revisor":"sonnet","qa":"sonnet","integrador":"sonnet","animacion":"sonnet"}`; `workerModel` sigue valiendo como valor por defecto de `implementacion` para no romper configs existentes.
- El panel muestra el modelo en la tarjeta de cada run (ya muestra proveedor y rol).

Acepta: prueba `node:test` del lanzador que comprueba el `--model` por rol con y sin `models`; SKILL.md y README en una tabla de ≤ 6 filas.

## Tarea 2 · Tokens por run en el panel

**Archivos:** lanzador de workers (añadir `--session-id`), un lector de transcripciones en `service/src` (≤ 120 líneas, stdlib), `spends`, la ficha de tarea y la vista de producción del panel.

- Cada run guarda `session_id` en `runs.metadata` y, al terminar (`run.finished`, `review.finished`, cancelación o fallo), el servicio lee su `.jsonl` y escribe una fila en `spends` por run: `kind: 'tokens'`, `amount` = tokens de entrada totales (frescos + caché) y en `note` el JSON `{input, output, cacheRead, cacheWrite, turns, model}`. Si el archivo no existe aún, reintenta una vez a los 60 s y lo deja en 0 con nota «sin transcripción».
- Panel: en la ficha de tarea, una línea «Tokens: 1,3 M · 42 turnos · opus» por run y el total de la tarea; en Producción, el total del proyecto en la cabecera con el reparto por rol en tooltip. Formato en M con una decimal, nunca cifras largas.
- `nomos status` añade `tokens: {total, porRol}`.

Acepta: prueba con un `.jsonl` de ejemplo (3 turnos, dos modelos) que da el total esperado; prueba de que un run sin transcripción queda en 0 con nota; e2e del panel con captura a 1366×768 en `docs/capturas-24/`.

## Tarea 3 · Reanudación automática y director que se reinicia

**Archivos:** CLI (`nomos reanudacion`), servicio (generación del documento), `skills/nomos/SKILL.md` y `references/cierre.md`.

- `nomos reanudacion --data .nomos` escribe `.nomos/reanudacion.md` desde la base: estado del servicio y versión, tareas por estado con su `waitReason`, Decisiones abiertas, holds, últimas 5 lecciones (campo `lessons` del cierre si existe) y la orden exacta para rearmar el vigilante. ≤ 60 líneas, en tablas. El servicio lo regenera solo al cerrar cada tarea (`finalize.run`) y al parar.
- SKILL.md: al cerrar un hito (tarea de cierre `done`), el director anuncia en una línea que termina la sesión y que la siguiente arranca con `/nomos` y lee `.nomos/reanudacion.md`. Regla fija: una sesión de director por hito; nunca más de 200 eventos del vigilante en la misma sesión.

Acepta: prueba `node:test` del generador con una base sembrada (3 estados, 1 Decisión, 1 hold); prueba de que `finalize.run` deja el archivo actualizado; aceptación real en `C:\Users\richa\Documents\Unreal Projects\KratosFabTest` con `--data .nomos-hito24` y un puerto libre: crear una tarea, pararla, `nomos reanudacion` y comprobar el archivo; `docs/aceptacion-hito24.md` en tabla, ≤ 60 líneas.

## Cierre

Informe final en ≤ 20 líneas: tabla con tarea, commit, pruebas y capturas; una línea con lo que no se probó.
