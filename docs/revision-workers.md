# Revisión independiente de workers

`kratos task review ID` solicita revisión del último implementador terminado de la tarea.
La ruta autenticada `POST /tasks/:id/review` también admite `{ "implementerRunId": "..." }`.
La tarea debe estar en `revisando` o `probando` y el run debe poseer su worktree.

El arranque y el polling comparten la implementación de workers. El revisor usa otro run, árbol, rama y sesión;
`tasks.worktreeId` sigue apuntando al implementador. No adquiere reservas de escritura de implementación.
El brief adjunta `.kratos-review/diff.patch`, con el diff del implementador desde su base.

El marcador `KRATOS_REVIEW` exige `approved` booleano y `findings` con archivo, línea positiva, severidad y nota.
Un marcador inválido genera `worker.waiting` con la línea recibida; se conserva el buffer de fragmentos.
Los ejemplos dentro de fences no cierran revisiones. `KRATOS_DONE` no termina un revisor.
`worker.send` puede responder a su ASK manteniendo el rol y `revisando`; un revisor terminado no se reactiva.

`review.finished` y el artefacto JSON `report` guardan findings y procedencia: run implementador, generación,
commit y hash del diff. Las rutas de informe son relativas a `.kratos/artifacts`.
La generación incorpora instrucciones aceptadas, ciclo del implementador, spec/aceptación/alcance, HEAD y hash del diff.
Una spec nueva o instrucciones nuevas invalidan la aprobación. Una respuesta atrasada queda como `stale`.

Aprobación vigente: `reviewApproved=1`, y `probando` únicamente si existe un criterio con prefijo `check:`.
Rechazo vigente: termina el revisor, libera recursos y encola `worker.send` al mismo implementador;
la tarea vuelve a `implementando`. El envío aplica las políticas, el límite de tres correcciones y las reservas vigentes.

La clave `review.start:<taskId>:<implementerRunId>` se conserva entre correcciones del mismo run.
Repetir una generación devuelve el comando existente; una generación nueva terminada permite rearmarlo,
sin otro revisor activo y con eventos durables de la generación anterior. Las decisiones requieren continuación explícita.
Un cambio directo de contenido o HEAD permite otra revisión y borra la aprobación anterior al solicitarla.
Si cambia el proveedor elegible por configuración, la intención actualiza su proveedor conservando su turno FIFO.
`review.start` se recupera como mutación incierta; `review.poll` como lectura recuperable.
Un fallo del revisor no termina ni libera las reservas del implementador.

En esta etapa el lifecycle ejecutable usa configuración con solo Codex habilitado, por ejemplo
`{"concurrency":{"codex":2,"claude":0,"opencode":0}}` en `.kratos/config.json`.
Con Codex y Claude habilitados, el revisor opuesto queda pendiente hasta habilitar el launcher Claude.
OpenCode se reconoce y persiste como proveedor válido; aún no dispone de adaptador.
