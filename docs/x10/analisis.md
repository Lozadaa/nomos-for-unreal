# x10: dónde se van el tiempo y los tokens de Nomos

Fecha: 2026-11-07. Datos reales, sin estimar salvo donde se dice «simulación».

Fuentes:
- `Herbalist/.nomos/nomos.db`: del 30 oct al 5 nov, 56 tareas (45 cerradas), 1 365 runs, 249 comprobaciones.
- Las 147 transcripciones de los workers de Herbalist (`~/.claude/projects/*Herbalist-nomos-*`), leídas con scripts que solo suman tiempos y tokens.
- 31 logs de Unreal en `Saved/Logs` de Herbalist y sus worktrees.
- `docs/retrospectiva-block-kings.md` y el benchmark en frío de FASTVFX (`fastvfx:docs/fastvfx/bench-B-frio.json`).
- Medidas propias con `claude -p` (haiku, una pregunta de una palabra) para el contexto fijo de cada sesión.

## Cuellos de botella, por impacto

| # | Qué | Números | Tipo |
|---|---|---|---|
| 1 | **Turnos de worker con el contexto ya enorme** | Workers de Herbalist: 2 309 M tokens de 2 701 M (85 %); 299 k de contexto medio por turno; el 60 % de sus tokens se gastó en turnos de más de 300 k y el 83 % en turnos de más de 200 k; el 10 % de las sesiones más largas se lleva el 55 % | tokens |
| 2 | **Unreal en frío para cada comprobación del worker** | 1 090 arranques de `UnrealEditor-Cmd` en 147 sesiones: 21,2 h, el 57 % del tiempo de herramientas de los workers. Python en el editor: 339 (mediana 23 s); tests de automatización: 351 (33 s); juego con captura: 359 (82 s). La inicialización del motor sola tarda 15 s de mediana (p90 33 s) | tiempo |
| 3 | **El turno de Unreal se retiene mucho y bloquea** | 170 turnos de worker, mediana 7,6 min, p90 53,5 min, 50 h en total. Mientras, las comprobaciones esperan: 2 `checks.run` esperaron 15,5 h a un editor retenido; los workers esperaron su turno 6,3 h (250 esperas, 91 s de media) | tiempo |
| 4 | **Contexto fijo en cada turno** | Cada sesión de Claude empieza con 64-68 k tokens (sistema, herramientas, skills, hooks): el 32 % de todos los tokens de Herbalist (68 k × 12 523 turnos). Los 16 plugins del usuario que un juego no usa (marketing, SEO, Vercel…) suman 5-8,5 k por turno | tokens |
| 5 | **Bucles de UI que no pasan el QA visual** | 35 `umg` fallidas (11,1 h de comprobación, p90 10,7 min); una sola tarea hizo 20 | tiempo |
| 6 | **Revisión que no arranca** | `review.start` suma 40,2 h desde que se pide hasta que termina (mediana 1,1 min, p90 46 min); en 5 casos «Sin hueco en claude» retuvo 1,7 h | tiempo |
| 7 | **Sondeo del servicio** | 41 985 `worker.poll` lanzan 238 000 `orca terminal read/wait` (0,33 s cada uno, unas 22 h de subproceso); `events` ocupa 585 MB en 6 días (`worker.output` 263 MB, `tool.completed` 56 MB) | servicio |
| 8 | **Esperas a la máquina** | RAM: 3,7 h de `checks.run` y 1,9 h de `ui.cycle` diferidos por «GB libres» | tiempo |

Lo que ya no es problema:
- **Director**: con el modo por evento (hito 27) Herbalist tuvo 877 despertares, 337 M tokens y 81 k de contexto por turno, frente a los 467 k del director de larga vida de Block Kings. El 84 % de esos 81 k es el contexto fijo (punto 4).
- **Revisores**: 55 M tokens (2 %), 86 k por turno.

## Detalle

### 1. Tokens de los workers

| Rol (Herbalist) | Runs | Turnos | Tokens de entrada | Contexto por turno |
|---|---|---|---|---|
| Implementación (claude) | 67 | 7 712 | 2 309 M | 299 k |
| Director por evento | 877 | 4 167 | 337 M | 81 k |
| Revisor (claude) | 80 | 644 | 55 M | 86 k |

- El primer turno de cada worker son 69 k, igual en las 147 sesiones; el último, 121 k de mediana y 495 k en el p90.
- 12 turnos por sesión de mediana, 184 en el p90 y 367 como máximo. Una corrección vuelve a la misma sesión, así que el contexto sigue creciendo.
- Claude Code compactó solo 26 veces: su ventana automática para Opus pasa de 500 k.
- Simulación con las 147 sesiones reales: compactar a 200 k (reanudar en 85 k) deja 1 118 M en lugar de 2 269 M (−51 %) con 127 compactaciones. A 150 k sería −58 % con 254.
- Lo que entra en el contexto: 16 M caracteres de resultados de herramientas, 3,6 M de skills y hooks, 1 155 imágenes (capturas leídas con Read) y briefs de 22-27 KB (17 KB de ellos son `docs/ui-direction.md` copiado entero).

### 2. Unreal en frío

| Uso desde el worker | Llamadas | Mediana | p90 | Total |
|---|---|---|---|---|
| Juego con captura (`-game`) | 359 | 82 s | 214 s | 11,1 h |
| Tests de automatización (`Automation RunTests`) | 351 | 33 s | 110 s | 5,6 h |
| Python en el editor | 339 | 23 s | 92 s | 4,3 h |
| UBT / UAT | 247 | 50 s | — | 3,4 h |

- Logs de Unreal: «Engine Initialization» tarda 15 s de mediana y 33 s en el p90; el log entero, 49 s.
- FASTVFX en frío: 42,8 s para un material, de los que el script del editor son 0,37 s. Lo demás son dos arranques del editor.
- 104 scripts distintos (`crear_efectos_h62.py`, `montar_h53.py`, `crear_materiales_ui.py`…): se escribe uno por tarea y se reescribe en cada corrección. FASTVFX ataca los de VFX y materiales.

### 3. Tiempo de pared de un worker

Las 147 sesiones suman 110,8 h. Unas 37 h son herramientas: 21,2 h de Unreal, 6,3 h esperando turno, 3,4 h de UBT, 3,2 h de CLI de Nomos y 2,2 h de lecturas. Las ~74 h restantes son el modelo pensando y escribiendo, unos 33 s por turno.

### 4. Contexto fijo, medido

| Arranque de `claude -p` | Tokens del primer turno |
|---|---|
| Como lanza Nomos hoy | 64,7-68,1 k |
| Sin los 16 plugins ajenos al juego | 59,4-59,6 k |
| Y además sin MCP | 55,1 k |
| Solo ajustes del proyecto (sin hooks ni plugins del usuario) | 38,0 k |

Lo de los hooks y la memoria de Second Brain es configuración del usuario: Nomos no lo quita.

## Qué se decidió

1. Sesiones de Claude que lanza Nomos (worker, revisor y director) con `--settings`: sin los plugins ajenos al juego y con `autoCompactWindow` a 200 k. Ataca los puntos 1 y 4.
2. Editor caliente (`nomos ue py`) para el Python en el editor: un Unreal abierto por worktree mientras dura el turno, reutilizado entre scripts. Ataca el punto 2 y, al acortar los turnos, el 3.
3. Instrucciones del worker y de la skill para usarlo: brief de una línea, no un manual.

Lo que queda fuera, con su motivo, está en [resultados.md](resultados.md).
