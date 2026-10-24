# OpenCode, el proveedor barato

OpenCode avanza en paralelo con tareas **sencillas, bien especificadas y verificables sin Unreal**.
El usuario le dio 4 $ de crédito: cada tarea de OpenCode es una que Claude no tiene que hacer.

## Qué le das

- Documentación: `docs/`, controles, READMEs, notas de producción.
- Configuración y datos: `.gitattributes`, tablas, JSON y CSV.
- Scripts pequeños con su prueba, y pruebas unitarias con aceptación cerrada.
- Limpieza mecánica acotada (renombrar en una carpeta, formato, enlaces rotos).

Nunca: assets de Unreal, mapas, UI, arte, combate, QA ni nada que exija abrir el editor.
El planificador ya rechaza los roles `arte`, `ui` y `qa`; el resto es criterio tuyo.

## Cómo lo activas

1. Dale cupo en la config del servicio: `"concurrency": {"claude": 2, "opencode": 1}`.
2. Elige modelo con `"opencodeModel"` (por defecto `opencode/beam-free`).
3. Crea la tarea con `--provider opencode` (HTTP: `assigneeProvider: "opencode"`).
   Sin eso nunca se elige, ni siquiera con `defaultProvider`.

Sin cupo la tarea espera con «OpenCode apagado: dale cupo en config.json».

## Modelo

Primero gratuito: `opencode/beam-free`, `opencode/deepseek-v4.1-flash-free`,
`opencode/flint-40b-free`. De pago, solo barato y con los 4 $ en mente:
`opencode/claude-haiku-5-5`, `opencode/deepseek-v4.1-flash`. Nunca `opencode/gpt-5.3-codex`
(el modelo por defecto del usuario) ni Opus o Sonnet a través de OpenCode: para eso está Claude.
`opencodeModel` solo admite `opencode/…` u `opencode-go/…`; el servicio lo fija en la orden y en
un `opencode.json` del árbol, así ningún subproceso hereda el modelo caro.

## Cómo corre

El servicio escribe en el terminal de Orca
`opencode run --auto --model <modelo> --title kratos-<id> Lee el archivo .kratos-brief.md …`:
el brief viaja en la orden y OpenCode sale al terminar. Las correcciones y respuestas usan
`opencode run --continue …` en el mismo terminal. Sin `opencode` en el PATH la run falla con
«OpenCode no está instalado o no está en el PATH del terminal».

## Revisión y fallos

El revisor de una tarea de OpenCode es siempre Claude, nunca OpenCode; si Claude no tiene
hueco, la revisión espera. Si OpenCode falla dos veces en la misma tarea (run fallida o revisión
rechazada), reasígnala a Claude (`--provider claude`) en vez de insistir.
