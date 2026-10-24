# Planificador de arranques

El runner comprueba tareas preparadas cada cinco segundos, sin solapar entregas. El plan consulta dependencias, reservas y cupos sin escribir; el tick persiste la explicación de espera solo si cambia y encola `worker.start:<taskId>:<attempt>`. Un POST manual con esa clave conserva el payload original.

Configurar en el `dataDir` real, normalmente `.kratos/config.json`:

```json
{"defaultProvider":"claude","concurrency":{"codex":0,"claude":2,"opencode":0}}
```

Si falta `concurrency`, se usan esos valores (desde el hito 7 **Codex queda apagado por defecto**; para usarlo hay que darle cupo, por ejemplo `"codex":2`); si falta `defaultProvider`, es `claude`. Con `"codex":0` nunca se lanza Codex. Si existe un objeto explícito, los proveedores omitidos quedan deshabilitados. Los valores deben ser enteros no negativos. OpenCode es un proveedor válido para configuración y asignación; incluso con un límite positivo queda excluido de la selección porque aún no tiene adaptador. Una petición explícita espera con «OpenCode sin adaptador disponible», sin crear run ni recursos. La lectura compartida conserva otros campos; corregir JSON inválido permite que el siguiente tick vuelva a planificar.

Crear la tarea con `POST /tasks` permite asignar `assigneeRole` y `assigneeProvider` antes de prepararla. Los roles `arte`, `ui` y `qa` prefieren siempre Claude; los demás prefieren `defaultProvider` (Claude por defecto) y usan el otro proveedor solo si el preferido no tiene hueco. Un proveedor asignado explícitamente debe tener cupo. La elección pura de revisor exige el proveedor opuesto cuando ambos están habilitados; con uno habilitado señala `sameProvider`.

Antes de enviar `/tasks/:id/spec`, declarar dependencias autenticadas:

```http
POST /tasks/:id/depends
Authorization: Bearer <token>
Content-Type: application/json

{"dependsOn":["id-de-la-tarea-base"]}
```

Solo se modifica una tarea pendiente; se rechazan ciclos e identificadores desconocidos. Una dependencia permite despachar cuando está en `done` o en `revisando` con `reviewApproved: 1`, sin bloqueo. Cambiar dependencias invalida autorizaciones previas del contexto; actualizar `task.waiting` solo cambia la explicación y conserva la decisión.

Runs activos e intenciones pendientes ocupan cupos y reservas virtuales sin contar dos veces el mismo intento. El handler revalida dependencias y capacidad tras sus comprobaciones asíncronas; adquirir reservas sigue siendo atómico. Una condición recuperable anterior a efectos devuelve `{deferred:true,reason}`: el runner conserva el comando pendiente, espera cinco segundos y no consume intentos. Emite `command.deferred`.

La revalidación se repite justo antes de crear el árbol. Si solo existe el run local, queda vinculado a ese commandId, libera reservas y se reutiliza con el mismo intento al recuperar condiciones. Otro comando no puede apropiárselo. Una política nueva o una Decisión externa durante esa preparación completa el comando con policyBlocked: resolver exige después POST explícito para continuar.

Después del árbol, la TUI puede quedar iniciada e idle mientras el despacho del encargo está pausado. Si una dependencia cambia antes de entregar el brief, una Decisión conserva el mismo run/árbol en preparación; no se devuelve deferred ni se recrean recursos. Resolver y enviar explícitamente al mismo run permite continuar solo si las dependencias vigentes lo permiten. TUI lista no acredita ejecución de la tarea antes del brief.

Solo un fallo limpio `lease_conflict`, sin árbol ni incertidumbre, admite avanzar automáticamente al siguiente intento. Un arranque `policyBlocked` completado sigue requiriendo POST explícito al resolver su decisión. Un árbol detenido requiere reconciliación.

Codex y Claude disponen de launcher y pueden ejecutar implementación o revisión independiente. OpenCode sigue reconocido sin adaptador. La selección, los permisos Claude y la revisión cruzada se verifican con fake Orca y Git real; la aceptación con proveedores reales corresponde a T6.
