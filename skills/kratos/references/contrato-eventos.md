# Contrato del hito 0

HTTP en `127.0.0.1:8780` por defecto. SQLite y `service.json` viven en `.kratos/`
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
| POST | `/events/:seq/ack` | `{session}` | 200 Status / 404 | Bearer |
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
| `message.acked` | `{seq,session}` | POST ack; repetir no duplica el evento |
| `reply.published` | `{messageId,text}` | POST reply |
| `director.started` | `{session}` | Vigilante: heartbeat con started true |
| `director.stopped` | `{session}` | POST admin/stop; sesión null si nunca hubo director |

SSE: `id: <seq>`, `event: <type>`, `data: <JSON EventRow>` y línea vacía.
El cursor efectivo usa el mayor entre `since` y `Last-Event-ID`.
La web ignora secuencias ya vistas y reúne los eventos por messageId.

## Franja del director

El vigilante late cada 2 segundos; `listener` solo es true si el latido tiene menos
de 6 segundos. Un latido no confirma mensajes.

| Regla | Copy exacto |
|---|---|
| Servicio responde, sin listener, pending=0 | Servicio activo · esperando a Kratos |
| listener, pending=0 | Kratos escuchando |
| listener, pending>0 | Kratos atendiendo N mensajes |
| Sin listener, pending>0 | Vigilante caído · N mensajes en espera |
| Red fallida o credenciales caducadas | Servicio desconectado |

Además: `Última confirmación: <hora local>` o `sin confirmaciones`.

## Ciclo y recuperación

1. La web persiste mensaje + evento en una transacción; muestra «Enviado».
2. Monitor recibe JSON `{seq,messageId,text,origin}` del vigilante.
3. Claude ejecuta ack **en orden ascendente**; el cursor acumulativo avanza sin
   retroceder y SSE cambia el mensaje a «Recibido por Kratos».
4. Claude publica reply con el mismo messageId; SSE muestra la respuesta.
5. Rearmar otro vigilante recupera `message.received` con `seq>lastAckSeq`.

Solo un vigilante reserva la carpeta mediante un lock local. El servicio reutiliza
su token si sigue vivo; después de reiniciarlo lo rota. El vigilante relee las
credenciales; la web necesita abrir la URL nueva. Recargar la web reconstruye el
historial desde SQLite sin duplicar tarjetas.

Pendientes significa **sin confirmar**, no «sin respuesta». Una caída entre ack y
reply requiere revisar el mensaje conservado y completar su respuesta. Repetir
un POST mensaje crea otra petición; esta API no promete ejecución exactamente una vez.
`paused` se reserva para el hito 2; en el hito 0 no hay workers ni despachos.
