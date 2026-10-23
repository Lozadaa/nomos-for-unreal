# Estado de las entregas

Actualizado el 2026-10-23 en `hito6-cierre` (sobre `main` con los hitos 0-5, 8 y 9). El hito 6 se entrega en esta rama, sin push ni merge. Las cifras de hitos anteriores son evidencia histórica; las del hito 6 están en [su aceptación](aceptacion-hito6.md).

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
| 4 · Catálogo y extracción | Tareas 1-6 en `hito4-catalogo` (sin push ni merge); aceptación real con Unreal 5.8.3 y Meshy | `docs/aceptacion-hito4.md`, `docs/capturas-4/`, sección «Hito 4» más abajo |
| 5 · Unreal, UI del juego y QA | Tareas 1-6 en `hito5-unreal` (sin push ni merge); aceptación real con Unreal 5.8.3 y workers Claude | `docs/aceptacion-hito5.md`, `docs/capturas-5/`, sección «Hito 5» más abajo |
| 6 · Integración y cierre | Tareas 1-4 en `hito6-cierre` (sin push ni merge); aceptación real con workers Claude en KratosFabTest | `docs/aceptacion-hito6.md`, `docs/capturas-6/`, sección «Hito 6» más abajo |
| 5b, 7 | Con plan; 5b pausado por decisión del usuario | `docs/superpowers/plans/` |

## Hito 8 (Tareas 4-6): lo que hay y lo que espera

**Hecho; verificación histórica al cerrar el hito 8**: Producción como lista viva con detalle compartido y compositor; Chat, Actividad, Entregas, Catálogo, Decisiones, Presupuesto, Capacidades y Estilo; `GET /status` con `project`. `npm test` 68/68 · Vitest 77/77 · build verde (204,9 KB gzip de JS inicial) · Playwright en Chromium y Firefox 37 pasadas, 3 omitidas con motivo · revisión final independiente hecha (1 crítico y 7 importantes arreglados; menores diferidos en la auditoría). INP < 200 ms en las cinco acciones principales, también con CPU ×4. Estas mediciones de INP no se repitieron para el hito 9.

**Integrado sobre la base del hito 2**: pestañas **Cambios** y **Chat** del detalle (`GET /runs/:id/diff`, `GET /runs/:id/output?since=`, `POST /runs/:id/message`). En el hito 9 se capturan salida, espera y diff de un repositorio temporal real; no se repite el worker Codex de la aceptación histórica.

**Disponible**: Pausar/Reanudar usa las rutas del director; los límites editables usan `PUT /budget`. Las decisiones resueltas no se deshacen: una decisión caducada se regenera, como establece el contrato de estados.

**Espera al servicio**: listar el historial completo de mensajes. (`POST /commands`, «Indexar» y las miniaturas reales del catálogo llegaron con el hito 4.) El panel indica el fallo al preparar, conserva «Revisar licencia» y usa pictograma cuando una miniatura no es servible.

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

## Hito 4 — catálogo, Fab, Meshy

**Hecho** (rama `hito4-catalogo`): indexador de `Content/Fab` y packs del Launcher de cada proyecto, `VaultCache`, caché del plugin, Megascans y `listings_v1.db` (copia de solo lectura); `POST /commands` con lista blanca; editor sin GUI como adaptador (`verifyPack`, `importFile`); nivel 1 (migrar sin sobrescribir, reserva `editor/<proyecto>`, aviso de versión, Decisión «Reemplazar / Conservar»); preparación con `ue-asset-intake` y Decisión «Licencia desconocida»; nivel 2 (Launcher, instrucciones, detector por log y por `VaultCache`, «Ya lo añadí»); Meshy por REST **solo hard surface** (`text|image|remesh`, sin `rig` ni `animate`) con presupuesto, copia propia y reconciliación; panel: Indexar ahora, ⌘K Indexar, Migrar, Descargar, Descargas pendientes, miniaturas reales, Regenerar, eje de horas y recuento «×N» en Actividad; skill con `kratos asset …`, `references/assets.md` y casos 07-08.

**Verificado** en el cierre: `npm test` 358/358 · Vitest 251/251 · build verde · Playwright 59 pasadas, 3 omitidas · skillsmith 98. Aceptación real: migración con verificación sin GUI y aviso «Publicado para 5.4; verificado en 5.8.3», preview de Meshy de 20 créditos con GLB guardado, refine fuera de presupuesto con Decisión y sin job, licencia desconocida con Decisión, detector de nivel 2 sobre el log real.

**Pendiente**: descarga nueva de nivel 2 de punta a punta con clics en el Launcher, worker Claude de arte sobre una tarea de `asset prepare`, pack con C++ o plugins y zip real de la caché del plugin.

```
node skills/kratos/scripts/kratos.ts asset index|search|migrate|prepare|download|generate --data <juego>/.kratos
node panel/scripts/capturas-4.ts "<juego>/.kratos"       # capturas → docs/capturas-4/
```

## Hito 5 — Unreal, UI del juego y QA

**Hecho** (rama `hito5-unreal`): editor por lotes con render (`-game` a resolución fija), `engineVersion`, cola de un editor por proyecto (`editor/<proyecto>`, «ocupado por …»), Build.bat y BuildCookRun con tiempo máximo; comprobaciones por tipo de cambio (`cpp`, `blueprint`, `asset`, `map` con Data Validation, `umg`, `build`) con `TestRun` completo, log como artefacto y resumen de 30 líneas; puerta `probando → integrando` con Decisión «Continuar sin esta comprobación / Reintentar»; ciclo UMG (`ui.cycle`: capturas con y sin UI a 1280×720 y 1920×1080, comparación PNG propia, QA visual de Claude con `ue-visual-qa`); skills `game-ui-art-director`, `ue-umg-ui`, `ue-visual-qa` y `kratos skills install`; `unreal_mcp_conflict`, `GET /editors` y MCP vivo opcional apagado; panel: pestaña Pruebas, Entregas por tarea con resolución y mapa, editor en Capacidades.

**Verificado** en el cierre (tras la revisión final): `npm test` 408/408 · Vitest 256/256 · build verde · Playwright 61 pasadas, 3 omitidas · skillsmith kratos 98, game-ui-art-director 96, ue-umg-ui 96, ue-visual-qa 96. Aceptación real: petición «HUD con barra de vida que baje al pulsar H» de punta a punta (dirección de arte → worker Claude en C++ → capturas → QA visual → revisión → `cpp` y `build` → `integrando`), prueba 7 con un menú oculto («la captura no contiene la UI» y corrección al responsable), C++ real con éxito y con error, mapa con Data Validation y captura, prueba 29 y MCP vivo una vez.

**Pendiente**: el runner procesa una orden cada vez (un empaquetado de 40 min retrasa los demás comandos); las tareas dependientes no reciben los commits de su dependencia (hito 6), así que la dirección de arte llega por ruta; Blueprint y assets reales en un árbol de trabajo con Content; la tecla H solo la cubre la prueba del worker.

```
node skills/kratos/scripts/kratos.ts task check <tarea> --data <juego>/.kratos
node skills/kratos/scripts/kratos.ts skills install --data <juego>/.kratos
node panel/scripts/capturas-5.ts "<juego>/.kratos" <tarea>      # capturas → docs/capturas-5/
```

## Hito 6 — integración y cierre

**Hecho** (rama `hito6-cierre`): integrador (`integrate.run`: workspace `.kratos/integration/<proyecto>` en HEAD separada, reserva `integration/<proyecto>`, `merge --no-ff`, recomprobación con `checks.run` si la rama objetivo avanzó, conflicto de texto o binario → `abortMerge` y Decisión con los shas, publicación con `--ff-only` en el checkout del usuario); finalizador (`finalize.run`: commits recuperables, revisión, integración vigente, pruebas, limpieza, archivo verificado con SHA-256, terminales cerrados por Orca y todos los worktrees de la tarea retirados sin `--force`; «Descartar» como única vía al force, registrada; «archivos en uso» reintenta cada 30 s; `ENOSPC` sin archivo parcial); continuación después de DONE (`task.continue`: hija con atribución heredada; terminal vivo → se le habla allí; si no, run nuevo con intento + 1 y el archivo en el brief); atribución por rol; pausa del planificador; CLI `task integrate|finalize|continue`, `pausar|reanudar`; skill «Cerrar» + `references/cierre.md` + evals 10-11; panel: nota y acción en «Cerrando», «Quién hizo qué», pestaña Archivo, «Pedir cambios» en tareas hechas, «Pausado»; Entregas con nombres legibles, filtro por tipo y orden en la URL (corrección del usuario).

**Verificado** en el cierre: `npm test` 426/426 · Vitest 267/267 · build verde · Playwright 61 pasadas, 3 omitidas · skillsmith kratos 98. Aceptación real: dos tareas hasta `done` con workers Claude, continuación con terminal muerto y vivo, conflicto binario → Decisión, recomprobación con la base cambiada y `kratos pausar`.

**Pendiente**: revisar cambios solo binarios (el parche los excluye y el árbol del revisor nace de la rama objetivo); la continuación con terminal vivo no se da tras un cierre del hito 6 (el finalizador cierra los terminales); la Decisión de B en KratosFabTest sigue abierta para el usuario.

```
node skills/kratos/scripts/kratos.ts task integrate|finalize <tarea> --data <juego>/.kratos
node skills/kratos/scripts/kratos.ts task continue <tarea> --file ajuste.md --data <juego>/.kratos
node skills/kratos/scripts/kratos.ts pausar|reanudar --data <juego>/.kratos
node panel/scripts/capturas-6.ts "<juego>/.kratos" <tareaHecha>    # capturas → docs/capturas-6/
```
