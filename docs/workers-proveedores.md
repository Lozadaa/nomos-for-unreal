# Proveedores de workers

CLI `kratos worker start TASK --provider PROVEEDOR` y HTTP autenticado `POST /tasks/:id/worker`
admiten `codex`, `claude` y `opencode`. La clave `worker.start:TASK:attempt` conserva el payload
original. OpenCode es reconocido y persistible; devuelve `deferred` con «OpenCode sin adaptador
disponible» antes de crear run, worktree o sesión, aun con concurrencia positiva.

`service/src/handlers/worker-launch.ts` expone:

| Función | Codex | Claude |
| --- | --- | --- |
| `launchCommand(provider): string` | `codex --yolo --no-daemon` | `claude --model sonnet --dangerously-skip-permissions` |
| `readyPattern(provider): RegExp` | `Ask\s*Codex`, sin distinguir mayúsculas | `bypass permissions\|Try "`, sin distinguir mayúsculas |
| `permissionPrompt(provider, lines): string \| null` | `null` | Primera línea con `Do you want to`, palabra `Allow` o `(y/n)` |

Las funciones de lanzamiento y readiness rechazan `opencode` con `unsupported_worker_provider`;
otros valores producen `invalid_worker_provider`. No existe fallback de proveedor.

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

El brief Claude enumera `run.skills` solicitadas y pide una primera línea `KRATOS_SKILLS […]` con las
skills realmente cargadas. T4 no detecta ese marcador ni modifica skills basándose en la salida; T5
implementará el enrutado y la detección. T6 verificará aceptación con los proveedores reales.
