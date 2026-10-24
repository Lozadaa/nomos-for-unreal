# Revisión independiente de workers

`nomos task review ID` solicita revisión del último implementador terminado de la tarea.
La ruta autenticada `POST /tasks/:id/review` también admite `{ "implementerRunId": "..." }`.
La tarea debe estar en `revisando` o `probando` y el run debe poseer su worktree.

El arranque y el polling comparten la implementación de workers. El revisor usa otro run, árbol, rama y sesión;
`tasks.worktreeId` sigue apuntando al implementador. No adquiere reservas de escritura de implementación.
El brief adjunta `.nomos-review/diff.patch`, con el diff del implementador desde su base.

El marcador `NOMOS_REVIEW` exige `approved` booleano y `findings` con archivo, línea positiva, severidad y nota.
Un marcador inválido genera `worker.waiting` con la línea recibida; se conserva el buffer de fragmentos.
Los ejemplos dentro de fences no cierran revisiones. `NOMOS_DONE` no termina un revisor.
`worker.send` puede responder a su ASK manteniendo el rol y `revisando`; un revisor terminado no se reactiva.

`review.finished` y el artefacto JSON `report` guardan findings y procedencia: run implementador, generación,
commit y hash del diff. Las rutas de informe son relativas a `.nomos/artifacts`.
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
Una preparación local del mismo comando, sin sesión, árbol ni efectos inciertos, conserva su run e intento
y actualiza también el proveedor del run antes de lanzar; así su atribución coincide con el adaptador elegido.
`review.start` se recupera como mutación incierta; `review.poll` como lectura recuperable.
Un fallo del revisor no termina ni libera las reservas del implementador.

Codex y Claude tienen launcher; con ambos habilitados, un implementador Codex recibe un revisor Claude
y viceversa. Con uno habilitado, la revisión usa un run nuevo del mismo proveedor y `same_provider: true`.
El arranque, permisos y revisión cruzada se verifican con fake Orca y Git real; la aceptación con TUIs reales
corresponde a T6. Contratos de lanzamiento y espera en [workers-proveedores.md](workers-proveedores.md).
OpenCode se reconoce y persiste como proveedor válido; aún no dispone de adaptador.
