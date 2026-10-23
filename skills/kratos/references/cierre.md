# Integración, cierre y continuación

DONE significa: cambios en commits recuperables, integrados en la rama objetivo y
recomprobados; revisión y pruebas satisfechas; conversación, autores, commits y
artefactos preservados fuera del worktree; terminales cerrados y worktree retirado
sin forzar. Lo comprueba el servicio; Kratos solo lo pide.

## Integrar (`kratos task integrate <id>`)

- Exige `integrando` y revisión aprobada. Una tarea aprobada en `revisando` sin
  criterios `check:` pasa sola a `integrando` al pedirlo.
- Trabaja en `.kratos/integration/<Proyecto>`, un worktree del juego en HEAD separada
  (la rama objetivo suele estar activa en tu checkout y Git no deja activarla dos
  veces). La rama objetivo es `config.json: targetBranch` o la rama actual del juego.
- `merge --no-ff` de la rama del worktree. Una integración a la vez por proyecto
  (reserva `integration/<Proyecto>`): la segunda espera con «Esperando reserva».
- Si la rama objetivo avanzó desde que nació el worktree, `checks.run` recomprueba el
  resultado integrado en ese workspace antes de publicarlo; si falla, la tarea vuelve
  a `probando` con el motivo y la rama objetivo no se toca.
- Publicar es `merge --ff-only` en el checkout que tenga activa la rama (el tuyo); si
  tienes cambios que chocan, la integración espera y lo dice.
- Conflicto (texto o binario, p. ej. `.uasset`): nada se resuelve. `abortMerge`,
  informe «Integración · conflicto» y Decisión «Resolver en el worktree / Descartar
  la integración» con el sha de cada rama y quién integró antes ese archivo.

## Cerrar (`kratos task finalize <id>`)

Exige `cerrando`. Condiciones en orden; la primera que falla deja la tarea en
`cerrando` con `waitReason` y el evento `task.closing_blocked {condition, reason}`:

| condition | Qué exige | Qué haces |
|---|---|---|
| `commits` | rama del worktree existe y el commit integrado está en la rama objetivo | integra primero |
| `review` | revisión aprobada y último run del responsable `done` | pide revisión |
| `integration` | integración posterior a la última versión del responsable | integra de nuevo |
| `checks` | últimas pruebas obligatorias en `passed` | `kratos task check` |
| `worktree` | sin cambios sin registrar; Decisión «Descartar / Commitear al run / Esperar» | presenta la Decisión |
| `archive` | `.kratos/archive/<tarea>/` escrito y verificado (SHA-256 por archivo) | libera espacio y reintenta |
| `processes` | terminales cerrados por Orca (mata el árbol del shell) | revisa Orca |

«Archivos en uso» (un proceso aún retiene el worktree) se reintenta solo cada 30 s,
hasta cinco veces. «Descartar» es la única vía a `--force` y queda registrado quién
lo eligió (`worktree.discarded`); nunca lo elijas tú.

El archivo contiene `conversacion.jsonl`, `eventos.jsonl`, `diff-final.patch`,
`informes/`, `sesiones.json`, `resumen.md` y `manifest.json`; el panel lo enseña en
la pestaña Archivo. Las tareas sin worktree (assets remotos) cierran solo con él.

## Continuar después de DONE (`kratos task continue <id> --file <texto>`)

Crea «Ajuste: <título>» con `parentTaskId`, criterios, alcance y reservas de la madre
y su atribución. Si el terminal del responsable sigue vivo y su worktree existe, el
texto va a ese terminal (run con `continuationOf`). Si no, la hija queda `preparada`
y el planificador arranca un run nuevo (intento + 1) con `resumen.md` y
`diff-final.patch` del archivo en la sección «Continuación» del brief.

## Pausa

`kratos pausar` hace que el planificador no encole arranques: las tareas quedan
`preparada` con «Director en pausa» y sale `scheduler.paused` una vez. Integraciones,
cierres y workers en marcha terminan. `kratos reanudar` lo deshace.
