# Estado de entregas

Actualizado: 2026-10-23.

## Hito 2 — primer worker Codex

**Aceptación funcional real completada; aceptación visual e integración del director pendientes.**

| Parte | Estado y evidencia |
| --- | --- |
| Petición y spec | HTTP /messages, ACK/reply CLI; tarea preparada con criterios y scope explícitos. |
| Worker real | Codex en terminal y worktree Orca del juego, rama kratos/853be6a3. |
| Primera entrega | README y script creados por Codex; dos commits reales, versión 5.8, exit 0. |
| Primera revisión | KRATOS_DONE real recuperado por poll; tarea revisando. |
| Corrección | worker.send por archivo multilinea, mismo run/session/worktree/base; correctionCount 0→1. |
| Segunda entrega | Nuevo commit y KRATOS_DONE real; tarea nuevamente revisando. |
| Script final | Versión 5.8 + ruta UE_5.8 registrada; Build.version 5.8.3 validado; cwd externo, exit 0. |
| Scope y assets | Solo Docs/README-kratos.md y Scripts/hello.ps1; árbol limpio; 197 hashes de Content intactos. |
| Regresión del producto | Fixwave final: npm test 208/208, sin fallos ni warnings; Skillsmith 1.2.0: 98. Cero dependencias nuevas. |
| Limpieza | Servicio propio detenido; datos aislados, Codex y cuatro worktrees conservados. |
| Panel y capturas UI | PENDIENTES: panel no disponible para esta aceptación. |
| Claude Code /kratos | PENDIENTE: no se ejercitó una sesión nueva de Claude como director. |
| Monitor | PENDIENTE: dirección y ACK/reply se ejercieron explícitamente por CLI. |

Tarea aceptada: `853be6a3-e9fe-4814-8cb7-751197dccc4d`.
Run conservado: `1cb1d3bf-2288-412c-8143-bca4e5e6e4cc`.
La tarea queda **revisando**; no se concedió done ni se integraron cambios al juego.
La aceptación Codex real corresponde a la evidencia histórica con suite 195/195.
La regresión 208/208 usa fakes, SQLite y Git temporales; no repitió Codex real.

Durante la prueba se corrigieron con TDD y revisión diferencias reales de Orca:
terminal inicial opcional, receipt send anidado, espera no satisfecha y snapshots TUI.
Dos intentos fallidos con incertidumbre quedaron conservados e identificados.
La recuperación del tercer intento mantuvo su run y no repitió la petición al worker.
Las salidas de pantalla declaran historyComplete=false; no acreditan historial íntegro.

Advertencias Hook failed sin causa verificada; SecondBrain CLI funcionó en la sesión.
El onboarding de confianza fue autorizado exclusivamente para el repo de prueba.
No hubo push, merge, borrado de recursos ni cambios de configuración manuales.

Identidades completas, comandos sanitizados, salidas antes/después, commits,
listado Orca y límites: [aceptación del hito 2](aceptacion-hito2.md).
