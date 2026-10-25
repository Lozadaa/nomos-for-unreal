# Planificador de arranques

El runner comprueba tareas preparadas cada cinco segundos, sin solapar entregas. El plan consulta dependencias, reservas y cupos sin escribir; el tick persiste la explicación de espera solo si cambia y encola `worker.start:<taskId>:<attempt>`. Un POST manual con esa clave conserva el payload original.

Configurar en el `dataDir` real, normalmente `.nomos/config.json`:

```json
{"defaultProvider":"claude","concurrency":{"codex":0,"claude":2,"opencode":0}}
```

Si falta `concurrency`, se usan esos valores (desde el hito 7 **Codex queda apagado por defecto**; para usarlo hay que darle cupo, por ejemplo `"codex":2`); si falta `defaultProvider`, es `claude`. Con `"codex":0` nunca se lanza Codex. Si existe un objeto explícito, los proveedores omitidos quedan deshabilitados. Los valores deben ser enteros no negativos. OpenCode (hito 12) es el proveedor barato: entra como candidato **solo** si la tarea lo pide (`assigneeProvider: "opencode"`) y `concurrency.opencode` ≥ 1; nunca por defecto (ni con `defaultProvider: "opencode"`), nunca para los roles `arte`, `ui` o `qa` («OpenCode no hace arte, UI ni QA: asígnala a Claude») y nunca como revisor. Sin cupo espera con «OpenCode apagado: dale cupo en config.json». El revisor de una implementación de OpenCode es siempre Claude; sin hueco o sin cupo de Claude la revisión espera («El revisor de OpenCode es Claude: …»), aunque quede cupo de Codex u OpenCode. Su modelo es `opencodeModel` (`opencode/beam-free` por defecto; solo `opencode/…` u `opencode-go/…`). Qué tareas darle y qué modelos: `skills/nomos/references/opencode.md`. La lectura compartida conserva otros campos; corregir JSON inválido permite que el siguiente tick vuelva a planificar.

Prioridad (hito 13): campo `priority` de la tarea, entero (también negativo), 0 por defecto. El plan recorre las preparadas de mayor a menor prioridad y, a igual prioridad, por fecha de creación; así los huecos de cupo y las reservas van primero a lo urgente. Se fija con `POST /tasks` (`priority`) o `nomos task create --priority N`, y se cambia con `POST /tasks/:id/priority` `{"priority":N}` o `nomos task priority TAREA N`. Cambiarla no invalida Decisiones abiertas. El panel la marca con un glifo (flechas arriba/abajo) solo si no es 0.

Crear la tarea con `POST /tasks` permite asignar `assigneeRole` y `assigneeProvider` antes de prepararla. Los roles `arte`, `ui` y `qa` prefieren siempre Claude; los demás prefieren `defaultProvider` (Claude por defecto) y usan el otro proveedor solo si el preferido no tiene hueco. Un proveedor asignado explícitamente debe tener cupo. La elección pura de revisor exige el proveedor opuesto cuando ambos están habilitados; con uno habilitado señala `sameProvider`.

Antes de enviar `/tasks/:id/spec`, declarar dependencias autenticadas:

```http
POST /tasks/:id/depends
Authorization: Bearer <token>
Content-Type: application/json

{"dependsOn":["id-de-la-tarea-base"]}
```

Solo se modifica una tarea pendiente; se rechazan ciclos e identificadores desconocidos. Una dependencia permite despachar cuando está en `done` o en `revisando` con `reviewApproved: 1`, sin bloqueo. Cambiar dependencias invalida autorizaciones previas del contexto; actualizar `task.waiting` solo cambia la explicación y conserva la decisión.

Runs activos e intenciones pendientes ocupan cupos y reservas virtuales sin contar dos veces el mismo intento. **Workers vivos, no runs abiertas (hito 17).** También ocupa hueco una run terminada (`done`, `failed`, `cancelled`) de Claude o Codex cuyo worker sigue trabajando: su terminal de Orca está vivo y no en reposo (`terminalAlive` del barrido del hito 13 y `terminalIsIdle`, la espera `tui-idle`), o tiene un `worker.send` encolado sin entregar. Antes de cada pasada del planificador el runner lo comprueba (`refreshBusyTerminals`) y lo guarda en `metadata.terminalBusy`; un terminal compartido (continuación que reutiliza el del responsable) cuenta una vez, y un terminal cerrado deja de contar. Mientras el cupo esté lleno por uno de ellos, la tarea espera con «Cupo lleno: J1.10 corrigiendo» y `GET /status` (`nomos status`) lleva `capacity: "cupo lleno: J1.10 corrigiendo"` (`null` si no). Si Orca no responde se conserva lo último que se supo. El handler revalida dependencias y capacidad tras sus comprobaciones asíncronas; adquirir reservas sigue siendo atómico. Una condición recuperable anterior a efectos devuelve `{deferred:true,reason}`: el runner conserva el comando pendiente, espera cinco segundos y no consume intentos. Emite `command.deferred`.

La revalidación se repite justo antes de crear el árbol. Si solo existe el run local, queda vinculado a ese commandId, libera reservas y se reutiliza con el mismo intento al recuperar condiciones. Otro comando no puede apropiárselo. Una política nueva o una Decisión externa durante esa preparación completa el comando con policyBlocked: resolver exige después POST explícito para continuar.

Después del árbol, la TUI puede quedar iniciada e idle mientras el despacho del encargo está pausado. Si una dependencia cambia antes de entregar el brief, una Decisión conserva el mismo run/árbol en preparación; no se devuelve deferred ni se recrean recursos. Resolver y enviar explícitamente al mismo run permite continuar solo si las dependencias vigentes lo permiten. TUI lista no acredita ejecución de la tarea antes del brief.

Solo un fallo limpio `lease_conflict`, sin árbol ni incertidumbre, admite avanzar automáticamente al siguiente intento. Un arranque `policyBlocked` completado sigue requiriendo POST explícito al resolver su decisión. Un árbol detenido requiere reconciliación.

## Orca que no responde con runs en marcha (hito 16)

Si Orca deja de responder (cerrado, o su CLI dice «Start the Orca app first» mientras la app se actualiza) cuando una run ya está en marcha, `worker.poll`, `review.poll` y `worker.send` no la marcan `failed`: el comando se difiere cada 30 s sin gastar intentos, la run queda en marcha con `metadata.orcaUnreachableSince` y la tarjeta dice «Orca no responde desde hace N min». Cuando Orca vuelve se quita la marca y el seguimiento sigue igual. Solo si pasan `orca.graceMinutes` minutos (10 por defecto, de 0 a 1440) sin respuesta la run pasa a `failed` con `metadata.uncertain=true`, como antes, y hay que reconciliarla:

```json
{"orca":{"graceMinutes":10}}
```

Arrancar un worker con Orca así sigue el camino de Orca cerrado (diferido cada 30 s; Decisión «Abrir Orca / Cancelar» a los 30 min).

## Reconciliar (hito 13)

`worker.stop` (`nomos worker stop RUN`) y `task.reconcile` (`nomos task reconcile TAREA`, `POST /tasks/:id/reconcile`, 202 con `commandId`; solo en `pendiente`, `preparada` o `implementando`) comparten el mismo procedimiento sobre las runs de la tarea que no estén ya reconciliadas: cierran el terminal de Orca y comprueban que muera (si sigue vivo, `deferred` cada 30 s; al quinto intento la tarea espera con «No se pudo cerrar el terminal del worker»); con `git status --porcelain` limpio retiran el worktree; con cambios abren la Decisión «Descartar / Commitear al run / Esperar» (Commitear lo hace Nomos en la rama del run). Al terminar: `metadata.uncertain=false`, `metadata.discarded=true`, `tasks.worktree_id=null`, reservas liberadas, tarea en `preparada`, Decisión de reconciliar abierta resuelta por `nomos` y evento `task.reconciled`. Una run reconciliada no cuenta como «Requiere reconciliar worker existente», y el arranque que se paró en esa Decisión deja de exigir arranque explícito: el planificador usa el intento siguiente.

Cuando `worker.start` encuentra un worker anterior completa con `policyBlocked` y abre la Decisión «Reconciliar worker existente antes de continuar» enlazada a un `task.reconcile`: «Reconciliar y reintentar» reconcilia y reencola ese mismo arranque; «Reconciliar y dejar preparada» reconcilia y deja la tarea al planificador; «Cancelar la tarea» reconcilia y la bloquea («Tarea cancelada por el director»). Si la rama `nomos/<id>` del worker anterior sigue en el repositorio, la nueva se llama `nomos/<id>-<run>`.

Codex y Claude ejecutan implementación o revisión independiente; OpenCode solo implementación (hito 12, `docs/workers-proveedores.md`). La selección, los permisos Claude y la revisión cruzada se verifican con fake Orca y Git real; la aceptación con proveedores reales corresponde a T6.

## Jugar (hito 14)

`GET /play` resuelve la build más reciente bajo el proyecto o sus artefactos (nunca una ruta del cliente); `POST /play` la lanza desprendida y `POST /play/stop` la cierra (`play.started`, `play.stopped`; `nomos play [--stop|--status]`).
Al cerrar cada tarea que toque `Source/`, `Content/` o `Config/`, el director deja `Build/Windows-actual/<Proyecto>.exe` al día y no dice «listo para probar» sin una build posterior a la integración.

## Revisión tras una corrección (hito 18)

Si corriges después de NOMOS_DONE, repite la marca; si no, Nomos pide la revisión al ver tus commits. Al dar NOMOS_DONE la run guarda `metadata.doneCommit` (HEAD de su árbol). El barrido de atascos (cada pasada del planificador, tarea quieta 10 min sin run viva ni comando) compara ese commit con el HEAD actual: si hay commits nuevos que ninguna revisión ha visto y el terminal del worker está quieto (vivo y en reposo, o cerrado; la misma cuenta del hito 17), encola `review.start` sobre el último commit y emite `review.auto_requested {taskId, commit, reason:"commits tras DONE"}` (también queda en el diario `logs/<día>.jsonl`). Con el terminal ocupado espera, sin Decisión. Sin commits nuevos, la Decisión dice el paso exacto: «Pedir la revisión del commit X» (opción recomendada `pedir_revision`: Nomos la pide y emite `review.auto_requested` con `reason:"decisión"`) o, en `implementando` sin marca, «El worker no dio NOMOS_DONE: leer su terminal» (`leer_terminal`: Nomos lee la pantalla y la deja como `worker.output`). Cada opción elegida se ejecuta una vez (`stall.step_done`).

Tras una corrección (`worker send` a una run terminada) la run guarda `metadata.correctionHead` (HEAD al enviarla). Un NOMOS_DONE con `commits` declarados cuenta solo si HEAD avanzó desde entonces; si no, es el viejo (o uno repetido antes de empezar): `worker.done_ignored {reason:"sin commit tras la corrección"}` y la run sigue viva. Con `commits: []` («sin cambios») sí cuenta. `worker.waiting` por reposo exige 30 s sin salida (6 sondeos), Orca en reposo y una pregunta o un prompt vacío en la última línea; un permiso de Claude cuenta solo en las últimas líneas y con forma de pregunta; la misma espera (pregunta y última línea) no se repite hasta la siguiente orden.
