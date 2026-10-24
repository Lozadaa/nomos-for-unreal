# Estado de las entregas

Actualizado el 2026-10-23 en `hito7-acabado` (sobre `main@eed03ed` con los hitos 0-6, 8 y 9). El hito 7 cierra el MVP en esta rama, sin push ni merge. Las cifras de hitos anteriores son evidencia histórica; las del hito 7 están en [su auditoría](auditoria-7-cierre.md) y [el recorrido](recorrido-mvp.md).

| Hito | Estado | Evidencia |
|---|---|---|
| 0 · Escucha | En `main` | `docs/aceptacion-hito0.md` (aceptación real con Claude Code y Monitor) |
| 1a · Diseño | En `main`; su dirección visual quedó **sustituida** por el hito 8 | `docs/diseno/`, `docs/diseno-visual.md` |
| 1b · Servicio y shell | En `main` | `tests/service/`, `kratos seed`, rutas con token |
| 2 · Primer worker | En `main` (aceptación real con Codex, anterior a la regla «ningún Codex») | `docs/aceptacion-hito2.md` |
| 3 · Varios workers | En `main` (aceptación completa con workers Claude) | `docs/aceptacion-hito3.md` |
| 4 · Catálogo y Fab | En `main` | `docs/aceptacion-hito4.md`, `docs/capturas-4/` |
| 5 · Unreal, UI y QA | En `main` | `docs/aceptacion-hito5.md`, `docs/capturas-5/` |
| 5b · Personajes y animación | **Hecho en la rama `hito5b-personajes`** (sin fusionar; falta el DONE de la aceptación (a), ver informe) | `docs/superpowers/plans/2026-10-22-hito5b-personajes-animacion.md`, `docs/aceptacion-hito5b.md` |
| 6 · Integración y cierre | En `main` | `docs/aceptacion-hito6.md`, `docs/capturas-6/` |
| 7 · Endurecimiento y acabado | Tareas 1-5 en `hito7-acabado` (sin push ni merge) | `docs/auditoria-7-cierre.md`, `docs/recorrido-mvp.md`, `docs/capturas-7/`, sección «Hito 7» |
| 8 · Interfaz viva | En `main` | `docs/auditoria-8-cierre.md`, `docs/medicion-8.json`, `docs/capturas-8/` |
| 9 · Lenguaje visual | En `main` | `docs/auditoria-9-cierre.md`, `docs/capturas-9/`, `docs/diseno/glifos.md` |


## Hito 7 — endurecimiento y acabado (cierre del MVP)

**Hecho** (rama `hito7-acabado`, commits `7dfcf9d`, `b14cc4d`, `d036b64`, `fcb0fb8`, `9d807d4` y el de cierre): ejecutor con dos carriles (el largo para editor y empaquetado), latido cada 5 s y recuperación por dueño muerto o 60 s sin latido; Orca cerrado → arranques diferidos cada 30 s y Decisión «Abrir Orca / Cancelar» a los 30 min; Codex apagado por defecto; estados de fallo separados (conexión, ejecución, cancelación solicitada y confirmada, capacidad ausente); `kratos doctor` y `GET /doctor`; «Comprobar ahora» real y «Abrir Orca»; log JSONL diario con 14 días; `limits.corrections` y `visualTolerance`; intermitencias con nombre y causa corregidas; e2e de reconexión, token, teclado y decisiones; entrega fuera del editor con recorrido guionado, 20 s de vida mínima, error fatal y errores del log del juego, log y traza opcional de Insights como artefactos; regresión visual con línea base en el juego; opciones de Decisión de texto, ⌘K con acciones de la tarea, motivo corto en la fila, skills por agente; visor de assets a detalle (corrección 3 del usuario: Entregas, Catálogo y opciones de Decisión); recorrido completo real en KratosFabTest y lo que ese recorrido sacó a la luz: reenvío por terminal nuevo cuando Orca bloquea el envío, revisión de código encadenada tras el QA visual, detector de tareas paradas (`kratos doctor` y Decisión), diff de revisión sin lo generado por Unreal ni el contenido de `Config/` sin seguir, archivos sin seguir idénticos sustituidos al integrar y los locales del usuario fuera de los commits.

**Verificado** en el cierre: ver puertas en [la auditoría](auditoria-7-cierre.md) y tiempos en [el recorrido](recorrido-mvp.md).

```
node skills/kratos/scripts/kratos.ts doctor --data <juego>/.kratos
node panel/scripts/capturas-7.ts            # las 10 vistas a 1366 y 1920 → docs/capturas-7/
```

## Las 35 pruebas de aceptación (plan v1 §13 y plan v2 §7)

«Pasada» = ejecutada con resultado correcto y evidencia escrita; «Parcial» = solo una parte o solo con fakes; «No pasada» = no ejecutada o pendiente; «N/A» = fuera del alcance acordado.

| # | Prueba | Estado | Evidencia |
|---|---|---|---|
| 1 | Dos `/kratos`: un servicio y un director | Pasada | `aceptacion-hito0.md` «Prueba 1» |
| 2 | Web → sesión original → respuesta | Pasada | `aceptacion-hito0.md` «Prueba 2» |
| 3 | Expirar vigilante, reconectar o reiniciar conserva pendientes sin duplicar | Pasada | `aceptacion-hito0.md` «Prueba 3»; hito 7 `panel/e2e/sse.spec.ts` (stop/start real, mismas filas, SSE sin seq repetidos) |
| 4 | Cerrar Claude cambia el estado y conserva la bandeja | Pasada | `aceptacion-hito0.md` «Prueba 4» |
| 5 | Tareas hijas, workers y worktrees con atribución | Pasada | `aceptacion-hito6.md` (atribución por rol); recorrido del hito 7 |
| 6 | Mismo widget: uno escribe, el otro espera | Pasada | `aceptacion-hito3.md` (dos tareas sobre `WBP_HUD.uasset`, «Esperando reserva») |
| 7 | Pruebas fallidas no llegan a DONE y vuelven al responsable | Pasada | `aceptacion-hito5.md` §2 |
| 8 | Captura, modelo y prueba identifican run y revisión | Pasada | `aceptacion-hito5.md` §3 |
| 9 | Job de Meshy sobrevive a la recarga y se conservan sus archivos | Parcial | `aceptacion-hito4.md` §4 (copia propia del GLB); reconciliación al arrancar con fakes (`tests/service/asset-meshy.test.ts`); no se recargó el panel durante un job real |
| 10 | La integración detecta cambios en la rama destino y recomprueba | Pasada | `aceptacion-hito6.md` paso 4 |
| 11 | Error al preservar o parar impide retirar el worktree | Parcial | pruebas del finalizador (`finalize.test.ts`: ENOSPC y archivos en uso); en real solo el caso feliz |
| 12 | DONE retira el workspace sin perder conversación, autores, commits ni pruebas | Pasada | `aceptacion-hito6.md` paso 3; recorrido del hito 7 |
| 13 | «Pídele al responsable que ajuste esto» crea continuación con contexto | Pasada | `aceptacion-hito6.md` pasos 4-5; recorrido del hito 7 |
| 14 | El paquete se ejecuta fuera del editor y su recorrido queda registrado | Pasada | hito 7: ejecutable empaquetado de KratosFabTest con recorrido guionado, captura y log como artefactos (88 s; `quit` temprano → fallo 777003); `auditoria-7-cierre.md` |
| 15 | Sin token → 401; token de un arranque anterior → 401 | Pasada | `aceptacion-hito0.md`; hito 7 `panel/e2e/auth.spec.ts` y `sse.spec.ts` (el panel dice «Sesión caducada») |
| 16 | `kratos seed` deja el panel navegable sin Unreal, Meshy ni Codex; e2e sobre la semilla | Pasada | `panel/e2e/global-setup.ts`; Playwright del hito 7 |
| 17 | 1366×768: formulario de nueva tarea sin scroll, sin desplegables cortados | Parcial | el compositor se ve entero a 1366×768 (`capturas-7/produccion-7-1366.png`); no se midió el formulario desplegado en este hito |
| 18 | Estados reproducibles desde `/estilo` y sin errores de accesibilidad | Pasada | `/estilo` (`capturas-7/estilo-7-*`); `web-design-guidelines` sobre lo tocado en el hito 7 sin errores pendientes |
| 19 | Presupuesto de Meshy agotado → Decisión con el gasto, sin job | Pasada | `aceptacion-hito4.md` §4 |
| 20 | Resolver una Decisión queda registrado y no repite contexto | Pasada | hito 7 `panel/e2e/decisiones.spec.ts` (una sola `decision.resolved`, ninguna abierta; caducada → regenerada) |
| 21 | La franja distingue «listener activo» de «Kratos confirmó» | Pasada | `aceptacion-hito0.md` «Prueba 21» |
| 22 | Worker UMG carga las skills y las reporta en su primer evento | Pasada | `aceptacion-hito5.md` (skills confirmadas en `run.started`); recorrido del hito 7 |
| 23 | Visor GLB con modelo de la semilla y de Meshy | Parcial | e2e en Chromium (`vistas.spec.ts`); Firefox excluido; GLB de Meshy en `aceptacion-hito4.md` |
| 24 | Kanban, Drawer y Catálogo con teclado y foco visible | Pasada | hito 7 `panel/e2e/teclado.spec.ts` (Chromium y Firefox) |
| 25 | `/kratos` pasa skillsmith ≥ 95 y sus evals | Pasada | 98/100 (`docs/skillsmith-hito7.txt`) |
| 26 | Personajes: catálogo propio, luego CC0; Meshy solo tras Decisión | Pasada | `aceptacion-hito4.md` §1 |
| 27 | Licencia desconocida → Decisión en vez de importar | Pasada | `aceptacion-hito4.md` §5 |
| 28 | UMG no se cierra sin captura en PIE e informe de `ue-visual-qa` | Pasada | `aceptacion-hito5.md` §1 y §2 |
| 29 | Un solo MCP de Unreal; otro se marca como conflicto | Pasada | `aceptacion-hito5.md` §4 |
| 30 | Motor anterior a 5.8: MetaHuman ausente | Parcial | en el equipo solo hay 5.8.3. Capacidades «MetaHuman» = plugin MetaHumanCharacter + `IK_MH_IKRig` + ≥ 1 preset indexado; sin el plugin o sin presets sale «ausente» con el motivo (`tests/service/capabilities-metahuman.test.ts`). En 5.8.3 real: detectado con Hudson y Emory |
| 31 | Asset de Fab de otro proyecto o caché se importa sin la pestaña Fab | Pasada | `aceptacion-hito4.md` §2; hito 7: raqueta de CrazyPadel migrada a KratosFabTest en 36 s (recorrido) |
| 32 | Asset comprado sin descargar → «Descargas pendientes» y detección | Parcial | `aceptacion-hito4.md` §3 (detector sobre el log real; sin descarga nueva con clics) |
| 33 | Catálogo completo desde `listings_v1.db` con `is_ai_forbidden` | Parcial | indexador con `listings_v1.db` (`tests/service/indexer.test.ts`); la base de este equipo está vacía |
| 34 | Exportación «Custom (socket port)» del Launcher termina importada | No pasada | no implementada en el MVP |
| 35 | Nivel 3 apagado por defecto; activarlo exige Decisión | Parcial | apagado por defecto (no hay nivel 3 en el producto); la Decisión de activación no existe |

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

## Hito 5b — personajes y animación

**Hecho** (rama `hito5b-personajes`, sin fusionar): plantillas del motor en el catálogo (fuente `engine`: maniquíes UE5, animaciones de combate, maniquí UE4) con migración que conserva `/Game/<Mount>`; `asset candidates` (Decisión con hasta tres personajes, miniatura, origen, licencia y coste; elegir encola las migraciones y `character.setup`); `character.setup` con retarget por lotes por script (IK Rig autogenerado, raíz del root motion en `root`, «Retarget a mano» si falta una cadena principal en cualquiera de los dos lados) y la comprobación `animation` (PIE a 1280×720 y 1920×1080 en el 0, 50 y 90 %, deformación, pose frente al original, malla estirada hacia la raíz, prendas que siguen al cuerpo, vídeo de dos ángulos con ffmpeg o zip de fotogramas, falla si el clip no se mueve); MetaHuman por capacidad (presets de Megascans migrados sin pisar el Common, Decisión de LiveLink, creación por script asistida porque el auto-rig pide la nube); Cascadeur solo cuando hace falta (`--run-python-code` sin ventana; la licencia gratuita no exporta FBX y se dice); Capacidades MetaHuman, Retarget IK, Vídeo (ffmpeg) y Cascadeur; visor de vídeo en Entregas; skill «Personajes y animación», `references/personajes.md` y eval 09. Aceptación real en `docs/aceptacion-hito5b.md` y vídeos en `docs/capturas-5b/`. Falta el DONE de la aceptación (a), que depende de una decisión del usuario sobre meter 1,6 GB de binarios en git.

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
