# Por aprobar: el usuario aprueba lo que se ve y se juega

La revisión de IA no basta para cerrar lo visual: los defectos de sensación de juego de J1 la pasaron. Tras la
revisión aprobada, las tareas de `approval.areas` (por defecto `gameplay`, `arte`, `ui`, `animacion`; área o rol)
y los cierres de hito (título con «Cierre de hito») quedan en «Por aprobar» del panel, retenidas con «En espera:
Esperando tu aprobación». `Aprobación: usuario` o `Aprobación: no` en la spec manda sobre el área.

## Qué haces tú

- No pidas `task integrate` de una tarea con aprobación pendiente: el servicio la rechaza (`approval_pending`).
- Si una tarea visual no entró sola, pide la aprobación: `nomos approval request <taskId>`.
- Nunca des por cerrada una tarea visual sin `approval.approved`. «Listo» se dice después.
- Antes de pedirla, deja la evidencia: vídeo y capturas (las comprobaciones `map`, `animation`, `build` las generan).
- Pide al worker «En qué fijarte» en su NOMOS_DONE: `"focus":["Mira el retroceso al tercer golpe","Escucha el impacto"]`
  (de 2 a 4 puntos). Si faltan, salen del `focus` del revisor o de los criterios de aceptación.

## Eventos (el vigilante los entrega siempre)

| Evento | Qué hacer |
|---|---|
| `approval.requested` | Avisa al usuario por reply: qué hay por aprobar y en qué fijarse. |
| `approval.approved` | El servicio ya pidió la integración si la tarea podía; si faltaban pruebas, pídela al acabar. |
| `approval.changes_requested` | El texto literal del usuario ya fue al mismo worker y la tarea volvió a implementando; no lo reescribas. |
| `approval.commented` | Llega también como `message.received`: respóndelo como cualquier mensaje. No bloquea. |

## Órdenes

```
nomos approval list
nomos approval request <taskId>
nomos approval approve <approvalId>
nomos approval reject <approvalId>                # solo líneas base (tipo baseline)
nomos approval changes <approvalId> --text "…"   # o --file
nomos approval comment [<approvalId>] --text "…"
```

Aprobar o pedir cambios es del usuario: usa estas órdenes solo cuando él lo diga en el chat con esas palabras.
`nomos status` cuenta las pendientes en `approvals`. Cada elemento lleva `type`: `task`, `conflict` o `baseline`
(línea base visual propuesta: no retiene la tarea; aprobarla la convierte en la referencia de la comprobación).

## Sin persona delante

Con el director por evento (o `decisiones.autonomo`), un «Por aprobar» que pasa de `approval.autoMinutos` (15) se aprueba
solo y sigue a integración (evento `approval.auto_approved`). Las líneas base y los conflictos de binarios siguen siendo
de una persona. Si quieres revisar antes de que entre en `main`, sube el plazo o pon el director en sesión.
