# Contrato de eventos y dirección (hitos 0–2)

HTTP en `127.0.0.1:8780` por defecto. SQLite y `service.json` viven en `.nomos/`
de la carpeta del juego, excluida de Git. Token de 48 caracteres hexadecimales
por arranque; la URL inicial lo entrega por hash, la web lo guarda en sessionStorage
y limpia el hash. Sin token válido: `401 {"error":"unauthorized"}`.

## Rutas

| Método | Ruta | Cuerpo | Respuesta | Token |
|---|---|---|---|---|
| GET | `/` | — | 200 HTML | No |
| GET | `/health` | — | 200 `{ok:true}` | No |
| GET | `/web/*` | — | 200 estático / 404 | No |
| POST | `/messages` | `{text}` | 201 `{messageId,seq}` | Bearer |
| GET | `/messages/:id` | — | 200 MessageRow / 404 | Bearer |
| POST | `/events/:seq/ack` | `{session}` | 200 Status / 404 si no es mensaje | Bearer |
| POST | `/messages/:id/reply` | `{text}` | 201 `{seq}` / 404 | Bearer |
| POST | `/director/heartbeat` | `{session,started?:true}` | 204 | Bearer |
| GET | `/status` | — | 200 Status | Bearer |
| GET | `/events?since=N` | — | SSE desde `seq>N` | Bearer o `?token=` |
| POST | `/admin/stop` | — | 202 `{ok:true}` y cierre | Bearer |

JSON usa UTF-8; máximo 64 KiB por cuerpo (413 al superarlo). Texto vacío/espacios
produce 400 `empty_text`; JSON inválido produce 400 `invalid_json`.
No hay CORS para orígenes ajenos. CSP impide scripts externos. No se usan frameworks.

`MessageRow`: `{id,text,origin,createdAt,ackedAt,replyText,repliedAt}`.
`Status`: `{service:true,listener,listenerAgeSec,director,lastAckSeq,lastAckAt,pending,paused}`.
`EventRow`: `{seq,id,type,messageId,payload,createdAt}`. Fechas ISO 8601.

## Eventos

| Tipo | Payload | Productor |
|---|---|---|
| `message.received` | `{text,origin}` | POST mensaje, origin `web` |
| `message.read` | `{seq,session}` | POST ack (antes `message.acked`); repetir no duplica el evento |
| `director.typing` | `{messageId,since}` | `nomos typing ID` / POST `/messages/:id/typing`: el director empieza a redactar |
| `director.typing_timeout` | `{messageId}` | leído y sin respuesta en 3 min; el panel dice «sigue trabajando» |
| `message.replied` | `{messageId,text}` | POST reply (antes `reply.published`); puede haber varias: acuse corto y cierre |
| `director.started` | `{session}` | Vigilante: heartbeat con started true |
| `director.stopped` | `{session}` | POST admin/stop; sesión null si nunca hubo director |
| `run.finished` | `{taskId,runId,state,summary}` | Fin de vuelta del run; no cierra tarea |
| `worker.waiting` | `{taskId,runId,question,lastLines}` | Pregunta, permiso al final de la salida o terminal quieto 30 s con pregunta/prompt al final; una vez por espera |
| `worker.relayed` | `{taskId,oldRun,newRun}` | Hito 19: relevo 15 min antes del límite de Orca; la run nueva sigue en el mismo worktree, la tarea no cambia |
| `worker.done_ignored` | `{taskId,runId,provider,reason}` | Hito 18: NOMOS_DONE con commits declarados tras una corrección sin commit nuevo; la run sigue viva |
| `review.auto_requested` | `{taskId,commit,reason,decisionId?}` | Hito 18: Nomos pidió la revisión (`commits tras DONE` o la opción de una Decisión) |
| `worker.skills_missing` | `{taskId,runId,provider,required,confirmed,missing}` | NOMOS_SKILLS válido con diferencia; no bloquea |
| `command.failed` | `{commandId,...command}` | Error terminal; payload de command conserva taskId/runId |

SSE: `id: <seq>`, `event: <type>`, `data: <JSON EventRow>` y línea vacía.
El cursor efectivo usa el mayor entre `since` y `Last-Event-ID`.
La web ignora secuencias ya vistas y reúne los eventos por messageId.

## Franja del director

`nomos vigila` se puede encadenar: escribe cada evento como una línea y la entrega a la tubería
antes de avanzar el cursor. El filtro que pongas detrás debe hacer lo mismo: `cut`, `awk` o `sed`
retienen por bloques al escribir a otra tubería; usa `grep --line-buffered` o `stdbuf -oL cut …`.

El vigilante late cada 2 segundos; `listener` solo es true si el latido tiene menos
de 6 segundos. Un latido no confirma mensajes.

| Regla | Copy exacto |
|---|---|
| Servicio responde, sin listener, pending=0 | Servicio activo · esperando a Nomos |
| listener, pending=0 | Nomos escuchando |
| listener, pending>0 | Nomos atendiendo N mensajes |
| Sin listener, pending>0 | Vigilante caído · N mensajes en espera |
| Red fallida o credenciales caducadas | Servicio desconectado |

Además: `Última confirmación: <hora local>` o `sin confirmaciones`.

## Ciclo y recuperación

1. La web persiste mensaje + evento en una transacción; muestra «Enviado».
2. Monitor recibe JSON `{seq,type:"message.received",messageId,text,origin}` del vigilante.
3. Claude ejecuta ack **en orden ascendente**; el cursor acumulativo avanza sin
   retroceder y SSE cambia el mensaje a «Recibido por Nomos».
4. Claude publica reply con el mismo messageId; SSE muestra la respuesta.
5. Rearmar recupera `message.received` con `seq>lastAckSeq`, aunque ya se haya impreso.
   Los eventos del director usan un cursor de entrega separado, nunca el ACK.

Solo un vigilante reserva la carpeta mediante un lock local SQLite exclusivo,
liberado por el SO al morir el proceso. El servicio reutiliza
su token si sigue vivo y, desde el hito 16, también al reiniciarlo: el token es de la carpeta
de datos (`<dataDir>/token`, 0o600) y reiniciar no invalida los accesos directos ni las pestañas
abiertas, que reconectan solas. Solo `nomos start --new-token` (con el servicio parado) lo
cambia; entonces el vigilante relee las credenciales y la web necesita la URL nueva. Recargar la web reconstruye el
historial desde SQLite sin duplicar tarjetas.

Pendientes significa **sin confirmar**, no «sin respuesta». Una caída entre ack y
reply requiere revisar el mensaje conservado y completar su respuesta. Repetir
un POST mensaje crea otra petición; esta API no promete ejecución exactamente una vez.
`paused` refleja Global Constraints en status. Frenar despachos por este valor sigue
pendiente; en este hito no pausa al runner ni apaga el vigilante y no constituye un ACK.

## Tipos y checkpoint del vigilante

`nomos vigila --session ID [--types a,b] --data .nomos` imprime por defecto
`message.received,run.finished,worker.waiting,command.failed`. Una lista custom
reemplaza los cuatro; se recorta, deduplica y ordena. Vacíos/tipos malformados
fallan antes de conectar. Ejemplo: `--types run.finished,worker.waiting`.
Hito 21: `decision.opened` y `decision.updated` se entregan siempre, los nombre o no
la lista (una Decisión nunca se pierde por olvidar un tipo).

Mensajes conservan seq/messageId/text/origin y añaden type. Otros eventos:
`{seq,type,payload,createdAt}`. `worker.output` solo aparece si se solicita por types;
para leerlo por run usa `nomos run output RUN --since N`.
ACK sigue exclusivo de message.received; intentar ack de run.finished, waiting o
failed devuelve 404 `unknown_event`. El vigilante no confirma ningún evento.

`.nomos/watcher-cursors.json` guarda `{version:2,cursors:{SESION:SEQ}}`: el último
evento entregado a esa sesión, sea cual sea la lista de tipos (hito 21); rearmar con
otros tipos sigue desde ahí y no repite la historia. Un archivo `version:1` (clave
`[sesion,tipos]`) migra solo al mayor cursor de cada sesión. SEQ es entero seguro no
negativo; no contiene token ni depende de él. Sesión nueva: cursor 0. Se escribe `.tmp`
y se renombra bajo el lock de único vigilante, después del callback stdout.write.
Los eventos omitidos también avanzan entrega. El cursor de transporte en memoria
avanza solo por frames completos y evita repetir líneas durante la misma escucha.

Cada reconexión relee credenciales y status. Al iniciar el proceso parte de
`min(lastAckSeq,deliveryCursor)`; durante la misma escucha, incluso al rotar el token,
solicita desde el mayor
entre ese mínimo y el cursor de transporte ya consumido,
y filtra: mensaje seleccionado con seq>lastAckSeq; director seleccionado con
seq>deliveryCursor. El transporte vivo descarta lo ya leído por ese proceso.
Así run.finished10 pendiente se entrega aunque mensaje11 ya tenga ACK; director10
entregado no se repite al rearmar para recuperar mensaje11 sin ACK.

Archivo ausente empieza en cero silenciosamente (primera invocación normal).
Si se borró un archivo anterior, esto también permite replay. Archivo corrupto
avisa `watcher_checkpoint_recovery` por stderr y recupera cero, sin usar ACK para
suprimir eventos del director. Error real de lectura/permisos/guardado detiene con
`watcher_checkpoint_error`, sin etiquetar service_down un fallo de disco.
Hito 16: un plazo vencido (servicio ocupado con un diff largo o Unreal cargando) no es una caída;
el vigilante comprueba el pid de `service.json` y `GET /health` con 5 s y solo si falla imprime
`{"error":"service_down"}`, una vez por caída (vuelve a avisar tras recuperarse y caer otra vez).
Hito 18: reintenta `/health` 3 veces en 15 s; caída solo con el pid muerto o el puerto cerrado. Vivo y lento:
`{"warn":"service_slow","ms":N}` como mucho una vez por minuto; no es caída ni pide arrancar otro servicio.
Conserva archivo previo/temporal para diagnosticar, corrige disco/permisos y rearma
la misma sesión/tipos; si recuperas desde cero, espera reentregas e inspecciona estado.

La garantía es entrega recuperable, no procesamiento exactamente una vez:
caída entre impresión y guardado puede repetir; entre guardado y acción requiere
consultar tarea/run/comando actual. No hay inbox de director ni ACK general (hito 7).
No corrijas por run.finished viejo si el run ya reanudó o tiene Decisión pendiente.

## Recursos de dirección

CLI real: `task create|spec|show`, `worker start|send|stop`, `run diff|output`,
`decision open|list|resolve`; ejemplos y decisiones en ciclo-tarea.md, enlazado desde SKILL.md.
HTTP autenticado: `GET /tasks/:id`, `GET /runs/:id`, `GET /runs/:id/output?since=N`,
`GET /runs/:id/diff`, `GET /commands` (filtrar id en cliente), `POST /decisions`.
No hay ruta `GET /commands/:id` ni subcomando CLI `run show`.
El panel nuevo y la aceptación real con Codex/Claude pertenecen a entregas separadas.

`GET /capabilities` autenticado conserva `Capability[]`. `GET /capabilities?details=1`
devuelve `{capabilities,skills,concurrency}`: inventario local de `dirname(dataDir)` y cupos
del scheduler. Contrato completo: `docs/skills-workspace.md` del repositorio Nomos.
`run.skills` enumera lo solicitado; `metadata.confirmedSkills` solo existe tras un marcador
válido. Ausente significa desconocido; `[]` significa ninguna declarada por el worker.

## Chat en vivo

El usuario ve en el panel el estado real de su mensaje, con hora: Recibido → Leído por Nomos (ack) →
Nomos está escribiendo… (`nomos typing <messageId>`) → la respuesta. Si a los 60 s no hay ack, el panel
lo dice en ámbar («no ha leído tu mensaje todavía»); si tras el ack pasan 3 min sin `reply`, el servicio
emite `director.typing_timeout` y el panel muestra «sigue trabajando en tu mensaje».

Responde en dos tiempos: un acuse corto en < 1 min («Entendido: creo 3 tareas…»), trabaja, y cierra con
lo creado («Listo: J1.6, J1.7 y J1.8 creadas»). Cada `reply` es una burbuja; el texto admite Markdown
(negrita, cursiva, listas, tablas simples, código en línea y enlaces `/tareas/<id>`, que se muestran
con el título). Pasa `--message <messageId>` a `task create`, `decision open` y `worker send`; sin él,
el servicio enlaza al último mensaje leído en los últimos 15 min. `GET /messages` devuelve
`{id,text,createdAt,state,readAt,typingAt,repliedAt,timedOut,replies,links}` y el vigilante entrega los
`message.*` antes que el resto de cada lote.

## Panel por proyecto

Cada juego arranca su propio servicio (`nomos start --data .nomos` en la carpeta del juego) con puerto y token
propios. Al arrancar se apunta en `%LOCALAPPDATA%\nomos\projects.json` (nombre del `.uproject`, carpeta, puerto,
pid; nunca el token) y al parar se borra; una entrada cuyo pid ya no existe caduca en el siguiente arranque.
`GET /projects` (con token) devuelve los proyectos con tareas vivas, Decisiones abiertas y si hay captura;
`GET /projects/<puerto>/capture` sirve la última captura de cada uno.

El panel abre la portada `/proyectos` la primera vez de la sesión si hay más de un proyecto, y la cabecera lleva
el nombre del `.uproject` con un selector. Abrir otro juego es ir a `http://127.0.0.1:<puerto>/`: ese panel pide su
token a su propio servicio (`GET /session`, solo para su mismo origen: Host `127.0.0.1:<puerto>` y nada de webs
ajenas). Para dar al usuario el panel correcto, pásale la URL que imprime `nomos start` en la carpeta de su juego,
o dile que abra cualquiera y elija el juego en la portada.
