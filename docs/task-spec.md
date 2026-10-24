# Especificación de tareas para el director

`nomos task create --title "Documentar juego" --area qa --spec-file encargo.md`
valida el archivo antes de crear la tarea. Sin archivo crea una tarea pendiente.
`nomos task spec ID --spec-file encargo.md` prepara una tarea existente y conserva su área.

Los cinco encabezados siguientes deben aparecer exactamente una vez. Qué y Por qué
requieren texto; Criterios requiere al menos una entrada numerada y Alcance una ruta.

```md
# Título descriptivo
## Qué
Crear documentación del juego.
## Por qué
Explicar cómo probarlo.
## Criterios de aceptación
1. Existe README con controles.
## Alcance
- `Docs/README.md`
- Scripts/
## No tocar
- Content/
```

El título procede de `--title`. Se conserva el Markdown íntegro normalizando BOM y
CRLF a LF. Las listas dentro de bloques de código no aportan criterios ni rutas;
cualquier encabezado termina la sección anterior. No se infieren criterios del texto.
Las rutas son relativas al juego, literales, sin absolutos, `..`, glob ni segmentos
ambiguos. Los directorios se normalizan como prefijos por segmentos. No tocar se
mantiene en el encargo y en el brief; no constituye una columna independiente.

`worker start ID` usa codex, implementacion, skills vacías y attempt 1 por defecto.
`--attempt N` es explícito; no concede permiso para duplicar worktrees.
Si una política bloqueó antes de crear run o recursos, resuelve la Decisión y repite
`worker start ID --attempt N` con el mismo N. El POST puede reactivar el mismo
commandId, clave y payload original; reevalúa la política con la misma identidad
de ejecución. Solo admite el resultado durable `policyBlocked:true` y Decisión
resuelta, tarea preparada y ausencia de recursos o efectos inciertos. Emite
`command.pending` con `resumed:true` y decisionId, conservando el historial previo.
Resolver no arranca automáticamente. Un comando failed o ya ejecutado no se reactiva.
`worker send RUN (--file MD | --text TEXTO) [--idempotency-key CLAVE]` entrega
texto literal. `worker stop RUN`, `run diff RUN` y `run output RUN [--since 0]`
consumen los recursos persistidos; no admiten rutas o handles de terminal externos.
Pide correcciones tras `run.done` y tarea `revisando`. Si envías instrucciones mientras
el worker sigue ejecutando, inspecciona la entrega contra la nueva consigna: un DONE
completo antiguo aún no observado puede llegar intercalado. El protocolo no lleva
turnId y no garantiza atribución exacta por turno; el envío sí descarta parciales previos.

Para preguntas fuera del encargo: `decision open TASK --file pregunta.json`,
`decision list --state open`, `decision resolve ID --option answer --by nomos`.
El JSON contiene `reason`, `evidence:[{kind,ref}]` y
`options:[{id,label,description}]`. Una pregunta libre usa la opción `answer`,
«Responder en el chat». Resolver una Decisión no envía respuesta ni autoriza
continuación automáticamente: el director envía explícitamente el texto aprobado.
Si el arranque quedó en phase preparing esperando Decisión, se continúa el mismo
run mediante worker send con «Lee el archivo .nomos-brief.md de esta carpeta y
ejecuta lo que dice.». No se inicia otro worker.
