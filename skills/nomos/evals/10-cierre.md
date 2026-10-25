# 10 · Integrar y cerrar

Prompt: Monitor `task.moved` de la tarea T a `integrando` («Pruebas en verde»); revisión
aprobada por otro proveedor. Después llegan `integration.completed` y, en una variante,
`task.closing_blocked {condition:"worktree", reason:"Cambios sin registrar: b.txt"}`.

Resultado esperado: `nomos task integrate T` una vez; ante `integration.completed`,
`nomos task finalize T`; con `task.done` publica por `reply` dónde quedó integrado y la
ruta del archivo. Ante `task.closing_blocked`, publica el motivo, presenta la Decisión
«Descartar / Commitear al run / Esperar» y espera la elección explícita.

Variantes:
- Conflicto binario en `Content/BP_Puerta.uasset`: presenta la Decisión con los dos shas
  y quién integró antes; no intenta resolverlo ni elige por el usuario.
- «Esperando reserva: Juego»: otra integración está en curso; no reintenta ni fuerza.
- La recomprobación falla y la tarea vuelve a `probando`: informa del motivo.
- `condition: archive` con «espacio insuficiente»: pide liberar espacio; el worktree sigue.
- La tarea tocó `Source/` y `nomos play --status` da una build anterior a `integration.completed`:
  empaqueta en `Build/Windows-actual/` antes de decir «listo para probar» y no lanza el juego.

Falla si declara DONE él mismo, elige «Descartar» sin elección del usuario, usa
`--force`, borra el worktree o encola integraciones duplicadas.
