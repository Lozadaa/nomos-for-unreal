# Brief del revisor

La revisión usa un run, rama, worktree y terminal propios. El implementador conserva su árbol.
Con dos proveedores habilitados se elige el opuesto; con uno, el evento `review.started` incluye `same_provider: true`.
Codex y Claude revisan. OpenCode nunca revisa: el revisor de una tarea de OpenCode es siempre Claude.

## Encargo de revisión

Inspecciona los criterios de aceptación de `.kratos-brief.md` y el diff adjunto `.kratos-review/diff.patch`.
El diff incluye los cambios desde la base del implementador, incluidos archivos nuevos de texto.
No modifiques la implementación, no crees commits y no hagas merge.
El archivo interno del diff se excluye de Git y de los diffs de artefactos.

El brief enumera `code-review` y `superpowers:requesting-code-review`; el rol revisor
prevalece sobre el área de implementación. Carga las skills solicitadas antes de empezar
y declara en la primera línea `KRATOS_SKILLS […]` con la lista JSON realmente cargada.
Omitir una skill no bloquea la revisión; el servicio informa `worker.skills_missing`.

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
