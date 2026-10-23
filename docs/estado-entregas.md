# Estado de las entregas

Actualizado el 2026-10-23 en `hito9-vistas`, con los hitos 8 y 2 ya en su base. El hito 9 se entrega en esta rama, sin push ni merge. Las cifras de hitos anteriores son evidencia histórica; las verificaciones nuevas se detallan en [el cierre del hito 9](auditoria-9-cierre.md).

| Hito | Estado | Evidencia |
|---|---|---|
| 0 · Escucha | En `main` | `docs/aceptacion-hito0.md`, `tests/` (pruebas del hito 0 dentro de `npm test`) |
| 1a · Diseño | En `main`; su dirección visual quedó **sustituida** por el hito 8 | `docs/diseno/`, `docs/diseno-visual.md` (reescrito) |
| 1b · Servicio (Tareas 1-5) | En `main` | `tests/service/`, `kratos seed`, rutas con token. Verificado: `npm test` 68/68 |
| 8 · Interfaz viva, Tareas 1-3 | En `main` | base visual, capa de sensación, shell |
| 8 · Interfaz viva, Tareas 4-6 | En `main` | `docs/auditoria-8-cierre.md`, `docs/medicion-8.json`, `docs/capturas-8/` |
| 2 · Primer worker | En `main` (fusionado el 2026-10-23; aceptación real con Codex) | `docs/aceptacion-hito2.md`, sección «Hito 2» más abajo |
| 9 · Lenguaje visual | Tareas 3–6 completas en `hito9-vistas`; Tareas 1–2/corrección en la base | `docs/auditoria-9-cierre.md`, `docs/capturas-9/`, `docs/diseno/glifos.md` |
| 3 | En rama paralela según el brief; no se modifica ni valida aquí | `docs/superpowers/plans/` |
| 4-7 | Con plan; estado no revisado en este cierre | `docs/superpowers/plans/` |

## Hito 8 (Tareas 4-6): lo que hay y lo que espera

**Hecho; verificación histórica al cerrar el hito 8**: Producción como lista viva con detalle compartido y compositor; Chat, Actividad, Entregas, Catálogo, Decisiones, Presupuesto, Capacidades y Estilo; `GET /status` con `project`. `npm test` 68/68 · Vitest 77/77 · build verde (204,9 KB gzip de JS inicial) · Playwright en Chromium y Firefox 37 pasadas, 3 omitidas con motivo · revisión final independiente hecha (1 crítico y 7 importantes arreglados; menores diferidos en la auditoría). INP < 200 ms en las cinco acciones principales, también con CPU ×4. Estas mediciones de INP no se repitieron para el hito 9.

**Integrado sobre la base del hito 2**: pestañas **Cambios** y **Chat** del detalle (`GET /runs/:id/diff`, `GET /runs/:id/output?since=`, `POST /runs/:id/message`). En el hito 9 se capturan salida, espera y diff de un repositorio temporal real; no se repite el worker Codex de la aceptación histórica.

**Disponible**: Pausar/Reanudar usa las rutas del director; los límites editables usan `PUT /budget`. Las decisiones resueltas no se deshacen: una decisión caducada se regenera, como establece el contrato de estados.

**Espera al servicio**: crear comandos (`POST /commands`, «Preparar para Unreal»; «Indexar» sigue deshabilitado), servir miniaturas del catálogo guardadas como rutas locales y listar el historial completo de mensajes. El panel indica el fallo al preparar, conserva «Revisar licencia» y usa pictograma cuando una miniatura no es servible.

**Pendiente de rendimiento**: frames largos con CPU ×4 y la primera pintura de 500 eventos de Actividad (cifras en la auditoría).

**Visor 3D**: la prueba E2E de Chromium carga el GLB y la imagen reales con la política de seguridad actual. Su caso de Firefox conserva la exclusión histórica; no se afirma comprobación del visor en ese navegador.

## Cómo repetirlo

```
npm test && npm run test:panel && npm run build
cd panel && npx playwright test           # arranca su propio servicio sembrado
node scripts/medir.ts                     # INP, frames largos y bundle → docs/medicion-8.json
node scripts/capturas.ts todas            # capturas a 1366 y 1920 → docs/capturas-8/
```

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
