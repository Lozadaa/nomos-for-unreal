# Kratos · Hito 7 «endurecimiento y acabado» · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Refinado 2026-10-23** con el código real de los hitos 0-5, 8 y 9 en `main` y el hito 6 en curso (integrador, finalizador, continuación, pausa). Se despacha cuando el hito 6 esté en `main`. Reglas del usuario vigentes: **ningún worker Codex** (y Codex apagado por defecto en el producto: Tarea 1); Meshy solo hard surface; hito 5b pausado; ningún artefacto se muestra por nombre de archivo o uuid (ya aplicado en el hito 6).

**Goal:** Que el recorrido completo (petición → tareas → workers → assets → Unreal → pruebas → integración → DONE) sea estable ante fallos, reintentos y límites, que el panel esté acabado según las puertas de diseño del plan, y que una entrega se ejecute fuera del editor con su recorrido registrado.

**Architecture:** Endurecimiento del servicio sobre lo que existe (`recovery.ts`, bandeja con `notBefore`/`defer`, reservas, presupuesto, `OrcaError`), un ejecutor con **dos carriles** para que un empaquetado de 40 minutos no bloquee los sondeos, `kratos doctor`, log JSONL, pruebas intermitentes estabilizadas; entrega fuera del editor con recorrido guionado y regresión visual con el decodificador PNG propio del hito 5; acabado del panel con las puertas de diseño y la corrección de las tarjetas de Decisión; cierre del MVP con la tabla de las 35 pruebas.

**Tech Stack:** Lo de los hitos anteriores. Regresión visual con `checks/png.ts` (`pixelDiffRatio`) y líneas base en `docs/baseline/` del juego, no con Screenshot Comparison (exige el editor con GUI y automatización). Insights queda como trace opcional. Playwright ya está en `panel/` (61 pruebas).

**Spec:** `docs/plan-v2.md` §2.5-2.6, §3.8, plan v1 §11, hito 7 de §6, pruebas 3, 9, 14 del plan v1 §13 y 15-18, 24, 25 del v2.

## Contratos reales que este plan usa (no reescribir)

- **Ejecutor** `service/src/runner.ts`: un `claim` cada `intervalMs` (1 s), un comando a la vez; `defer` reencola a +5 s; `recoverCommands` (`recovery.ts`) al arrancar: `worker.poll|review.poll|worker.stop` vuelven a `pending`, el resto se marca `failed` «resultado incierto tras reinicio» y llama `workerFailure`. Hoy no hay latido: un `checks.run` con `build` de 40 min deja todo lo demás en espera (hallazgo del hito 5).
- **Bandeja** `commands.ts`: `claim(db, workerId)` sin carril; `fail` reintenta hasta 3 salvo tipos `worker.*`/`review.*`, `OrcaError` e `invalid_*`.
- **Orca** `adapters/orca.ts`: `OrcaError {code: timeout|not_running|cli_error}`; hoy `not_running` hace fallar el comando (no espera).
- **Límites**: `correctionCount ≥ 3` abre Decisión (`worker-send.ts`); concurrencia y `defaultProvider` en `config.ts` (`{codex: 2, claude: 2, opencode: 0}` por defecto, `defaultProvider: 'claude'`; `codex: 0` por defecto rompía 75 pruebas que arrancan Codex sin configuración); presupuesto por `spend` (hito 1b/4); reconciliación Meshy al arrancar (hito 4).
- **Capacidades** `repo/capabilities.ts`: estados `ausente|detectado|comprobado|roto`; `unreal_mcp_conflict` ya es `roto`; «Comprobar ahora» en el panel sin ruta real detrás (muestra «Detectado · sin comprobar»).
- **Comprobaciones** (hito 5): `checks/{select,run,gate,cpp,blueprint,asset,map,umg,build,png}.ts`, `editor/queue.ts` (`withEditor`, reserva `editor/<proyecto>`), `adapters/unreal-build.ts` (`buildEditorTarget`, `buildCookRun`), capturas en `<dataDir>/artifacts/tests/<testRunId>/`.
- **Cierre** (hito 6): `integrate.run`, `finalize.run`, `task.continue`, `director.paused` respetado por el planificador, atribución y archivo por tarea.
- **Panel**: ⌘K (`shell/CommandMenu.tsx`) ya tiene Leyenda, Ver guía, Indexar y Pausar/Reanudar funcionando; `DecisionOptions.tsx` pinta `AreaPictogram` en cada opción (de ahí el cubo repetido); `Entregas.tsx` con nombres, filtro y orden (hito 6); e2e en `panel/e2e/{produccion,pruebas,rendimiento,vistas,visual}.spec.ts`; tour y leyenda del hito 9.
- **Pruebas intermitentes**: `npm test` en `main` ha dado 212/213, 350/352 (fixture ignorada, ya corregida) y 399/400 en una pasada y verde en la siguiente; el revisor del hito 5 reejecutó `watcher-recovery.test.ts` en aislamiento. Candidatas: las que usan temporizadores (`commands`, `runner`, `runner-lifecycle`, `scheduler-runner`, `worker-claude`, `worker-decisions`, `worker-recovery`, `cli-stop`, `robustness`, `start`).

## Global Constraints

- Separar y mostrar como estados distintos: fallo de conexión (`orca: not_running`, servicio caído), ejecución fallida, cancelación solicitada, cancelación confirmada, capacidad ausente; cada uno con su evento y su texto corto en el panel.
- Límites configurables en `config.json` con valores por defecto: 3 ciclos de corrección por run (existe), concurrencia por proveedor (existe; **por defecto `{claude: 2, codex: 0, opencode: 0}`**), presupuestos; al agotarse, Decisión con evidencia, nunca bucle.
- Reintentos solo tras reconciliar con el proveedor (Meshy, Orca, editor): nunca repetir a ciegas una creación remota que pudo cobrarse.
- Motion solo en cambios de estado; reduced-motion respetado; nada decorativo.
- `npm test` **tres veces seguidas** en verde en `main` (prueba de intermitencia), `npm run test:panel`, `npm run build`, e2e y skillsmith ≥ 95 al cerrar; `docs/auditoria-7-cierre.md` y `docs/estado-entregas.md` completos.
- Lo demás, como los hitos anteriores (cero dependencias en el servicio, ≤ 200 líneas, token, LF, copy en español, `.kratos-brief.md` fuera de los commits, sin push ni merge).

## Review Focus

1. El servicio se reinicia con un `worker.poll` en marcha: al arrancar, los comandos `running` sin latido vuelven a `pending` una vez y se registran como `recovered`; un `checks.run` de larga duración se marca `failed` con «resultado incierto» y la tarea vuelve a `probando` con motivo; nunca se duplica un worktree. (Tarea 1.)
2. Orca no está abierto: `kratos doctor` lo dice, Capacidades marca `roto` con la acción «Abrir Orca» (`orca open`), y los `worker.start` se **difieren** (`deferred`, reintento cada 30 s hasta 30 min) en vez de fallar tres veces. (Tarea 1.)
3. Captura de regresión visual con variación de render (tiempo, exposición): tolerancia configurable (`config.json: visualTolerance`, defecto 2 %) y captura tras 2 s de estabilización; un cambio real de UI (barra de vida de 100 a 50) sí falla. (Tarea 3.)
4. Paquete que arranca pero se cierra a los 5 s: el recorrido registra el log y el `TestRun build` falla con la causa («el proceso terminó a los 5 s con código N»), no aprueba por «salida cero». (Tarea 3.)
5. `Ctrl+K` con el foco dentro de un `textarea` o `input`: no abre la paleta mientras se escribe; `Esc` cierra y devuelve el foco. (Tarea 4.)
6. Un `build` de 40 min en el carril largo: los `worker.poll` del carril normal siguen cada segundo y el panel sigue vivo; dos comandos largos a la vez se serializan por la reserva del editor, no por el carril. (Tarea 1.)

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `service/src/commands.ts`, `runner.ts`, `recovery.ts` (ampliar), `migrations.ts` (`migrateLanes`: `commands.lane text not null default 'normal'`, `commands.heartbeat_at text`) | Dos carriles, latido, recuperación por latido |
| `service/src/handlers/worker-start.ts` (ampliar) | `OrcaError not_running` → `deferred` con reintento |
| `service/src/doctor.ts`, `cli.ts` (`doctor`) | Diagnóstico en tabla; `POST /capabilities/:id/check` para «Comprobar ahora» |
| `service/src/log.ts` | JSONL en `<dataDir>/logs/<fecha>.jsonl` con rotación diaria y 14 días |
| `service/src/config.ts` (ampliar) | Defectos nuevos y `visualTolerance`, `limits` |
| `service/src/checks/build.ts` (ampliar), `service/src/checks/visual.ts`, `service/unreal/kratos_walkthrough.py` o `-ExecCmds` guionado | Recorrido guionado, regresión visual |
| `panel/src/shell/CommandMenu.tsx`, `components/DecisionOptions.tsx`, `components/TaskRow.tsx`, `views/Capacidades.tsx`, `views/Produccion.tsx` | Acabado: ⌘K con foco, opciones de Decisión sin icono repetido, estados de fallo, «Esperando reserva», skills por agente |
| `tests/service/{lanes,heartbeat,doctor,orca-down,visual,build-walkthrough}.test.ts`, pruebas intermitentes corregidas | Pruebas |
| `docs/auditoria-7-cierre.md`, `docs/estado-entregas.md`, `docs/recorrido-mvp.md`, `README.md`, `docs/capturas-7/` | Cierre |

---

### Task 1: Fiabilidad

**Files:** Modify `service/src/commands.ts`, `runner.ts`, `recovery.ts`, `migrations.ts`, `config.ts`, `handlers/worker-start.ts`, `handlers/checks.ts`, `repo/capabilities.ts`, `routes/capabilities.ts`; Create `service/src/doctor.ts`, `service/src/log.ts`; Modify `skills/kratos/scripts/kratos.ts` (`doctor`); Test `tests/service/{lanes,heartbeat,doctor,orca-down}.test.ts` y las intermitentes.

- **Dos carriles**: `claim(db, workerId, lane: 'normal'|'long')`; `lane` se decide al encolar por tipo (`checks.run` con `cpp|build|map|umg` y `asset.migrate` → `long`; el resto `normal`). El runner mantiene un comando activo por carril (dos bucles con el mismo `tick`, uno por carril). Review Focus 6. Prueba: un handler `long` que tarda 3 s no retrasa un `normal` de 10 ms.
- **Latido**: el runner actualiza `heartbeat_at` cada 5 s mientras un comando corre; `recoverCommands` considera «sin latido» los `running` con `heartbeat_at` de más de 60 s; los de tipo `checks.run`/`integrate.run`/`finalize.run` se marcan `failed` «resultado incierto tras reinicio» y la tarea vuelve al estado anterior con motivo (Review Focus 1).
- **Orca caído**: `createOrca` expone `isRunning()` (un `orca open --json` de solo lectura con tiempo máximo 5 s, o `not_running` del primer comando); `worker.start`, `review.start`, `task.continue` devuelven `{deferred, reason: 'Orca no está abierto'}` con `notBefore` +30 s hasta 30 min, luego Decisión «Abrir Orca / Cancelar» (Review Focus 2). Capacidades: `orca` con estado `roto` y acción «Abrir Orca» (`POST /capabilities/orca/check` ejecuta `orca open`).
- **Codex apagado por defecto**: `concurrency` por defecto `{claude: 2, codex: 0, opencode: 0}`; las pruebas que arrancan Codex pasan a fijar `concurrency` explícita en su fixture (ajustar `tests/service/worker-fixture.ts` y las que lo usen; es trabajo mecánico, no cambia contratos).
- **Estados de fallo separados**: eventos `command.failed {kind: 'connection'|'execution'|'cancel_requested'|'cancel_confirmed'|'capability_missing'}` y texto corto por `kind` en la fila y el Sheet (sin icono nuevo salvo que pase la prueba de unicidad).
- `kratos doctor --data .kratos`: tabla Node, Orca, motor, plugins MCP y Fab, Launcher, Meshy, Blender, Git, token y puerto del servicio, carriles y último latido; salida también por `GET /doctor`. «Comprobar ahora» de Capacidades llama a `POST /capabilities/:id/check` (ejecuta la comprobación real: versión de Node, `orca open`, `UnrealEditor-Cmd -version`, `git --version`, `MESHY_API_KEY` con `balance()`) y guarda `comprobado|roto` con fecha.
- **Log JSONL**: `log.ts` escribe cada evento de `appendEvent` y cada comando en `<dataDir>/logs/YYYY-MM-DD.jsonl`, rota a medianoche y borra más de 14 días; sin bloquear (append síncrono de una línea).
- **Intermitencias**: ejecutar `npm test` 5 veces; para cada prueba que falle al menos una vez, encontrar la causa (temporizadores reales, puertos fijos, orden de archivos, estado compartido) y corregirla con reloj inyectado o espera por condición; anotar la lista en `docs/auditoria-7-cierre.md`.

- [ ] Pruebas por cada punto. Commit `feat: fiabilidad, carriles, latido, doctor y log`.

### Task 2: Pruebas e2e que faltan

**Files:** Create `panel/e2e/{sse,auth,teclado,decisiones}.spec.ts`.

- SSE reconecta tras `kratos stop`/`start` sin duplicar eventos (prueba 3); 401 sin token y con token caducado tras reinicio (prueba 15); teclado recorre Producción, Sheet, Catálogo y Decisiones (prueba 24); Decisión resuelta sin repetir contexto y Decisión caducada regenerada (prueba 20); `?` y ⌘K con el foco en un `textarea` (Review Focus 5).
- [ ] Commit `test: e2e de reconexión, token, teclado y decisiones`.

### Task 3: Entrega y calidad del juego

**Files:** Modify `service/src/checks/build.ts`; Create `service/src/checks/visual.ts`, `service/unreal/kratos_walkthrough.py` (o secuencia `-ExecCmds`), `tests/service/{visual,build-walkthrough}.test.ts`.

- `build` completo: `buildCookRun` → arranque del ejecutable fuera del editor con `-ExecCmds` guionado (entrada, carga del mapa, 3 acciones por consola, `HighResShot`, salida) y tiempo mínimo de vida de 20 s; si el proceso termina antes, `failed` con «el proceso terminó a los N s con código M» (Review Focus 4); log y capturas como artefactos con `provenance.label`.
- Regresión visual: `visual.ts` compara cada captura de `umg`/`build`/`map` con su línea base en `<juego>/docs/baseline/<nombre>.png` usando `pixelDiffRatio`; sin línea base → la crea y `skipped` «línea base creada»; diferencia > `visualTolerance` → `failed` con la imagen de diferencia (PNG escrito con el codificador mínimo); espera de estabilización de 2 s antes de capturar (Review Focus 3).
- Insights: trace de 30 s en PIE (`-trace=cpu,gpu,memory -tracefile=`) guardado como artefacto `report` si el motor lo permite; sin resumen automático (documentado como siguiente paso). Gauntlet queda documentado, no integrado.
- [ ] Commit `feat: entrega fuera del editor con recorrido y regresión visual`.

### Task 4: Acabado del panel

**Files:** Modify `panel/src/shell/CommandMenu.tsx`, `components/DecisionOptions.tsx`, `components/TaskRow.tsx`, `views/Capacidades.tsx`, `views/Produccion.tsx`, `views/TaskSheet.tsx`; Test Vitest y e2e; capturas `docs/capturas-7/`.

- **Opciones de Decisión**: fuera el `AreaPictogram` repetido en cada opción; una opción lleva miniatura solo si tiene `thumbnail` propio (catálogo, Meshy); si no, es una tarjeta de texto con etiqueta corta (≤ 4 palabras), descripción (≤ 14) y, como único acento, el borde de la opción recomendada. Prueba de unicidad: dos opciones sin miniatura no muestran icono.
- ⌘K / Ctrl+K: no abre con el foco en `textarea`/`input` (Review Focus 5); busca tareas por título y abre el Sheet; acciones «Nueva petición», «Indexar», «Pausar/Reanudar», «Lanzar pruebas», «Integrar», «Cerrar»; `Esc` devuelve el foco.
- Fila de Producción: texto corto «Esperando reserva» / «Depende de …» / «Director en pausa» desde `waitReason` (pendiente del hito 3), estados de fallo separados; Capacidades: skills confirmadas por agente (`KRATOS_SKILLS`) en el tooltip del avatar.
- Pase de motion: `find-animation-opportunities` → `animate` solo en cambios de estado (tarjeta que cambia de grupo, franja del director, fila de prueba que pasa a `passed`) → `review-animations`; `/impeccable harden` (desbordes, textos largos, errores de red) y `polish`; `web-design-guidelines` sin errores de accesibilidad; `ux-heuristics` ≥ 9/10; capturas finales de las 10 vistas a 1366 y 1920 en `docs/capturas-7/`.
- [ ] Commit `feat: acabado del panel`.

### Task 5: Cierre del MVP

**Files:** Create `docs/auditoria-7-cierre.md`, `docs/recorrido-mvp.md`; Modify `docs/estado-entregas.md`, `README.md`, `skills/kratos/SKILL.md` si hace falta.

- Recorrido completo real en `KratosFabTest` con workers Claude: petición → tareas → worker → ciclo UMG → pruebas → integración → DONE → continuación; con un asset del catálogo migrado y usado; tiempos por etapa en `docs/recorrido-mvp.md`.
- `docs/estado-entregas.md` con la tabla de los hitos 0-9 (5b pausado) y las 35 pruebas del plan v2 §7 (pasada / no pasada / no aplicable, con evidencia); `docs/auditoria-7-cierre.md` (puertas, hallazgos, intermitencias corregidas, pendientes: prueba de los cinco segundos con una persona nueva, nivel 2 de Fab con clics, Gauntlet, Insights resumido, hito 5b); README con instalación (`junction` de la skill, Node ≥ 25, Orca, Unreal 5.8) y uso de `/kratos`; skillsmith ≥ 95.
- [ ] Commit `docs: cierre del MVP de Kratos`.

---

## Self-review

- Cobertura: plan v1 §11 fiabilidad → Tarea 1; §3.8 build/regresión → Tarea 3; §2.5-2.6 acabado y motion → Tarea 4; pruebas 3, 9, 14, 15-18, 20, 24, 25 → Tareas 2-5.
- Review Focus 1, 2, 6 → Tarea 1; 3, 4 → Tarea 3; 5 → Tareas 2 y 4.
- Diferencias respecto a la versión anterior y por qué: dos carriles en el ejecutor (hallazgo del hito 5: un build bloqueaba todo); Codex apagado por defecto (regla del usuario) arreglando las fixtures en vez de dejar `codex: 2`; regresión visual con el decodificador PNG propio en vez de Screenshot Comparison; Insights solo como trace; pruebas intermitentes como entregable explícito; opciones de Decisión sin icono repetido (hallazgo de Fable en el hito 4); «Comprobar ahora» con ruta real.
- Fuera, como dice el plan v2 §9: multiusuario, más hosts/GPU, streaming del editor, modo claro, Gauntlet integrado, hito 5b.

---

## CORRECCIÓN 3 del usuario (visor de assets a detalle) — 2026-10-23

Petición literal: «si le doy click a un asset que me lo agrande en el medio para verlo a detalle no la imagen pequeña y ya». Hoy las tarjetas de Entregas (`views/Entregas.tsx` → `Card`/`Preview`), Catálogo (`views/Catalogo.tsx` → `Preview`) y las miniaturas de opciones de Decisión (`components/DecisionOptions.tsx` → `Thumbnail`) solo muestran una miniatura 4:3 y el clic no hace nada. Se añade a la Tarea 4 (acabado del panel) y se cierra antes del commit de la Tarea 5.

**Files:** Create `panel/src/components/AssetViewer.tsx` (+ `AssetViewer.test.tsx`); Modify `views/Entregas.tsx`, `views/Catalogo.tsx`, `components/DecisionOptions.tsx`; e2e `panel/e2e/visor.spec.ts`; capturas `docs/capturas-7/visor-entregas-1366.png`, `visor-entregas-1920.png`, `visor-catalogo-1920.png`.

- **Un solo componente** `AssetViewer` sobre el `Dialog` de shadcn que ya existe en `components/ui/dialog.tsx` (nada nuevo de npm). Centrado, fondo oscurecido, hasta `90vw × 85vh`. Título = nombre derivado (`artifactName`, o `entry.name` en Catálogo); debajo, en texto discreto, nombre de archivo, ruta, tarea y licencia (lo que hoy va en el `title` de la tarjeta). Nunca el nombre de archivo ni un uuid como título.
- **Contenido por tipo**: imagen (`png|jpe?g|webp`) a su resolución natural con `object-contain` dentro del cuadro, sin recorte; modelo (`glb|gltf`) con `GlbViewer` ocupando el cuadro, `camera-controls`; registros e informes (`log|txt|md|json`) con el texto completo en un `pre` con scroll y los errores resaltados con `errorLines`; cualquier otro tipo, el glifo del artefacto y un botón «Abrir original». Los expirados de Meshy siguen mostrando `MeshyExpired`.
- **Abrir y cerrar**: la miniatura es un `button` con `aria-label="Ver {nombre} a tamaño completo"`; `Esc`, clic fuera y botón cierran; el foco vuelve a la tarjeta que lo abrió. Flechas ← → y botones laterales pasan al asset anterior/siguiente **del listado tal y como está filtrado y ordenado**. Botón «Abrir original» (misma URL con token que ya sirve `useArtifactSrc`/`useAuthedSrc`). La apertura usa el `Dialog` (su animación), no `withViewTransition`.
- En Catálogo, los botones de acción de la tarjeta (preparar, etc.) siguen igual; solo la miniatura abre el visor. En Decisiones, la miniatura de una opción abre el visor **sin elegir la opción**; elegir sigue siendo el clic en la tarjeta de texto.
- **Pruebas**: Vitest: clic en la miniatura abre el diálogo con la imagen a `object-contain` y el nombre derivado como título; `Esc` cierra y el foco vuelve; → cambia al siguiente del listado filtrado; en Decisiones abrir el visor no llama a `onChoose`. Playwright: abrir un asset en Entregas y otro en Catálogo, comprobar tamaño del cuadro ≥ 60 % del viewport a 1366 y 1920. Capturas con el visor abierto en `docs/capturas-7/`.
- Reglas de siempre: `useAction` para acciones, ≤ 200 líneas por archivo, sin colores a mano, copy en español, sin dependencias nuevas, prueba de unicidad de glifos si entra alguno nuevo.
- [ ] Commit `feat: visor de assets a detalle` (antes del commit de la Tarea 5).
