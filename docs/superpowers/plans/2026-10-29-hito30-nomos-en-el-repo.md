# Hito 30 · Nomos viaja dentro del repo del juego

> **For agentic workers:** worktree `C:/Users/richa/orca/workspaces/kratos/hito30-embed` de `C:/Users/richa/Documents/nomos` (rama `hito30-embed` desde `main`, que ya incluye el hito 26). Ponytail full: el diff más corto que funciona, sin dependencias nuevas. Lee solo lo que vayas a tocar con grep y rangos de `sed`. No toques los servicios de los puertos 8780 y 8781 ni la carpeta de Block Kings. Pruebas con `npm test`, `npm run test:panel`, `npm run build`. Un commit por tarea. No fusiones en main. No hagas push a ningún remoto real. Diseño aprobado: `docs/superpowers/specs/2026-10-29-equipo-design.md`, sección «Nomos viaja con el juego»; léela entera antes de empezar.

**Por qué (usuario, 29 oct, literal):** «todo eso tiene que ser parte del mismo repo donde vive el proyecto. Y si levantas claude en ese proyecto claude tiene que saber todo de nomos sin tener que instalar nada externo, ni nada. Tiene que adquirirlo a través del proyecto». Hoy Nomos vive en `C:/Users/richa/Documents/nomos`, la skill es un enlace en `~/.claude/skills/nomos` y los workers nacen en terminales de Orca. Un compañero que clona el juego no tiene nada de eso.

**Goal:** un compañero clona el juego, abre Claude Code en la carpeta, escribe `/nomos` y Nomos arranca y lanza workers sin instalar nada aparte de Git, Node 25, Claude Code y Unreal.

**Hechos comprobados (no los investigues de nuevo):**
- El servicio es Node ≥ 25 sin dependencias (`package.json` sin `dependencies`); se ejecuta como `node service/src/cli.ts …`. El panel compilado está en `panel/dist` (≈ 2 MB). Skills en `skills/` (nomos, game-ui-art-director, ue-umg-ui, ue-visual-qa, ≈ 240 KB). `nomos skills install --data .nomos` ya copia las skills de UI al juego.
- Claude Code carga las skills de proyecto desde `<repo>/.claude/skills/<nombre>/SKILL.md` y lee `<repo>/CLAUDE.md`.
- Interfaz de terminal de Orca en `service/src/adapters/orca.ts`: `terminalCreate(path, title, command)`, `terminalRead(handle, cursor)` → `TerminalPage`, `terminalSend(handle, text)`. `worker-launch.ts` y `worker-poll.ts` solo usan esa interfaz; las marcas (`NOMOS_DONE`, etc.) se leen del texto (`worker-markers.ts`).
- `doctor` ya tiene filas por herramienta (graphify, ponytail, memoria). `data-paths.ts` resuelve rutas de datos.
- Pendiente del hito 26 (`docs/pendientes.md`): una dependencia con la revisión aprobada pero sin integrar libera la tarea siguiente (`service/src/scheduler-state.ts:46`).

---

## Tarea 1 · `nomos embed`

**Archivos:** CLI (`nomos embed <juego> [--update]`), `scripts/` si hace falta, `skills/nomos/SKILL.md`, `README.md` (≤ 10 líneas nuevas).

- Copia al repo del juego: `Tools/Nomos/` (= `service/`, `panel/dist`, `package.json`, `LICENSE`, `VERSION` con el commit corto de Nomos y la fecha), `.claude/skills/<las 4 skills>/`, un envoltorio `nomos.cmd` (y `nomos.sh`) en la raíz que ejecuta `node Tools/Nomos/service/src/cli.ts "$@"`, y una sección `## Nomos` en el `CLAUDE.md` del juego (crea el archivo si no existe; si la sección existe, la reemplaza) de ≤ 12 líneas: qué es, que `/nomos` existe, cómo arrancar, que `.nomos/` es local. Añade `.nomos/` al `.gitignore`. No hace commit: lo deja listo y lo dice.
- `--update` reemplaza `Tools/Nomos` y las skills conservando `CLAUDE.md` fuera de la sección. El servicio, al arrancar desde `Tools/Nomos`, resuelve sus rutas relativas a su propio archivo, no al cwd (comprueba `panel/dist`, migraciones, skills).
- La skill embebida es la misma `SKILL.md`; donde diga `nomos …` el envoltorio de la raíz lo resuelve. El `CLAUDE.md` lo dice en una línea.

Acepta: prueba con un repo Git temporal: tras `embed`, existen las rutas, el envoltorio arranca `nomos status --data .nomos` desde la raíz del juego, `VERSION` coincide, `--update` conserva el resto del `CLAUDE.md`.

## Tarea 2 · Workers sin Orca

**Archivos:** nuevo `service/src/adapters/process-terminal.ts`, donde se elige el adaptador (`config.launcher: "auto"|"orca"|"process"`, por defecto `auto` = Orca si responde, si no proceso; `NOMOS_LAUNCHER` lo fuerza), `doctor`.

- `terminalCreate` lanza `claude --model <m> --session-id <id> --dangerously-skip-permissions` como proceso hijo con `cwd` en el worktree, el prompt por stdin y stdout+stderr a `<datos>/terminals/<handle>.log`; `terminalRead` devuelve el texto nuevo desde el cursor (bytes) y `source: 'stream'`; `terminalSend` escribe en stdin. Fin del proceso = la página marca `exited` y el poll lo trata como hoy trata una terminal cerrada. Matar = árbol de procesos (reutiliza lo de `process.ts`).
- Si `claude -p`/modo no interactivo resulta más fiable que el interactivo por stdin, úsalo y documenta la elección en el adaptador en 2 líneas; lo importante es que las marcas `NOMOS_*` lleguen al log y que `worker-poll` no cambie.
- `doctor`: fila «Lanzador de workers: Orca» u «: proceso (`claude` en PATH)».

Acepta: pruebas del adaptador con un `claude` falso (script Node que imprime marcas y lee stdin); prueba de la elección `auto`; aceptación real: un juego con `NOMOS_LAUNCHER=process`, worker sonnet real que cierra una tarea pequeña con `NOMOS_DONE`, revisión y tokens registrados.

## Tarea 3 · `doctor` dice qué falta

- Tabla «Necesario»: Git, Node ≥ 25, Claude Code (`claude --version`), Unreal (ruta del motor). Tabla «Opcional»: Orca, graphify, ponytail, Second Brain (`brain.py` existe), ffmpeg. Cada fila: presente/ausente y una línea de qué pierde si falta. `nomos start` sin algo necesario para y lo dice; sin algo opcional sigue.
- `memory.command` por defecto deja de apuntar a `C:/Users/richa/...`: si `brain.py` no existe en esa ruta ni en `SECOND_BRAIN_ROOT`, la memoria queda apagada con una línea en `doctor`.

Acepta: prueba de `doctor` con PATH vacío y con todo presente.

## Tarea 4 · Dependencias de verdad

- Una tarea dependiente no arranca hasta que su dependencia está **integrada**, no solo con la revisión aprobada (`scheduler-state.ts:46`). Quita la fila de `docs/pendientes.md`.

Acepta: prueba del planificador con A revisada sin integrar → B espera; A integrada → B arranca.

## Tarea 5 · Aceptación de punta a punta

Clona KratosFabTest a una carpeta temporal (`git clone` local), `nomos embed` desde el worktree de Nomos, commit en el clon, `.\nomos.cmd start --data .nomos --port <libre>` con `NOMOS_LAUNCHER=process`, `NOMOS_MEMORY=off`, `NOMOS_GRAPHIFY=off`; crea una tarea pequeña en `Source/`, worker sonnet por proceso, revisión, integración; `nomos stop`; borra el clon. Comprueba además que `claude -p "¿Qué skills de proyecto tienes?" ` ejecutado con cwd en el clon nombra `nomos` (si `-p` no está disponible, comprueba la ruta de la skill y dilo).

Acepta: `docs/aceptacion-hito30.md` ≤ 60 líneas en tablas con horas, tokens del worker por proceso y lo que no se probó.

## Cierre

Informe final en ≤ 20 líneas: tabla tarea / commit / pruebas; tokens del worker por proceso; lo que no se probó.
