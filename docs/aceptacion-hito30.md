# Aceptación del hito 30 · Nomos dentro del repo del juego

29 oct 2026, clon local temporal de KratosFabTest (`git clone`, LFS sin descargar), Nomos del worktree `hito30-embed` (f9eb600).
Entorno: `NOMOS_LAUNCHER=process`, `NOMOS_MEMORY=off`, `NOMOS_GRAPHIFY=off`, puerto libre (58302 y después 65369). El original de KratosFabTest, Block Kings y los servicios de 8780/8781 no se tocaron.

## Recorrido

| Hora | Paso | Resultado |
|---|---|---|
| 14:13:47 | `git clone` local del juego | 4b37faa |
| 14:13:56 | `node service/src/cli.ts embed .` | `Tools/Nomos` (3,3 MB, `VERSION` = `f9eb600 2026-10-29`), 4 skills en `.claude/skills`, `nomos.cmd`, `nomos.sh`, sección `## Nomos` en `CLAUDE.md` (8 líneas), `.nomos/` en `.gitignore` |
| 14:13:56 | Commit en el clon | a6b06c4, 254 archivos |
| 14:14:10 | `.\nomos.cmd start --data .nomos --port 58302` | `ARRANCADO`; `status` con el proyecto KratosFabTest |
| 14:14:10 | `.\nomos.cmd doctor` | Necesario: Git, Node 25.9.0, Claude Code 2.1.312, Unreal 5.8 presentes; «Lanzador de workers · proceso (`claude` en PATH)» |
| 14:14:10 | `node .claude/skills/nomos/scripts/nomos.ts status` | La skill embebida llega a `Tools/Nomos` |
| 14:14:29 | `claude -p` (haiku) con cwd en el clon: «¿qué skills de proyecto tienes?» | `game-ui-art-director`, `ue-umg-ui`, `ue-visual-qa`, `nomos` |
| 14:15:21 | Reinicio del servicio con un `claude` falso primero en el PATH (ver abajo) | `ARRANCADO` en 65369 |
| 14:15:29 | `task create` (área gameplay, alcance `Source/KratosFabTest/NomosHito30.h`) | `preparada` |
| 14:15:32 | El planificador arranca el worker por proceso | Árbol `.nomos/worktrees/nomos-f80bb643`, log en `.nomos/terminals/<id>.log` |
| 14:15:47 | `worker-poll` lee `NOMOS_DONE` del log | `claude -p --model opus --dangerously-skip-permissions --session-id …`; commit ea6b6e7; tarea en `revisando` |
| 14:15:56 | `task review` | Revisor por proceso (`--model sonnet`); `NOMOS_REVIEW` aprobado a las 14:16:08 |
| 14:16:19 | Aprobación (en el clon, como usuario de prueba) y `task integrate` | `integration.completed` 14:16:29, master@65cbddb |
| 14:16:37 | `task finalize` | `done` 14:16:41; el árbol del worker se retiró con `git worktree remove` |
| 14:16:57 | `.\nomos.cmd stop` y borrado del clon | `DETENIDO`; ningún `node` con el clon vivo |

## Tokens del worker por proceso

| Run | Modelo | Tokens |
|---|---|---|
| implementación | opus (por defecto del rol) | 0: worker falso, sin transcripción de Claude Code |
| revisión | sonnet | 0: worker falso |

## Lo que no se probó

| Qué | Por qué |
|---|---|
| Worker real de Claude (sonnet) por proceso cerrando la tarea | El clasificador de permisos de esta sesión rechazó lanzar `claude -p --dangerously-skip-permissions` («Create Unsafe Agents»). Se usó un `claude` falso (`claude.cmd` → script Node que lee el brief, commitea y escribe la marca) con el mismo camino: proceso hijo, stdin, log, `worker-poll`. Falta repetirlo con el `claude` real y anotar sus tokens. |
| Continuación con `--resume` de un Claude real | Solo en la prueba unitaria con el `claude` falso. |
| Comprobaciones de Unreal (compilación) en la tarea | La tarea no exigía pruebas («Revisión aprobada; sin pruebas exigidas»). |
| `./nomos.sh` en Git Bash y `embed --update` sobre un juego real | Cubiertos solo por `tests/service/embed.test.ts` (`.cmd` en Windows). |
| Un compañero sin Orca ni Second Brain | Simulado en `doctor` con PATH vacío; en este equipo Orca estaba abierto y `NOMOS_LAUNCHER=process` forzó el proceso. |
