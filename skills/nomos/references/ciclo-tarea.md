# Ciclo de dirección del hito 2

`nomos` abrevia `node "<base>/scripts/nomos.ts"`. Ejecuta desde el juego (`--data .nomos` por defecto).
La sesión directora decide y revisa; los workers implementan o revisan en sesiones independientes.

## Petición → especificación → worker

El planificador despacha tareas preparadas cada cinco segundos. `task create` con
`--leases A,B`, `--depends BASE`, `--role` y `--provider` declara reservas,
dependencias y asignación mientras la tarea sigue pendiente y solo después aplica
`--spec-file`; valida las dependencias antes de crear. Por HTTP el orden equivale a
`POST /tasks` (con `leases`, `assigneeRole`, `assigneeProvider`), después
`POST /tasks/TASK/depends` con `{ "dependsOn": ["BASE"] }` y por último `/spec`. Consulta `docs/planificador.md` del repositorio
Nomos para cupos, reservas y esperas. No aumentes attempt para eludir bloqueos.
El cupo cuenta workers vivos (hito 17): una run terminada cuyo terminal sigue trabajando, o con una corrección encolada, ocupa hueco hasta que su terminal vuelve al reposo o se cierra; `nomos status` lo dice en `capacity` («cupo lleno: J1.10 corrigiendo»). No cierres ese terminal para liberar hueco: espera su marca de fin.
Los proveedores reconocidos son `codex`, `claude` y `opencode`. OpenCode solo corre si
la tarea lo pide (`--provider opencode`) y tiene cupo; tareas sencillas sin Unreal, revisor
siempre Claude y modelo barato (reglas en la referencia OpenCode de la skill).
CLI y HTTP aceptan los tres proveedores y conservan la clave por tarea e intento.
Claude usa `claude --model <modelo del rol> --dangerously-skip-permissions` (`models` en la config: opus implementa,
sonnet revisa, QA e integra; el run lo guarda en `metadata.model`); el servicio espera
su marcador de readiness antes de entregarle el brief. Sus permisos «Do you want to»,
«Allow» o «(y/n)» generan `worker.waiting` con la línea original: el director evalúa
la pregunta y el alcance antes de responder. El servicio no responde automáticamente.
El brief de workers y revisores enumera skills explícitas y requeridas por rol y pide
`NOMOS_SKILLS […]` con las realmente cargadas. `metadata.confirmedSkills` conserva la
declaración; `worker.skills_missing` informa diferencias sin bloquear DONE/REVIEW.
Sin marcador la confirmación es desconocida; `[]` declara ninguna. Inventario del juego
y concurrencia: `GET /capabilities?details=1` autenticado; la ruta sin query sigue siendo un array.

Recibe y confirma `message.received`, clasifica el mensaje y consulta el registro
local de su ID antes de crear nada. Si ya existe taskId, inspecciónalo y continúa.
Elige un ID local para el archivo; el servicio asignará el taskId definitivo.
Ejemplo completo en `.nomos/specs/documentacion.md`:

```md
# Documentar el juego
## Qué
Quien abre el juego encuentra un README y un script que le dice la versión del motor.
## Por qué
Permitir que otra persona identifique el proyecto y su versión antes de probarlo.
## Criterios de aceptación
1. El README describe el proyecto sin inventar mecánicas.
2. El script imprime la versión del motor que figura en el proyecto.
3. El script termina sin errores desde la raíz del juego.
## Alcance
- Docs/README-nomos.md
- Scripts/hello.ps1
## No tocar
- Content/
- Config/
- Source/
```

Exactamente esos cinco encabezados una vez cada uno. Qué/Por qué tienen texto;
criterios numerados (≤ 7, empiezan por lo observable) y alcance con guiones. `## Qué` ≤ 2 frases
de lo que se verá; rutas y clases solo en Alcance y No tocar. Rutas relativas literales, sin `..`,
absolutos ni glob; usa prefijos de directorio cuando corresponda. Los fences no
aportan criterios/rutas. El parser valida el archivo antes de crear una tarea.
No tocar se conserva en el Markdown/brief. Contrato ampliado: `docs/task-spec.md`
del repositorio Nomos, no del juego. Si falta una decisión creativa, pregunta al usuario.

```sh
nomos task create --title 'Documentar el juego' --area qa --spec-file .nomos/specs/documentacion.md
nomos worker start TASK --role implementacion
```

Entre ambos comandos, guarda `{taskId,messageId,specFile}` en
`.nomos/specs/documentacion.json` y publica ID + resumen de dos líneas con
`nomos reply MESSAGE -- '<texto de dos líneas>'`. La tarea ya queda `preparada`.
`task spec TASK --spec-file ARCHIVO` prepara una tarea existente sin run activo.
Entrega contexto/skills mediante la plantilla brief-worker.md enlazada desde SKILL.md.

Conserva commandId. Sin `--attempt`, `worker start` usa el intento vivo (repetir recupera el mismo
comando) o, si el último ya terminó, el siguiente; nunca devuelve el arranque de un intento cerrado.
No incrementes attempt para eludir un fallo de efecto incierto. Si la creación se
interrumpió antes de guardar su ID, consulta `GET /tasks` y evidencia de eventos:
`task create` no tiene clave de idempotencia; repetirlo puede crear otra tarea.
Prioridad: `--priority N` al crear o `nomos task priority TAREA N` después (entero, 0 por
defecto, mayor arranca antes; a igual prioridad, la más antigua). Úsala para lo urgente en
vez de pausar el planificador y arrancar a mano.

## Estado actual antes de eventos reentregados

`task show TASK` devuelve tarea, runs, eventos y Decisión; `GET /runs/RUN` da run, worktree y latestStatus
(Bearer de `.nomos/service.json`; nunca muestres ni guardes el token). `GET /commands` por id aporta
estado/payload/error; no hay `run show` ni `command show` en la CLI. No inventes comandos.

Antes de actuar sobre un replay, compara el runId, phase, pollGeneration,
correctionCount y eventos posteriores con el registro local de última revisión.
Solo revisa entrega si run.state=done y la tarea está revisando; failed/cancelled
requieren diagnóstico de la causa. Un viejo `run.finished` no permite corregir si el mismo run volvió a running,
si hay un run posterior o una Decisión abierta. Tampoco cierres una tarea por un
evento atrasado. Si el estado actual discrepa, inspecciona; no reenvíes ciegamente.

`pendiente → preparada → implementando → revisando`; una corrección vuelve a
`implementando` en el mismo run/worktree. `bloqueada` se expresa mediante
blockedReason; `esperando_worker` es latestStatus/metadata, no un estado Task nuevo.
`run.done` señala fin de una vuelta del worker; la tarea permanece `revisando`.

## Revisar y corregir

1. `nomos run diff RUN` muestra stat, patch y commits desde la base guardada,
   incluyendo cambios pendientes. Binarios figuran en stat; no se inventa su contenido.
2. Revisa cada criterio y las rutas cambiadas contra scope/No tocar. Lee las pruebas
   y ejecuta lo que corresponda; no conviertas «tests: passed» del worker en evidencia propia.
3. Si cumple, publica por reply el resultado y los límites de verificación; deja `revisando`. No marques done
   ni hagas merge/push. Lo visual o jugable lo aprueba el usuario en «Por aprobar» (referencia de aprobación, enlazada desde SKILL.md).
4. Si no cumple, crea `.nomos/correcciones/RUN/1.md` (luego 2.md y 3.md).
   Tres líneas, sin más:
   ```md
   **Qué se ve mal:** el script imprime 5.4 aunque el proyecto dice 5.7.
   **Qué debería verse:** la versión que figura en el .uproject.
   **Dónde:** Scripts/hello.ps1
   ```
   Envía `nomos worker send RUN --file .nomos/correcciones/RUN/1.md --idempotency-key correccion-RUN-1`.
   Guarda la clave, commandId y contador. Ante respuesta incierta, consulta el comando
   y repite la misma clave si procede; no fabriques otro envío.
5. Después de tres correcciones, si sigue sin cumplir, abre Decisión antes de una
   cuarta. No arranques otro worker ni cambies responsable para eludir el límite.

Orca sin responder con la run en marcha (se actualiza, se reinicia): la run sigue y la tarjeta dice
«Orca no responde desde hace N min»; no la reconcilies ni arranques otro worker. Solo tras
`orca.graceMinutes` (10 por defecto, `config.json`) pasa a failed incierta y entonces sí se reconcilia.

## Pregunta y Decisión

Ante waiting consulta estado y `nomos run output RUN --since 0` la primera vez;
después guarda el mayor seq de worker.output y usa ese cursor. Es distinto del
cursor de Orca y del checkpoint del vigilante. Lee metadata.question y la spec.
Si contiene la respuesta, `nomos worker send RUN --text '<respuesta de la spec>'`
con una clave estable de respuesta. Si no, escribe `.nomos/decisiones/pregunta.json`:

```json
{
  "reason": "¿Qué estilo visual debe usar el README?",
  "evidence": [{"kind": "run", "ref": "RUN"}],
  "options": [{"id": "answer", "label": "Responder en el chat", "description": "Escribe la respuesta que recibirá el worker."}]
}
```

`reason` es una frase; cada `label` ≤ 5 palabras; lo que lo justifica va en `evidence`, nunca en la pregunta.

Sustituye RUN por el ID real. `nomos decision open TASK --file .nomos/decisiones/pregunta.json`;
publica la pregunta por reply y espera respuesta explícita. Una selección answer
sin texto no inventa una respuesta. Para un límite de correcciones, ofrece opciones
concretas de replanificación/inspección, sin prometer un cuarto envío automático.

```sh
nomos decision list --state open
nomos decision resolve DECISION --option answer --by nomos
nomos worker send RUN --text 'Respuesta explícita del usuario' --idempotency-key respuesta-DECISION
```

Si resolve rechaza `decision_stale`, relee la tarea y abre una pregunta vigente;
no fuerces la decisión. Resolver no envía instrucciones ni reanuda automáticamente.
Si la Decisión frenó la preparación, comprueba phase=preparing y que no haya efectos
inciertos antes de enviar al MISMO run:

```sh
nomos worker send RUN --text 'Lee el archivo .nomos-brief.md de esta carpeta y ejecuta lo que dice.' --idempotency-key continuar-DECISION
```

Esto conserva sesión/worktree y no consume corrección de preparación. No ejecutes
`worker start` de nuevo cuando ya existe run. Si una política bloqueó antes de crear
run o recursos (presupuesto finito, sistemas críticos o init_git), resuelve y consulta
la tarea/comando. Repite explícitamente `worker start TASK --attempt N` con el mismo
intento original: conserva commandId y autorización, reevalúa políticas y solo reanuda
un bloqueo previo a efectos marcado `policyBlocked:true`. No aumentes attempt para
eludir una Decisión ni repitas efectos inciertos; un worker anterior se reconcilia (abajo).

Marcas largas: el servicio reensambla una marca partida por el terminal (hasta 40 líneas u 8 KB) y
lee antes `.nomos-inbox/done.json`, `review.json` o `ask.json` del worktree si el worker lo dejó.

## Relevo antes del límite de Orca

Orca corta el terminal de un worker a las 4 h (`config.json: orca.maxWorkerMinutes`, 240). 15 min antes Nomos le pide «Commit WIP: relevo por límite de tiempo», espera hasta 5 min, commitea él lo que quede y abre un worker nuevo en el **mismo worktree** con el brief y una nota de continuación (último commit, final de su terminal, «continúa donde lo dejó»).
Sale `worker.relayed {taskId, oldRun, newRun}`; la run vieja queda `cancelled` y la tarea sigue igual, sin Decisión: no hagas nada, sigue la run nueva. No relances a mano.

## Reconciliar un worker anterior

`nomos worker stop RUN` ya reconcilia: cierra su terminal (si sigue vivo, reintenta cada 30 s
hasta cinco veces), comprueba el árbol, retira el worktree y deja la tarea `preparada`.
Una tarea que quedó atascada («Requiere reconciliar worker existente») se desatasca con
`nomos task reconcile TAREA`. Si el árbol tiene cambios sin registrar, Decisión
«Descartar / Commitear al run / Esperar». La Decisión de `worker start` ofrece
«Reconciliar y reintentar», «Reconciliar y dejar preparada» o «Cancelar la tarea».

## Tarea parada

Tras 10 min en implementando…cerrando sin run viva ni comando pendiente (`nomos doctor`: «Tareas atascadas»):
si corriges después de NOMOS_DONE, repite la marca; si no, Nomos pide la revisión al ver tus commits
(`review.auto_requested`, con el terminal quieto). Si no, abre una Decisión con el paso exacto («Pedir la revisión del commit X»,
«El worker no dio NOMOS_DONE: leer su terminal», «Revisión aprobada: falta pedir la integración» tras 30 min): la recomendada
lo ejecuta Nomos. «Tarea parada en …»/«Retomar» = Nomos no ejecuta nada, pide tú el paso. «Cancelar» = déjala y avisa al usuario.
Espera a propósito (un Unreal pesado a la vez): `nomos task hold ID --motivo "…" [--hasta MIN|tipo.evento]`; mientras dure no hay
Decisión de atasco y status/panel dicen «En espera: motivo». `task integrate` la levanta.

## Fallos y continuidad de escucha

`command.failed` lleva commandId/error; GET /commands aporta taskId/runId en payload.
Consulta causa, tarea y run; informa al usuario. Timeout o envío con efecto incierto
requieren reconciliar terminal/worktree antes de repetir; silencio no prueba caída.
No envíes ack para eventos del director ni interpretes service_down como trabajo.

Rearma Monitor cada 30 minutos con la misma sesión mientras existan Run activo, pregunta o Decisión
abierta. Dos expiraciones sin mensajes solo apagan escucha si tampoco hay trabajo activo. Sin Monitor, dilo.
El checkpoint garantiza entrega recuperable, no acción exactamente una vez: lee contrato-eventos.md antes de reanudar.
