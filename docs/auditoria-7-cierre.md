# Auditoría de cierre · hito 7 «endurecimiento y acabado»

Fecha: 2026-10-23. Rama `hito7-acabado` sobre `main@eed03ed` (hitos 0-6, 8 y 9). Equipo: Windows 11, Node 25.9.0, Orca 1.4.207,
Unreal 5.8.3, Claude Code (workers Sonnet). **Ningún worker Codex**; Codex queda apagado por defecto en el producto.
Todo lo que figura como hecho se ejecutó en este equipo; lo que no, está en «Pendientes».

## Puertas

| Puerta | Resultado |
|---|---|
| `npm test` tres veces seguidas al cerrar | 475/475 en cuatro pasadas seguidas sin otra carga en el equipo |
| `npm test` bajo carga | Tarea 1: 4/4 en verde con dos suites en paralelo. **Al cerrar, no**: con dos suites en paralelo fallaron 1-3 pruebas por suite (plazos del vigilante, la espera de Orca y el CLI de 20 s) y `build-walkthrough.test.ts` entero con «does not provide an export named walkthroughArgs», que el archivo sí exporta y no cambió; con `npx skillsmith` en paralelo, 2 de 3 pasadas con un fallo. Sin causa identificada (ver Pendientes) |
| `npm run test:panel` | 279/279 (55 archivos) |
| `npm run build` | verde |
| `npx playwright test` (Chromium y Firefox) | 87 pasadas, 3 omitidas (exclusiones de Firefox ya conocidas). Una pasada intermedia dio 1 fallo que no se repitió en dos pasadas completas |
| skillsmith `skills/kratos` | 98/100 (`docs/skillsmith-hito7.txt`) |
| Archivos ≤ 200 líneas (código nuevo o tocado) | sí; `vistas.test.tsx` ya tenía 331 en `main` |
| Rutas nuevas con `127.0.0.1` y token | `GET /doctor`, `POST /capabilities/:id/check` (401 sin token, e2e `auth.spec`) |
| `web-design-guidelines` sobre lo tocado | 1 hallazgo (miniatura sin `width`/`height`), corregido; sin errores de accesibilidad pendientes |
| `ux-heuristics` | 9/10 (autoevaluación de Claude con la rúbrica, **no** una prueba con personas): sin problemas de severidad ≥ 3; fila fallida menor: la descripción de cada opción de Decisión solo se ve en tooltip/foco (cabe en el presupuesto de 20 palabras solo así) |

## Intermitencias: causas y correcciones

En `main` se habían visto fallos sueltos que pasaban al repetir. Cinco pasadas seguidas en esta máquina tranquila salieron
**5/5 en verde**; solo aparecieron con carga (dos `npm test` a la vez, como cuando trabajan varios agentes):

| Prueba | Causa | Corrección |
|---|---|---|
| `orca.test` «readiness reconoce Ask Codex…», `orca-claude.test` «relee tras wait timeout» | plazo de reloj real de 0,5 s / 2 s para 1-3 procesos `orca` falsos; con carga, lanzar node tarda más | espera por condición con plazo de 10 s (solo se agota si falla) |
| `watcher.test` «types reemplaza defaults…», `watcher.test` «rearmar reentrega…» | (1) `until` de 6 s para arrancar la CLI; (2) **fallo real**: en Windows `renameSync` del checkpoint da `EPERM` si otro proceso tiene el archivo abierto (reproducido: 1653 de 5077 renombrados con un lector concurrente) y el vigilante se caía | (1) 20 s; (2) `watcher-cursors.ts` reintenta el rename hasta 20 × 25 ms ante EPERM/EBUSY/EACCES (antivirus, indexador, un lector) |
| `watcher-recovery.test` «archivo corrupto…» | carrera de la prueba: la línea sale antes de reescribir el checkpoint y la prueba leía `null` | lectura tolerante (`?.`) |
| `commands.test` «dos workers compiten…» (`database is locked`) | **fallo real introducido y corregido en este hito**: la migración de carriles escribía en cada `openDb`; con dos conexiones, leer y luego escribir en la misma transacción da BUSY inmediato | la migración solo escribe al añadir la columna |
| `cli-review.test` «CLI task review…» | **fallo real**: el CLI cortaba cada petición a 1,5 s y `kratos start` esperaba 5 s; con el servicio ocupado daba «Servicio no disponible» | órdenes con 10 s, `start` con 15 s; el latido del vigilante mantiene 1,5 s |
| `runner.test`, `worker-recovery.test`, `wait.ts` | esperas por número de vueltas (2-3 s) | esperas por tiempo (10-15 s) |

## Hallazgos reales (corregidos)

1. **Empaquetado de `master` roto en KratosFabTest**: `Content/Kratos/Marcador.uasset` quedó con 4 bytes tras la prueba de
   conflictos del hito 6 (`8e942e0`); el cook falla. El resumen decía solo «no produjo un ejecutable»: `errorLines` ahora
   entiende `LogX: Error:`, `Cook failed.` y el `ExitCode` de UAT. En el recorrido del MVP lo retira un worker.
2. **El mapa del recorrido no se cocinaba**: `Failed to enter /Game/AdvancedCelShader/Maps/Sample`. BuildCookRun recibe `-map=`.
3. **Error fatal del juego oculto**: el informador de fallos mantiene vivo el proceso; ahora se lee el `Fatal error` del log del juego.
   Sin captura, el resumen cita los errores del log del juego.
4. **Ruta demasiado larga**: un empaquetado bajo una carpeta profunda muere al segundo con 3221225734; el mensaje lo dice también
   en hexadecimal (`0xC0000106`).
5. **Traza de Insights de ~0,9 GB por 30 s** (cpu, gpu, memoria): pasa a ser opcional (`walkthrough.trace: true`).
6. **Un 401 se mostraba como «Servicio desconectado»**: el panel distingue «Sin sesión» y «Sesión caducada».
7. **Codex apagado dejaba «Sin proveedor habilitado»** en tareas asignadas a Codex: ahora «Codex apagado: dale cupo en config.json».
8. **Nombre de archivo en la evidencia de Pruebas y en el visor 3D** (contra la regla del usuario): se usa el nombre del artefacto.
9. **Veredicto del revisor sin leer** (recorrido del MVP): Claude Code partió la línea justo tras `KRATOS_REVIEW` y el JSON
   quedó en las líneas sangradas siguientes; el lector de pantalla exigía marcador y JSON en la misma línea y la tarea se
   quedó 20 min en `revisando`. `screenMarkers` ahora une `KRATOS_X` solo con el JSON de las líneas siguientes. Como la
   pantalla ya analizada no se vuelve a leer (huella), el director pidió al revisor repetir la línea y se leyó al momento.
10. **Integración en bucle por un archivo local del usuario** (recorrido del MVP): el worker commiteó dos líneas de GameMode en
    `Config/DefaultEngine.ini`, que en el checkout del usuario está sin seguir a propósito (guarda un SecurityToken de Android).
    `merge --ff-only` se negaba a sobrescribirlo y el integrador lo trataba como «la rama avanzó»: reintentaba cada 5 s
    (unas 170 veces en 16 min). Ahora ese rechazo no se reintenta: el archivo del usuario no se toca, el run integrador se
    cancela y el responsable recibe la corrección de sacarlo de su commit (`git rm --cached`) y conseguir lo mismo sin él.
    **Regla: los archivos de `Config/` con secretos y, en general, todo lo que el checkout del usuario tiene sin seguir
    quedan fuera de los commits de los workers.** La misma lista incluyó los assets de la raqueta que `asset migrate` copió
    sin versionar al checkout del usuario (ver Pendientes).
11. **Orca bloquea el envío al worker** (`agent_prompt_blocked`): el composer de Orca guardaba un borrador
    («Captura 1920×1080 con el HUD») en el terminal del worker; ni el interrupt ni el reintento con `--retry-request` lo
    desbloquearon, y `worker.send` marcó la run como fallida y bloqueó la tarea. Vía usada: cerrar el terminal y crear
    otro en el mismo worktree con `claude --resume <sesión> "Lee el archivo .kratos-inbox/<orden>.md…"` como argumento, y
    registrar a mano el nuevo handle en la run con las mismas funciones del servicio que usa `worker.send` tras un envío
    (reserva, run en curso, tarea a implementando, sondeo, DONE anterior marcado como visto). **Hallazgo: Kratos necesita
    ese reenvío por terminal nuevo como fallback cuando Orca devuelve el bloqueo del composer**, en vez de fallar la run.
    Se repitió a las 00:49 con la corrección de la revisión de código y quedó **implementado** (`handlers/worker-deliver.ts`):
    ante `agent_prompt_blocked` se reintenta una vez la misma petición (`--retry-request <id> --wait-submit 20`); si
    sigue bloqueado y el worker es Claude, se cierra su terminal y se crea otro en el mismo árbol con
    `claude … --resume <sesión> "Lee el archivo .kratos-inbox/<orden>.md…"` (la sesión sale del `.jsonl` más reciente de
    `~/.claude/projects/<árbol>`), la run guarda el handle nuevo y sigue viva. En real a las 01:08: bloqueado, reintento
    bloqueado, `term_86deea85` con `--resume`, la run siguió `running` y el worker leyó la orden con su contexto.
    Pruebas en `worker-deliver.test.ts`. Codex no tiene ese fallback (está apagado en este hito).
    Con la decisión del director (solo `Config/DefaultEngine.ini` queda fuera; los `.uasset` de la raqueta vuelven al
    índice) el `merge --ff-only` volvería a chocar con la copia sin seguir que `asset migrate` dejó en el checkout. Ahora
    `advanceBranch` compara cada archivo sin seguir (`git hash-object`) con el que llega (`git rev-parse <commit>:<ruta>`):
    si **todos** son idénticos los sustituye y repite el merge; si alguno difiere (la Config con el secreto) no borra
    nada y el rechazo sigue, ya solo con los distintos (`git-merge.test.ts`).
12. **DONE sin leer en un mensaje largo**: el worker terminó la corrección, pero su `KRATOS_DONE` sangrado quedó al pie de un
    mensaje tan largo que la viñeta `⏺` ya había salido del frame leído; el lector de pantalla exigía verla y el run siguió en
    curso (246 sondeos sin novedad). Ahora, si todo lo que hay encima en el frame es continuación sangrada, el marcador
    cuenta como parte del mensaje; la salida de herramienta (`⎿`/`└`) sigue fuera. Prueba con el frame real. Como el sondeo
    solo vuelve a leer un frame si cambió su huella, tras reiniciar el servicio se borró a mano `screenFingerprint` de esa run.
    Comprobado además que ningún commit del worker contiene el SecurityToken: su `DefaultEngine.ini` solo traía el GameMode
    y el último commit lo retira, así que la integración no toca el archivo del usuario.
13. **Tarea parada tras el QA visual** (`revisando` sin paso en marcha): tras la corrección, el QA visual aprobó y la tarea
    quedó 17 min en `revisando` con la bandeja vacía. El QA solo llama a `advance()`, que actúa en `probando`; la revisión de
    código la pedía el director (`kratos task review`, paso 5 de la skill), y en el primer ciclo la pedí yo a mano. Sin director
    atento, nada la movía. Ahora: (a) al aprobarse el QA con la revisión de código pendiente, el servicio encola `review.start`
    con clave `review.after-qa:<run QA>` (la de la run, `review.start:<tarea>:<run>`, ya existe desde el primer ciclo y
    `enqueue` la devolvería sin encolar nada); (b) `stalledTasks()`: revisando/probando/integrando/cerrando sin Decisión,
    bloqueo, espera, run viva ni comando pendiente durante 10 min. `kratos doctor` lo lista en «Tareas atascadas» y el
    runner abre una Decisión «Tarea parada en …» (Retomar con el paso del estado o Cancelar). Pruebas en
    `ui-cycle.test.ts` y `stall.test.ts`. Desatasco del recorrido: `kratos task review` a mano a las 00:45.
14. **La línea base visual guardaba el fallo**: en el primer ciclo la raqueta no se cocinaba en el build (ruta blanda sin
    `DirectoriesToAlwaysCook`), así que la línea base `docs/baseline/build-1280x720.png` nació sin raqueta. Con la
    corrección del revisor la raqueta aparece y la regresión visual falló con un 2,03 % (tolerancia 2 %) que es
    justo la raqueta y su sombra. Kratos lo mandó al worker como corrección; el worker lo diagnosticó y preguntó
    (no hay código que arreglar). Como director regeneré la línea base con la captura de ese build (la vieja,
    guardada aparte) y respondí al worker que terminara sin cambios. Además el mensaje decía «difiere un 2 %
    (tolerancia 2 %)»: el porcentaje ahora lleva dos decimales («2,03 %»). Pendiente: una Decisión «Aceptar como
    nueva línea base / Corregir» cuando falla la regresión visual, en vez de mandarla al worker.
15. **El revisor no es determinista y la spec contradecía la regla del usuario**: el mismo commit `64fbcb3` se aprobó a
    las 01:14 y se rechazó a las 01:22, y su único hallazgo medio pedía el GameMode en `Config/DefaultEngine.ini`
    porque **la propia spec de la tarea lo decía**. Con la tercera corrección agotada Kratos abrió «Máximo de tres
    correcciones» (correcto). Como director: «Revisar», spec alineada con la regla (GameMode en un Config versionado,
    nunca en `DefaultEngine.ini`) con `kratos task spec`, tarea devuelta a `revisando` con `moveTask` (el CLI no tiene
    ese paso; la spec nueva la deja en `preparada` con «Requiere reconciliar worker existente») y `kratos task review`.
    Pendiente: un «Volver a revisar» en esa Decisión que haga esos dos pasos, y specs que hereden las reglas del usuario.
16. **El diff de revisión metía el contenido de todo lo sin seguir** (`adapters/git.ts`): además del commit, `diff()`
    añadía cada archivo sin seguir del árbol del worker. Con el empaquetado eso eran los `Build/…/*OpenOrder.log` con
    rutas locales (diff de 1,4 MB) y el `Config/DefaultEngine.ini` local del árbol, que lleva un `SecurityToken`. Las rutas
    con emoji salían escapadas (`\360\237\216\276`). Resultado: una revisión con tres hallazgos «críticos» falsos sobre
    `64fbcb3` (dijo que el ini estaba versionado y que faltaba la raqueta; el árbol del commit dice lo contrario).
    **Comprobado sin imprimir el valor**: el token de ese ini es otro valor de 32 caracteres que Unreal generó en el
    árbol; el `SecurityToken` del usuario no aparece en ningún worktree, parche, `.kratos-hito7` ni `.kratos`. Ahora
    lo generado por Unreal (`Build/`, `Saved/`, `Intermediate/`, `DerivedDataCache/`, `Binaries/`) no entra en el diff
    ni en la huella; de `Config/` sin seguir el revisor ve solo el nombre («sin seguir, contenido fuera de la
    revisión»); git corre con `core.quotepath=false` (`review-infrastructure.test.ts`). Las copias del token generado en
    los `.kratos-review/diff.patch` de B se retiraron con sus árboles al cerrar la tarea.
17. Nota del entorno de pruebas: Git Bash convierte argumentos `/Game/...` en rutas de Windows (`MSYS_NO_PATHCONV=1`); no afecta al servicio.

## Distinto al plan, y por qué

- **Carril largo para todo `checks.run`**, `ui.cycle` y `asset.migrate`: al encolar aún no se sabe qué comprobaciones tocarán
  (se eligen con el diff dentro del handler) y blueprint/asset también abren el editor.
- **Recuperación por latido con dueño vivo**: un comando de un proceso que ya no existe se recupera al arrancar; si el dueño
  sigue vivo, solo tras 60 s sin latido (nunca se roba trabajo de otro runner vivo). Un sondeo se reencola una sola vez.
- **Estados de cancelación**: `command.failed` lleva `kind` para conexión, ejecución y capacidad ausente; la cancelación
  solicitada y la confirmada salen del estado de la orden `worker.stop` (pendiente / hecha), no de un `command.failed`.
- **Orca cerrado**: se detecta con el `not_running` del primer comando (no se gasta un `orca status` por arranque);
  `isRunning()` (`orca status`) se usa en `doctor` y en «Comprobar ahora». «Abrir Orca» ejecuta `orca open`.
- **Unreal en «Comprobar ahora»**: versión desde `Engine/Build/Build.version` (lo que ya usa el adaptador); `UnrealEditor-Cmd`
  no tiene un `-version` que salga sin cargar el motor.
- **Recorrido del ejecutable con `-ExecCmds`** (no `kratos_walkthrough.py`: Python no existe en un juego empaquetado):
  `r.HighResScreenshotDelay 120` (unos 2 s de estabilización), tres acciones configurables y `HighResShot`; Kratos cierra el
  proceso a los 30 s. «Entrada» = arranque con el mapa del recorrido.
- **Regresión visual sin línea base**: la crea y el resultado de esa captura es `skipped` «Línea base creada»; la comprobación
  no se marca entera como omitida (abriría una Decisión de «comprobación no disponible» en cada primer build).
- **Opciones de Decisión**: la descripción no se ve en la tarjeta (tooltip y descripción accesible) para respetar las 20 palabras.
- **Fila de Producción**: motivo de 3 palabras como mucho (presupuesto de 7 de la fila); el completo, en el tooltip y el detalle.
- Pase de motion: la reordenación por View Transitions, el punto del director y el resultado de una prueba ya cambian solo
  al cambiar de estado; se añadió la transición de color del resultado de prueba. No se usaron las skills
  `find-animation-opportunities`/`animate`/`review-animations` (no están instaladas en este equipo); `impeccable harden/polish`
  no se ejecutó como skill: el endurecimiento se hizo con las pruebas de esta auditoría.

## Pendientes

- Prueba de los cinco segundos con una persona nueva (no se sustituye por pruebas automáticas).
- Nivel 2 de Fab con clics (Launcher «Add to project»).
- Gauntlet: documentado, no integrado.
- Insights: la traza se graba bajo demanda; falta el resumen automático.
- Hito 5b (personajes y animación): pausado por decisión del usuario.
- El log JSONL no es transaccional: un evento de una transacción que se deshace queda escrito en el log.
- `asset migrate` copia al checkout del usuario sin versionar. Al integrar, los idénticos ya se sustituyen (hallazgo 11);
  falta que la migración deje esos assets dentro de la tarea en vez de en el checkout.
- Reenvío por terminal nuevo: solo para workers Claude; Codex no lo tiene (está apagado en este hito).
- Regresión visual: falta la Decisión «Aceptar como nueva línea base / Corregir» (hallazgo 14). La línea base vive en
  `docs/baseline/` del checkout del usuario, sin versionar.
- «Máximo de correcciones» → «Revisar»: falta un «Volver a revisar» que deje la tarea en `revisando` sin tocar la base
  (hallazgo 15), y que la spec de una tarea herede las reglas del usuario (Config local fuera de los commits).
- `npm test` bajo carga vuelve a fallar al cierre (ver Puertas): las pruebas con plazos de reloj real (vigilante, espera
  de Orca, CLI) y un error de enlace intermitente en `build-walkthrough.test.ts` sin causa encontrada. En secuencia, verde.
  Cuando la prueba del CLI vence su plazo deja vivo el servicio que arrancó (`kratos-cli-*` en Temp): quedaron cuatro.
- El revisor no es determinista con el mismo commit (aprobó y rechazó `64fbcb3`); no hay segunda opinión automática.
- Quedan copias del `SecurityToken` generado por Unreal en los `.kratos-review/diff.patch` de las revisiones de
  `kratos-2e3d41ae` (tarea de hitos anteriores, sin cerrar). Las de B se fueron al cerrar: el archivo de B, `kratos.db` y
  los logs solo nombran la palabra, sin valor (comprobado).
- INP y frames largos no se volvieron a medir en este hito (cifras del hito 8).
