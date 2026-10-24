# Proveedores de workers

CLI `kratos worker start TASK --provider PROVEEDOR` y HTTP autenticado `POST /tasks/:id/worker`
admiten `codex`, `claude` y `opencode`. La clave `worker.start:TASK:attempt` conserva el payload
original. OpenCode (hito 12) corre con `opencode run`: el brief viaja en la orden, sin esperar una TUI.

`service/src/handlers/worker-launch.ts` expone:

| Función | Codex | Claude | OpenCode |
| --- | --- | --- | --- |
| `launchPlan(provider, model, short)` | orden + readiness, `briefInCommand: false` | igual | `briefInCommand: true` |
| `launchCommand(provider, model, title)` | `codex --yolo --no-daemon` | `claude --model sonnet --dangerously-skip-permissions` | `opencode run --auto --model <opencodeModel> --title kratos-<id> Lee el archivo .kratos-brief.md de esta carpeta y ejecuta lo que dice.` |
| `readyPattern(provider): RegExp` | `Ask\s*Codex` | `bypass permissions\|Try "` | no se espera |
| `followUp(provider, model, line)` | la línea | la línea | `opencode run --continue --auto --model <modelo> <línea>` |
| `permissionPrompt(provider, lines)` | `null` | Primera línea con `Do you want to`, `Allow` o `(y/n)` | `null` (`--auto`) |

Otros proveedores producen `invalid_worker_provider`; un modelo de OpenCode que no empiece por
`opencode/` u `opencode-go/` (o lleve espacios o comillas) produce `invalid_opencode_model`.
La orden de OpenCode no lleva comillas porque `terminalSend` las rechaza; `run` une las palabras
del mensaje. Antes de lanzar, el servicio escribe `opencode.json` con el modelo en el árbol
(excluido de Git como el brief) y guarda el modelo en `metadata.model`. Si el terminal responde que
`opencode` no se reconoce, el sondeo falla la run con «OpenCode no está instalado o no está en el
PATH del terminal». Cuando `run` termina sin marcador, el terminal queda en el prompt y el sondeo
lo trata como «opencode espera instrucciones». No existe fallback de proveedor.

El contrato Orca amplía `terminalWaitIdle(handle: string, timeoutMs: number, pattern?: RegExp): Promise<boolean>`.
Omitir pattern conserva readiness Codex. Siempre lee el tail y exige el patrón real; `wait.satisfied: true`
o un timeout de condición no prueban readiness. Mantiene errores de proceso/condición y descubrimiento
del terminal cuando falta `startupTerminal`. El brief se guarda antes de iniciar el proveedor y se entrega
por nombre de archivo cuando su TUI está lista.

El proveedor se conserva en run, selección del worktree, lanzamiento, espera y eventos de run,
output, permiso, envío y revisión. Un permiso Claude emite `worker.waiting` con `question` igual a
la línea observada y `lastLines`; nunca envía una respuesta automáticamente. El director decide según
el alcance. Cambios de salida retiran la espera; el fingerprint evita repetir el mismo frame de pantalla.

Los marcadores de pantalla admiten viñetas `•`, `●`, `⏺` y JSON continuado con indentación y `⎿`.
Se conservan las exclusiones de prompts, prosa y bloques de código. Son formatos cubiertos por pruebas
sintéticas; aquí no se afirma haberlos capturado de una TUI Claude real. El cursor del stream se mantiene
separado de los snapshots. DONE sigue siendo válido sin `KRATOS_SKILLS`.

El brief de todos los workers y revisores enumera `run.skills` (explícitas y requeridas por rol)
y pide una primera línea `KRATOS_SKILLS […]` con las skills realmente cargadas. El marcador
persiste la declaración en `metadata.confirmedSkills` y reporta faltantes sin bloquear.
Sin marcador, la confirmación es desconocida; no se infiere carga ni se impide DONE/REVIEW.
Contrato de inventario, eventos y HTTP en [skills-workspace.md](skills-workspace.md).
T6 verificará aceptación con los proveedores reales.
