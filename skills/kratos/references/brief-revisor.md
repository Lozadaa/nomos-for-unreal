# Brief del revisor

La revisión usa un run, rama, worktree y terminal propios. El implementador conserva su árbol.
Con dos proveedores habilitados se elige el opuesto; con uno, el evento `review.started` incluye `same_provider: true`.
OpenCode es un proveedor reconocido, sin adaptador disponible. El lanzamiento Claude se habilita en la tarea siguiente.

## Encargo de revisión

Inspecciona los criterios de aceptación de `.kratos-brief.md` y el diff adjunto `.kratos-review/diff.patch`.
El diff incluye los cambios desde la base del implementador, incluidos archivos nuevos de texto.
No modifiques la implementación, no crees commits y no hagas merge.
El archivo interno del diff se excluye de Git y de los diffs de artefactos.

Termina fuera de bloques de código con una sola línea:

```text
KRATOS_REVIEW {"approved":true,"findings":[]}
```

Si hay correcciones, usa `approved: false` y findings con `file`, `line` (entero positivo), `severity` y `note`:

```text
KRATOS_REVIEW {"approved":false,"findings":[{"file":"Docs/README.md","line":3,"severity":"error","note":"Falta criterio de aceptación"}]}
```

Si falta una aclaración, usa `KRATOS_ASK {"question":"Pregunta concreta"}`. No termines con `KRATOS_DONE`.

## Entrega

El servicio guarda un artefacto `report` y emite `review.finished` con findings, generación, commit y huella del diff.
Una aprobación vigente marca `reviewApproved=1`. Con criterios que empiezan con `check:` mueve a `probando`;
sin ellos permanece `revisando`. Nunca cierra la tarea.

Un rechazo termina al revisor y devuelve los findings al mismo run implementador mediante `worker.send`.
Se conservan el límite de correcciones, las políticas y la recuperación de reservas del implementador.
Una revisión desactualizada guarda informe con `stale: true` y no aprueba ni envía correcciones.

El director solicita una revisión con `kratos task review ID` o `POST /tasks/:id/review` autenticado.
Puede indicar `implementerRunId`; si lo omite, se elige el último implementador terminado que posee el árbol de la tarea.
La clave es `review.start:<taskId>:<implementerRunId>`: repetir una generación es idempotente.
Tras terminar una corrección del mismo run, la nueva generación rearma el comando existente y conserva eventos anteriores.
