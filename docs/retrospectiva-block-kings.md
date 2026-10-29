# Retrospectiva Block Kings → qué cambia en Nomos antes de la game jam

Fecha: 2026-10-29. Fuentes: transcripciones de Claude Code (`~/.claude/projects`), `.nomos/nomos.db` del juego, `docs/produccion/analisis-retrasos.md`, git de ambos repos, vault de Second Brain. Block Kings queda cerrado como proyecto; esto es lo que se lleva Nomos.

## 1. Cuánto costó (tokens reales, 17-29 oct)

| Quién | Sesiones | Turnos | Tokens de entrada | Contexto medio por turno |
|---|---|---|---|---|
| Orquestador (UnrealDojo, Fable) | 9 | 3 074 | 1 494 M | 486 k |
| Desarrollo de Nomos (hitos 1-22) | 83 | 5 172 | 1 728 M | 334 k |
| Workers del juego (Opus) | 35 | 4 105 | 1 289 M | 314 k |
| Director del juego (Opus) | 4 | 1 847 | 862 M | 467 k |
| Revisores (Opus) | 53 | 695 | 68 M | 98 k |
| **Total** | **184** | **14 893** | **5 454 M** | |

- El 98 % son lecturas de caché: cada turno vuelve a pasar un contexto de 300-490 k tokens. La salida total fueron 12,8 M.
- **Un tercio del gasto fue construir la herramienta** mientras producía el juego (1 728 M).
- El director gasta más por turno que un worker: vive días con el vigilante y acumula todo el historial.
- Los revisores son baratos (98 k por turno): no son el problema.

## 2. Qué salió del tiempo (resumen del análisis del 25 oct, vigente)

| Causa | Coste | Estado en Nomos |
|---|---|---|
| J1 cerrado sin prueba jugable → 7 tareas de corrección encadenadas | 18,9 h de cupo (44 % de la actividad) | Hito 22: «Por aprobar». Falta hacerlo obligatorio en cada cierre |
| Planificador apagado por RAM (arranques a mano) | 10,4 h vacías | Hito 22: regla de RAM y turno de Unreal |
| Renombrado Esquina → Block Kings | 7,3 h | Incidente de una vez |
| Defectos de Nomos/Orca (atascos, reconciliación, ramas viejas, marcas partidas) | ≈ 7 h | Hitos 13-22 |
| Reinicio del PC + 1 h sin orquestador | 2,2 h | Hito 22: autoarranque y runs muertas < 2 min |
| 13 reinicios del servicio, 10 por subir de versión | minutos cada uno, director parado | Regla: Nomos congelado durante producción |

Datos del juego: 32 tareas (26 cerradas), 212 runs, 28 vueltas de corrección en 14 tareas, 16 comprobaciones fallidas de las que 9 eran líneas base visuales equivocadas, 26 679 comandos del servicio de los que 25 311 son `worker.poll`.

## 3. Cómo trabajamos y qué cambiar

| Lo que hicimos | Qué costó | Qué hacer en la jam |
|---|---|---|
| Director de larga vida escuchando con Monitor | 467 k de contexto por turno durante días | Director por evento: sesión corta con brief compacto que lee el estado de `nomos.db`; o reinicio del director cada hito |
| Opus en todo por regla del usuario | Workers 314 k por turno | Opus solo implementa; revisión, QA, integración y tareas de docs con Sonnet |
| Construir Nomos y el juego a la vez | 1 728 M tokens y 10 reinicios del servicio | Nomos cerrado antes del día 1 de la jam; solo hotfix con aceptación en KratosFabTest |
| Plan de 30 tareas (J0-J6) para un juego completo | 44 % del trabajo fuera del plan | Plan de jam: 1 arena, 1 mecánica, build jugable cada día, «Por aprobar» obligatorio |
| Diario, specs y análisis de cientos de líneas | Nadie los lee; el usuario pide visual y comportamiento | Hito 23: markdown corto y visual en todo el panel; detalle técnico plegado |
| Second Brain con guardado automático de sesiones | 446 registros de sesión y 6 notas útiles del proyecto | Nomos guarda una nota de aprendizaje al cerrar cada hito; las sesiones no cuentan |
| graphify instalado y nunca usado; ponytail activo por hook | Workers exploran con `cat` y `grep` | Hito 23: grafo por proyecto al arrancar y `graphify query` en los briefs |

## 4. Second Brain: estado comprobado el 29 oct

| Pieza | Estado |
|---|---|
| Hooks de Claude Code (SessionStart, UserPromptSubmit, Stop, PreToolUse) | Funcionan; auditoría en `.system/audit.jsonl` |
| MCP `second_brain` (search, read, save) | Funciona |
| Sincronización Git (`SecondBrain-windows-sync`) | Al día (último sync 04:53 UTC) |
| Notas: 2 914 | 2 233 sesiones (77 %), 590 de proyecto, 56 de conocimiento, 35 de perfil |
| Block Kings | 446 sesiones automáticas, 6 notas de proyecto, 0 de conocimiento |

Diagnóstico: la memoria funciona, pero se guarda lo que no sirve. El director hizo 6 `save_memory` en 1 847 turnos y las lecciones quedaron en `reanudacion.md` y en el diario, que caducan con el proyecto. Las búsquedas del hook son por texto local y con la petición entera como consulta no encuentran nada; funcionan con 3-6 palabras clave.

## 5. Siguientes hitos de Nomos

| Hito | Qué | Por qué |
|---|---|---|
| **23 · Legible y con grafo** · fusionado `78dbfb7` | Markdown corto y visual en todas las secciones; graphify (solo código, sin clave de LLM) y ponytail en cada proyecto | Petición del usuario del 29 oct |
| **24 · Director barato** · fusionado `e096e33` | Opus implementa, Sonnet revisa, hace QA e integra; tokens por run en ficha, Producción y `nomos status`; `.nomos/reanudacion.md` automático y una sesión de director por hito | 862 M del director y 1 289 M de workers |
| **25 · Modo jam** · fusionado `a119e13` | `nomos jam init` (un hito por día); el cierre de hito exige tu aprobación sobre la build estampada; en jam, Decisión «Recortar o seguir» tras 24 h sin build aprobada; las lecciones del cierre van a Second Brain | Preparar la game jam |

| **26 · Ensayo real** · fusionado `5936482` | Jam completa en KratosFabTest con build real (2,9 min) y 1,99 M tokens con sonnet; 4 defectos corregidos (worker «esperando» con el trabajo hecho, tokens de runs reabiertas, último turno sin medir, aviso de 24 h desde la fecha equivocada); las pruebas no pueden escribir en Second Brain; graphify solo con C++ | Validar los hitos 23-25 antes de la jam |
| **30 · Nomos en el repo** · fusionado `cc648c9` | `nomos embed` deja `Tools/Nomos`, las skills en `.claude/skills` y la sección «Nomos» del `CLAUDE.md` del juego; workers sin Orca (`claude -p` por proceso); `doctor` con «Necesario» y «Opcional»; una dependencia espera a estar integrada | «Claude tiene que saber todo de Nomos a través del proyecto, sin instalar nada» |
| **29 · Equipo** · fusionado `c2073a3` | Varios Nomos sobre el mismo juego por la rama `nomos/equipo`: frentes sin pedir permiso, reservas sincronizadas, `main` publicado tras integrar, conflicto en binarios resuelto por quien choca con dos botones, peticiones entre frentes, franja Equipo | Un equipo en la jam, cada Nomos en su funcionalidad |
| **27 · Director por evento** · fusionado `0524a01` | El servicio lanza una sesión corta de director con un brief de dos pantallas cuando pasa algo; 0,18 M tokens y 30 s por despertar real; modo por defecto en jam | 862 M del director de larga vida |
| **28 · Líneas base por aprobar** · fusionado `9bd69a4` | Una captura nueva es propuesta hasta que la apruebas desde «Por aprobar»; hasta entonces informa sin fallar | 9 de 16 comprobaciones fallidas eran líneas base equivocadas |

Sin probar en real tras los ocho hitos: dos máquinas con GitHub y LFS de verdad en modo equipo, el despertar del director lanzado por Orca, `visual: cambia` y «Rechazar» con Unreal, y la tercera comprobación contra una línea base ya aprobada. Nada publicado con push.
