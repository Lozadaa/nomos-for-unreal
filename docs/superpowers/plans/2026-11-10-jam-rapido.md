# Jam rápido · Nomos listo para la game jam y juego demo «Candela»

> **For agentic workers:** REQUIRED SUB-SKILL: usa superpowers:executing-plans (tú implementas, tarea a tarea) y
> superpowers:test-driven-development en cada tarea del servicio. Los pasos llevan casilla (`- [ ]`).
> Worktree: `C:/Users/richa/Documents/nomos-wt/jam-rapido`, rama `jam-rapido` desde `main` 4e3fa41. Este plan y
> `docs/demo/candela.md` están sin commitear en ese worktree: commitéalos en tu primer commit.

**Goal:** que Nomos, con el modo rápido como único modo, saque un juego de Unreal 5.9 sin atascos, sincronizado entre
varias personas por Git, y demostrarlo con el juego «Candela» medido contra el mismo encargo sin Nomos.

**Architecture:** no se añade ninguna pieza nueva al servicio: se cierran los cuatro puntos donde hoy una tarea se queda
parada sin aviso, el motor se elige por proyecto y el modo rápido pasa a ser el valor por defecto. Lo que acelera de
verdad es conocimiento empaquetado: una tabla de camino corto que viaja en el brief y un proyecto semilla que ya trae
resuelto lo que cada juego repetía. El equipo sigue yendo por la rama `nomos/equipo` y por `main`; solo se enriquece lo
que cada tarjeta cuenta y `main` se mantiene al día solo.

**Tech Stack:** Node 25 (`.ts` sin compilar, `node:test`, `node:sqlite`, cero dependencias), panel React en `panel/`,
Unreal Engine 5.9 MegaJam Preview (C++ y Python del editor), Git y Git LFS, PowerShell para compilar y empaquetar.

**Spec:** `docs/demo/candela.md` (encargo único, rúbrica y umbral). Decisiones del usuario del 2026-11-10, literales o
elegidas por él en preguntas cerradas:
- «el modo rápido es el que me interesa de hecho lo haría como el unico modo».
- «conectado […] con los otros que lo estan usando para saber si todo va marchando quizás a través de git […] no en
  tiempo real pero si full sync».
- «iterar lo menos posible y que seamos lo mas inteligentes eligiendo las herramientas para usar en unreal, evitando
  caminos largos».
- «con el mismo prompt con harness y sin harness se vea esa GRAN diferencia de calidad, rapidez y reusltado».
- La jam empieza en menos de 3 días. El juego demo es Candela.
- Disco: Opus puede vaciar la Papelera y borrar solo `Intermediate`, `DerivedDataCache` y `Saved/StagedBuilds` de
  `Unreal Projects/CrazyPadel` y `Unreal Projects/Herbalist`. Nada más.

## Global Constraints

- Ponytail full: el diff más corto que funciona. Sin dependencias npm nuevas.
- Un commit por tarea, en la rama `jam-rapido`. Al cerrar cada fase con la suite en verde: `git merge --no-ff jam-rapido`
  en `main` (checkout `C:/Users/richa/Documents/nomos`). **Nunca `git push`**: lo hace el usuario.
- `main` tiene tres archivos modificados por el usuario sin commitear (`service/src/handlers/worker-launch.ts`,
  `tests/fakes/orca.ts`, `tests/service/worker-launch.test.ts`): no los commitees, no los descartes. Si un merge choca
  con ellos, para y díselo.
- `~/.claude/skills/nomos` es un enlace a `main`: lo que fusionas en `main` es lo que usan los juegos desde ese momento.
- Pruebas: `npm test` (≈ 3 min, 859 pruebas), `npm run test:panel`, `npm run build`. Intermitentes conocidos, que pasan
  solos: `graph`, `worker-recovery`, `editor-caliente`, `orca-create`, `orca-final`. Si falla uno de esos, repítelo solo
  antes de investigar.
- Borrar: solo lo autorizado arriba y lo que tú mismo creas en esta sesión. Cualquier otra cosa, pregunta.
- Unreal: una sola instancia pesada a la vez (31 GB de RAM, ~7 libres). Compilar y empaquetar desde PowerShell, nunca
  desde bash (la ruta con espacios hacia `Build.bat` falla).
- Motor de la jam: `C:\Program Files\Epic Games\UE_5.9`. El 5.8 sigue instalado.
- Textos para personas (skills, briefs, panel, guías): reglas de «Escribir corto» de `skills/nomos/SKILL.md`.
- Si una tarea pasa del doble de su presupuesto, aplica su recorte y sigue; anótalo en el informe.
- No dejes sesiones, vigilantes ni servicios de Nomos encendidos al terminar.

## Hechos comprobados (no los investigues de nuevo)

| Hecho | Dónde |
|---|---|
| Tras pasar las comprobaciones, `advance()` mueve la tarea a `integrando` y nadie encola la integración; espera al barrido de atascos (10 min) y a la Decisión automática (1-5 min) | `service/src/handlers/checks.ts:58-63`; llamadas a `requestIntegration` solo en `review-finish.ts:86`, `routes/approvals.ts:71`, `stall.ts:110` |
| Un worker `claude -p` que termina sin `NOMOS_DONE` sigue `running`: `asksForInput` exige que la última línea sea pregunta o prompt | `handlers/worker-poll.ts:56-58`, `handlers/worker-launch.ts:44-47`, `stall.ts:33` |
| `lastOutputAt` se escribe y nadie lo lee: un worker vivo y mudo no se detecta hasta los 240 min | `handlers/worker-poll.ts:70`, `config.ts:63` |
| En la 5.ª vuelta un `NOMOS_REVIEW` dentro de un bloque de código no se leyó en 31 min | `Escritorio/Metras-videos/Metras-comparativa.md` §8; analizador en `handlers/worker-markers.ts` (`markerFence`) |
| El motor por defecto es UE_5.8, escrito a mano en dos sitios | `adapters/unreal-cmd.ts:6`, `repo/capabilities.ts:51`; lo pisa `unrealPath` (`catalog/paths.ts:27`) |
| Las skills solo se nombran en el brief; si el worker no confirma una con `NOMOS_SKILLS`, sale `worker.skills_missing` | `skills.ts`, `brief.ts:17-24`, `handlers/worker-poll.ts:84-90` |
| Cargar 12 skills por worker hizo la 4.ª vuelta 19 min más lenta que la 3.ª | comparativa §7 |
| `embed` copia 4 skills y no `ue-oficio`; embebido, `acabadoScript()` busca en `<juego>/.claude/skills/ue-oficio` | `embed.ts:10`, `skills-install.ts:9-12`, `checks/acabado.ts:11` |
| La tarjeta de equipo lleva tareas abiertas, reservas, decisiones, build y peticiones; no lo ya hecho ni por dónde va `main` | `team.ts:17-22,117-129` |
| `main` compartido solo se trae al integrar | `handlers/integrate.ts:200-259` |
| Un solo agente con `ue-oficio` hizo las metras en 41 min y con la mejor calidad; H1 (proyecto, tablero, cámara) fueron 17 de esos 41 | comparativa §9 |
| En 5.9 el Python sin renderer no compila materiales; el editor caliente (`-RenderOffscreen`) sí | `caliente.ts:58-59`, nota de Second Brain 2026-11-10 |
| `claude --help` ofrece `--disable-slash-commands` («Disable all skills and commands») y `--bare` | comprobado el 2026-11-10 |

## Review Focus

1. Un compañero con un Nomos más viejo publica una tarjeta sin los campos nuevos: el resto debe verla igual, sin error. Prueba en la tarea 4.2.
2. `main` avanza en el remoto mientras el checkout local tiene cambios sin commitear: no se toca el checkout, solo se avisa. Prueba en la tarea 4.3.
3. Un worker empaqueta 6 minutos sin escribir nada: no se le mata por mudo. Prueba en la tarea 1.2.
4. El `.uproject` pide un motor que no está instalado: `doctor` lo dice con el nombre del motor y no se cae al 5.8 en silencio. Prueba en la tarea 1.4.
5. `nomos nuevo` con un nombre que ya existe o con espacios o tildes: lo rechaza antes de escribir nada. Prueba en la tarea 3.1.

---

## Fase 0 · Preparar (presupuesto: 20 min)

### Tarea 0.1: Sitio en disco y material de referencia

- [ ] **Paso 1:** mide el espacio libre de C y anótalo.
- [ ] **Paso 2:** antes de vaciar la Papelera, busca en ella `Canicas-6` y `Canicas-experimento` (objeto
  `Shell.Application`, `Namespace(10)`). Copia a `C:/Users/richa/Documents/nomos-ref/` solo texto y fuentes:
  de `Canicas-6`, `Source/`, `Config/`, `Scripts/`, `Content/Fuentes/` y `docs/*.md`; de `Canicas-experimento`,
  `medir.py`. Es la referencia de un HUD en UMG por C++, el `UFont` compuesto, la pantalla de carga y la medición de
  tokens que ya funcionaron. Si no están, sigue: las reglas están en `skills/ue-oficio/references/acabado.md` y
  `skills/ue-umg-ui/`.
- [ ] **Paso 3:** vacía la Papelera. Borra `Intermediate`, `DerivedDataCache` y `Saved/StagedBuilds` dentro de
  `Unreal Projects/CrazyPadel` y `Unreal Projects/Herbalist` (también en sus `.nomos/worktrees/*`). Nada más.
- [ ] **Paso 4:** mide otra vez. Con menos de 25 GB libres, las fases 3 y 5 no se ejecutan: haz las demás y dilo en
  el informe con la cifra.
- [ ] **Paso 5:** `npm test` en el worktree. Anota el resultado como línea base.
- [ ] **Paso 6:** commit de este plan y de `docs/demo/candela.md`.

---

## Fase 1 · Nada se queda parado (presupuesto: 3 h)

### Tarea 1.1: Integrar en cuanto pasan las comprobaciones

**Files:** Modify `service/src/handlers/checks.ts` (`advance`). Test: `tests/service/checks-integra.test.ts` (nuevo).

**Interfaces:** Consume `requestIntegration(db, taskId)` de `service/src/routes/task-closing.ts:39`.

- [ ] **Paso 1 (prueba que falla):** tarea en `probando` con la puerta de pruebas en verde y sin tarjeta «Por aprobar»
  abierta → tras `advance()` existe una orden `integrate.run` pendiente para esa tarea. Segunda prueba: con una
  aprobación del usuario pendiente, `advance()` mueve a `integrando` y **no** encola nada.
- [ ] **Paso 2:** ejecútala y mira que falla por la orden que falta.
- [ ] **Paso 3:** en `advance()`, tras `moveTask`, llama a `requestIntegration` con la misma condición que usa
  `afterApproval` en `handlers/review-finish.ts:75-87` para el camino sin comprobaciones. Reutiliza ese predicado; si
  está en línea, extráelo a una función y úsala en los dos sitios.
- [ ] **Paso 4:** las dos pruebas pasan; `npm test` sin fallos nuevos.
- [ ] **Paso 5:** commit `fix(checks): integra al pasar las comprobaciones, sin esperar al barrido`.

### Tarea 1.2: Worker que termina o enmudece sin entregar

**Files:** Modify `service/src/handlers/worker-poll.ts`, `service/src/adapters/process-terminal.ts`, `service/src/config.ts`,
`service/src/server.ts` (lo que devuelve `/status`). Test: `tests/service/worker-mudo.test.ts` (nuevo, con el `claude` falso).

**Interfaces:** Produce en `config.ts`: `silentMinutes(config): {warn: number; act: number}` con valores `{warn: 10, act: 20}`
(`limits.silentWarnMinutes`, `limits.silentActMinutes` en `config.json`). Eventos nuevos: `worker.ended_without_marker`
`{runId, taskId, nudges}` y `worker.silent` `{runId, taskId, minutes}`.

Comportamiento:
- **Proceso terminado sin marca** (`claude -p` salió y no hay `DONE`, `ASK` ni `REVIEW` nuevos): en el mismo sondeo, sin
  esperar los 6 sondeos de reposo, reenvía con la sesión reanudada: «Tu turno terminó sin la marca. Si acabaste, commitea
  y escribe `.nomos-inbox/done.json`. Si no, continúa donde ibas.» Cuenta `metadata.nudges`. Al tercer final sin marca, el
  run pasa a `failed` y la tarea vuelve a `preparada` para un worker nuevo sobre el mismo worktree, una sola vez.
- **Vivo y mudo:** la señal de vida es la fecha más reciente entre `lastOutputAt`, la transcripción de la sesión (la ruta
  ya la resuelve `service/src/transcript.ts`) y el archivo modificado más reciente del worktree. A los 10 min sin vida,
  `worker.silent` una vez. A los 20, solo si no hay ningún proceso de Unreal ni de compilación vivo en la máquina
  (reutiliza la detección de «Unreal ajeno»), mata el árbol del proceso y aplica el mismo reenvío de arriba.
- `nomos status` enseña por worker «sin actividad N min» cuando pase de `warn`.

- [ ] **Paso 1 (pruebas que fallan):** (a) proceso que sale con código 0 sin marca → un `worker.send` con ese texto en el
  siguiente sondeo y `nudges: 1`; (b) tres finales sin marca → run `failed`, tarea `preparada`, evento
  `worker.ended_without_marker`; (c) vivo sin señal 10 min → un solo `worker.silent`; (d) vivo sin señal 20 min con un
  proceso de Unreal vivo → no se mata; (e) lo mismo sin Unreal → se mata y se reenvía.
- [ ] **Paso 2:** ejecútalas y mira que fallan.
- [ ] **Paso 3:** implementa. El reloj entra por parámetro (como `now` en `team.ts`) para no dormir en las pruebas.
- [ ] **Paso 4:** pasan; `npm test`.
- [ ] **Paso 5:** commit `fix(worker): detecta al worker que termina o enmudece sin entregar`.

Recorte: si (d) y (e) pasan de 45 min, deja solo el aviso a los 10 min y el reenvío al terminar sin marca.

### Tarea 1.3: La marca dentro de un bloque de código cuenta

**Files:** Modify `service/src/handlers/worker-markers.ts`. Test: añade casos a `tests/service/worker-markers.test.ts`.

- [ ] **Paso 1:** `git log --oneline --all --grep="fence\|bloque de código\|markerFence" -- service/src/handlers/worker-markers.ts`.
  Si ya está arreglado en `main`, escribe solo la prueba de regresión y cierra la tarea.
- [ ] **Paso 2 (prueba que falla):** salida `` ``` `` / `NOMOS_REVIEW {"approved":true,"note":"ok"}` / `` ``` `` (usa el
  JSON real del brief del revisor, `skills/nomos/references/brief-revisor.md`) → una marca `REVIEW`. Igual para
  `NOMOS_DONE`. Tercera prueba: los ejemplos literales de los briefs (`"summary":"Resumen"`, `"question":"Tu pregunta"` y
  el ejemplo del revisor) dentro de un bloque **no** cuentan.
- [ ] **Paso 3:** acepta la marca dentro de un bloque cuando empieza la línea, su JSON es válido y no es uno de esos
  ejemplos literales.
- [ ] **Paso 4:** pasan; `npm test`.
- [ ] **Paso 5:** commit `fix(markers): lee la marca aunque venga dentro de un bloque de código`.

### Tarea 1.4: El motor lo decide el proyecto

**Files:** Create `service/src/engine-path.ts`. Modify `service/src/catalog/paths.ts`, `service/src/repo/capabilities.ts:51`,
`service/src/doctor.ts`. Test: `tests/service/engine-path.test.ts` (nuevo).

**Interfaces:** Produce
`enginePathFor(uproject: string, opts?: {launcherDat?: string; programFiles?: string}): {cmd: string; version: string} | {missing: string} | null`.
`null` = el `.uproject` no tiene `EngineAssociation` de versión («5.9»); `{missing: '5.9'}` = la pide y no está instalada.

- [ ] **Paso 1 (pruebas que fallan):** con carpetas temporales: (a) `EngineAssociation: "5.9"` y un
  `LauncherInstalled.dat` con `{"InstallationList":[{"AppName":"UE_5.9","InstallLocation":"<tmp>/UE_5.9"}]}` → `cmd` acaba
  en `UE_5.9/Engine/Binaries/Win64/UnrealEditor-Cmd.exe`; (b) sin `.dat` pero con `<programFiles>/Epic Games/UE_5.9` → lo
  mismo; (c) ninguna de las dos → `{missing: '5.9'}`; (d) asociación con GUID → `null`.
- [ ] **Paso 2:** fallan.
- [ ] **Paso 3:** implementa. Por defecto, `launcherDat` es `C:/ProgramData/Epic/UnrealEngineLauncher/LauncherInstalled.dat`
  y `programFiles`, `C:/Program Files`. Precedencia al resolver el motor de un juego: `unrealPath` de `.nomos/config.json`,
  después `enginePathFor`, después el valor por defecto de hoy. Con `{missing}`, `doctor` dice «Este juego pide Unreal 5.9
  y no está instalado» y `nomos start` para, igual que hoy sin Unreal.
- [ ] **Paso 4:** pasan; `npm test`.
- [ ] **Paso 5:** commit `feat(motor): cada juego usa el motor que pide su .uproject`.

### Tarea 1.5: El modo rápido es el modo

**Files:** Modify `service/src/config.ts` (`rapido`, `directorConfig`), `tests/registry-env.ts`. Test:
`tests/service/rapido-defecto.test.ts` (nuevo).

- [ ] **Paso 1 (prueba que falla):** sin la variable `NOMOS_RAPIDO_DEFAULT`: con `{}` → `rapido` cierto, `heavyMax` 2,
  `minFreeRamGb` 1.5, `limits().corrections` 1, `directorConfig().mode` `'evento'`; con `{rapido: false}` → 1, 6, 3 y
  `'sesion'`; con `{rapido: false, director: {mode: 'evento'}}` → `'evento'`.
- [ ] **Paso 2:** falla.
- [ ] **Paso 3:** `rapido(config)` = `config.rapido ?? process.env.NOMOS_RAPIDO_DEFAULT !== 'off'`. El modo del director
  sin fijar es `'evento'` cuando `rapido(config)`. En `tests/registry-env.ts`, `NOMOS_RAPIDO_DEFAULT=off`: las 859 pruebas
  de hoy siguen midiendo los valores de antes sin tocarlas; la prueba nueva borra la variable en su propio proceso.
- [ ] **Paso 4:** pasan; `npm test` igual que la línea base.
- [ ] **Paso 5:** commit `feat(rapido): el modo rápido pasa a ser el valor por defecto`.

`nomos rapido off` se queda como salida de emergencia. No se borra el modo completo: es un diff grande a tres días de la jam.

### Tarea 1.6: Ninguna tarea se cancela sola

**Files:** Modify `service/src/decisiones-auto.ts`. Test: añade a su prueba existente (búscala con `grep -l decisiones-auto tests/service`).

- [ ] **Paso 1:** sigue qué hace hoy la opción `cancel` cuando la elige la regla automática de «Máximo de N correcciones
  alcanzado» (`decisiones-auto.ts:14-25`, `stall.ts:83-110`).
- [ ] **Paso 2 (prueba que falla):** en modo autónomo, esa Decisión reaparece tras elegir `review` → la regla **no** elige
  `cancel`: la Decisión queda abierta y sale un evento que despierta al director (`task.closing_blocked` con
  `reason: 'Máximo de correcciones: decide tú'`).
- [ ] **Paso 3:** quita `cancel` de lo que la regla puede elegir sola.
- [ ] **Paso 4:** pasa; `npm test`.
- [ ] **Paso 5:** commit `fix(decisiones): la regla automática nunca cancela una tarea`.

- [ ] **Cierre de fase:** `npm test`, fusiona en `main`.

---

## Fase 2 · Camino corto (presupuesto: 1 h 30)

### Tarea 2.1: Tabla de camino corto, también dentro del brief

**Files:** Create `skills/ue-oficio/references/camino-corto.md`. Modify `skills/ue-oficio/SKILL.md` (enlace en la primera
pantalla), `service/src/brief.ts`, `skills/nomos/references/brief-worker.md` (hueco `{{camino}}` antes de `## Contexto del proyecto`).
Test: añade a `tests/service/brief.test.ts`.

Contenido de `camino-corto.md`: una sola tabla «Quiero… / Usa… / No uses…», de 20 filas como mucho y sin prosa alrededor.
Filas obligatorias (redáctalas con las reglas de «Escribir corto»; cada una enlaza la referencia que ya existe):

| Quiero | Usa | No uses |
|---|---|---|
| Poner cosas en el nivel | Que su C++ las cree en `BeginPlay`, o `nomos ue receta` con la plantilla `escena` | Editar el `.umap` a mano; un script de Python por tarea |
| Un material o un efecto | `nomos fastvfx crear <receta> --preview` | Python nodo a nodo; en 5.9, Python sin renderer (no compila materiales) |
| HUD y menús | UMG construido en C++, con el `UFont` compuesto en C++ | Canvas, `DrawText`, fuentes del motor, Blueprint de widget a mano |
| Un sonido | En 5.9, MetaSound Builder por Python; plan B, `SoundWave` sintetizado e importado | Buscar o descargar audio |
| Compilar | `Build.bat` desde PowerShell, una vez por paso (50-80 s) | Bash; compilar tras cada línea |
| Probar reglas | Lógica en una clase C++ sin `UObject` y `nomos ue test` | Tests de física o de aspecto |
| Probar física y aspecto | Modo demo por variable de entorno y captura | Mirar solo el editor |
| Ver cómo quedó | Captura `-game` con su `.png.json`; del `.exe`, `captura_empaquetado.ps1` | Juzgar sin exposición manual; fiarse del editor para el empaquetado |
| Empaquetar | `RunUAT BuildCookRun` una vez al final, con `DirectoriesToAlwaysCook` | Empaquetar en cada paso |
| Importar una malla | Receta `importar_malla` (mide y rechaza escalas ×100) | Importar y colocar sin medir |
| Cámara | Receta `camara_tercera_persona`, o una sola cámara en el pawn desde C++ | Dos cámaras activas |
| Luz de exterior | Receta `post_exterior` | Tocar exposición a ojo captura tras captura |
| Repartir objetos | Receta `poblar_pcg` y contar instancias | PCG a mano sin contar |
| Datos de juego | `bp_datos` (Blueprint hijo y DataAsset) | Valores escritos en el nivel |
| Algo nuevo del 5.9 | Probarlo 10 min con su plan B escrito antes | Insistir pasado ese tiempo |
| Unreal se cayó | `nomos ue crash` antes de relanzar | Relanzar a ciegas |
| Lógica en Blueprint | C++ | Grafos de Blueprint escritos por un agente |

- [ ] **Paso 1 (prueba que falla):** el brief de un rol `implementacion` contiene `## Camino corto` y la fila «Poner cosas
  en el nivel»; el de `revisor` no lo contiene.
- [ ] **Paso 2:** falla.
- [ ] **Paso 3:** escribe la referencia. `brief.ts` lee ese archivo (una sola fuente) y lo mete en `{{camino}}` para todo
  rol que no sea `revisor`, `qa` ni `director`. Añade al brief dos reglas: «Antes de `NOMOS_DONE`: `git status --short`
  vacío y `revisar_acabado.py` sin fallos» y «Si una trampa de Unreal te costó más de 5 min, añade una línea a
  `docs/aprendido.md` (la regla, no la historia; ≤ 160 caracteres). Ese archivo siempre está en tu alcance».
- [ ] **Paso 4:** pasan; `npm test`.
- [ ] **Paso 5:** commit `feat(oficio): tabla de camino corto en ue-oficio y en el brief del worker`.

### Tarea 2.2: Pocas skills obligatorias, el resto si hace falta

**Files:** Modify `service/src/skills.ts`, `service/src/brief.ts`, `service/src/handlers/worker-start.ts:65`,
`service/src/handlers/worker-poll.ts:84-90`. Test: añade a `tests/service/skills.test.ts` y `tests/service/worker-skills.test.ts`.

**Interfaces:** Produce `skillSplit(role: string, area: string): {core: string[]; extra: string[]}`. `core` + `extra` es lo
que hoy devuelve `skillsForRole`, en el mismo orden. `core` por grupo:

| Grupo | `core` |
|---|---|
| implementation | `ue-oficio`, `ue-cpp-foundations`, `game-feel` |
| ability | `ue-oficio`, `ue-gameplay-abilities`, `game-feel` |
| vfx | `ue-oficio`, `ue-niagara-effects`, `ue-materials-rendering` |
| ui | `ue-oficio`, `ue-umg-ui`, `game-ui-art-director` |
| world | `ue-oficio`, `level-design`, `lighting` |
| camera | `ue-oficio`, `camera-systems` |
| ai | `ue-oficio`, `game-ai` |
| assets, animation, audio, qa, review, scope | todo el grupo, como hoy |

- [ ] **Paso 1 (pruebas que fallan):** `skillSplit('implementacion','gameplay')` devuelve ese `core` y 9 en `extra`; un
  worker que confirma solo las `core` con `NOMOS_SKILLS` **no** provoca `worker.skills_missing`; uno que no confirma
  `ue-oficio`, sí.
- [ ] **Paso 2:** fallan.
- [ ] **Paso 3:** implementa. En modo rápido, `run.skills` son las `core` y el brief lista las `extra` bajo «Solo si las
  necesitas». Con `rapido: false`, todo como hoy.
- [ ] **Paso 4:** pasan; `npm test`.
- [ ] **Paso 5:** commit `feat(skills): en modo rápido solo tres skills obligatorias por worker`.

### Tarea 2.3: La skill del director habla solo del modo rápido

**Files:** Modify `skills/nomos/SKILL.md` (versión `0.6.0`). Create `skills/nomos/references/modo-completo.md`.

- [ ] **Paso 1:** en `SKILL.md`, «Repartir» pasa a ser el reparto de hoy del modo rápido (dos pistas con archivos
  disjuntos, sin tarea base, ≤ 5 criterios observables, sin tareas de QA ni de cierre aparte, el vídeo y `docs/hecho.md`
  en la última que se integre). La sección «Modo rápido» desaparece como opción. «Al invocar» añade: un juego nuevo se
  crea con `nomos nuevo <Nombre>` (fase 3). Lo que solo vale con `rapido: false` (director de sesión con `Monitor`, tres
  correcciones, pistas con base) se muda a `references/modo-completo.md` con una línea que lo enlaza.
- [ ] **Paso 2:** `SKILL.md` queda en 250 líneas como mucho. Ningún ancla enlazada desde `references/` o `evals/` queda
  rota: `grep -rno "SKILL.md#[a-z0-9-]*" skills/nomos` y comprueba cada una.
- [ ] **Paso 3:** `npm test` (hay pruebas que leen la skill) y commit `docs(nomos): el modo rápido es el flujo de la skill`.

- [ ] **Cierre de fase:** `npm test`, fusiona en `main`.

---

## Fase 3 · Proyecto semilla (presupuesto: 2 h; necesita los 25 GB de la fase 0)

### Tarea 3.1: `nomos nuevo <Nombre>`

**Files:** Create `plantillas/semilla/**`, `service/src/nuevo.ts`. Modify `service/src/cli.ts` (despacho y texto de uso),
`service/src/embed.ts` (`parts` incluye `plantillas`). Test: `tests/service/nuevo.test.ts` (nuevo, sin Unreal).

**Interfaces:** Produce `nuevo(name: string, opts?: {dest?: string; engine?: string; source?: string}): string[]` (rutas
creadas) y la orden `nomos nuevo <Nombre> [--destino CARPETA] [--motor 5.9]`. Nombre válido: `^[A-Z][A-Za-z0-9]{2,19}$`.
Destino por defecto: `%USERPROFILE%/Documents/Unreal Projects/<Nombre>`.

Qué hace: copia `plantillas/semilla` cambiando `Semilla`, `SEMILLA` y `semilla` por el nombre en rutas y en archivos de
texto; pone `EngineAssociation`; `git init`, `git lfs track "*.uasset" "*.umap"`; llama a `embed` (Nomos viaja en el repo
del juego, así un compañero solo clona); primer commit «Proyecto <Nombre> desde la semilla de Nomos».

Qué trae la semilla (C++ del módulo `Semilla`; cada pieza, una responsabilidad):

| Pieza | Responsabilidad |
|---|---|
| `Semilla.uproject`, `Source/Semilla.Target.cs`, `SemillaEditor.Target.cs`, `Semilla.Build.cs` | Módulo de juego con `EnhancedInput`, `UMG`, `Slate`, `SlateCore`, `Niagara`, `PhysicsCore`; plugins `PythonScriptPlugin`, `EditorScriptingUtilities`, `Niagara`, `Metasound` |
| `SemillaReglas.h/.cpp` | Lógica del juego en C++ puro, sin `UObject`, para probarla sin mundo |
| `Tests/SemillaReglasTest.cpp` | Un test de automatización `Semilla.Reglas` que pasa |
| `SemillaGameMode` | Estados `Menu → Jugando → Fin`; delegado `OnEstado`; reinicio |
| `SemillaPlayerController` | Crea carga, menú y HUD; activa el modo demo si la variable de entorno `<NOMBRE>_AUTO` vale `1` |
| `SemillaEstilo` | `Fuente(rol, tamaño)`: `UFont` compuesto en C++ sobre los `FontFace` importados; tokens de paleta |
| `SemillaCarga`, `SemillaMenu`, `SemillaHud` | Widgets UMG construidos en C++; la carga espera a los assets (mínimo 0,5 s, tope 5 s) |
| `Config/DefaultGame.ini`, `DefaultEngine.ini`, `DefaultInput.ini` | Mapa y GameMode por defecto; `DirectoriesToAlwaysCook` de `/Game/Semilla` y `/Game/Fuentes`; `MapsToCook` |
| `Fuentes/*.ttf` con sus licencias OFL | Dos fuentes con tildes y ñ de `github.com/google/fonts`: Bricolage Grotesque (títulos) y Atkinson Hyperlegible (texto). Si no puedes bajarlas, otras dos OFL con ñ; la licencia va al lado |
| `Scripts/montar_contenido.py` | En el editor: importa las fuentes como `FontFace` y crea `/Game/Semilla/L_Principal` (suelo, sol, cielo, exposición manual) |
| `Scripts/compilar.ps1`, `empaquetar.ps1`, `capturar.ps1` | Los comandos de `acabado.md` §7 con el motor leído del `.uproject` |
| `docs/direccion.md`, `docs/hecho.md`, `docs/aprendido.md` | Plantillas con sus encabezados |
| `.gitignore`, `.gitattributes` | `Binaries`, `Intermediate`, `Saved`, `DerivedDataCache`, `Empaquetado`, `.nomos`, `.vs`; LFS para `*.uasset` y `*.umap`; `docs/aprendido.md merge=union` |

La semilla no es un juego: un patio vacío con menú, HUD de ejemplo de un solo dato y pantalla de final. Todo lo que
`revisar_acabado.py` exige a cualquier juego ya viene cumplido.

- [ ] **Paso 1 (prueba que falla):** `nuevo('Prueba', {dest: tmp})` → existen `Prueba.uproject` y
  `Source/Prueba/PruebaGameMode.h`; ningún archivo de texto contiene «Semilla»; el `.uproject` es JSON válido con
  `EngineAssociation` «5.9»; hay un repo con un commit; existe `Tools/Nomos/VERSION`. `nuevo('mi juego')`, `nuevo('Ñu')` y
  un destino que ya existe lanzan error sin escribir nada.
- [ ] **Paso 2:** falla.
- [ ] **Paso 3:** escribe `nuevo.ts` y la semilla. Parte de `C:/Users/richa/Documents/nomos-ref/Canicas-6` si existe.
- [ ] **Paso 4:** pasa; `npm test`.
- [ ] **Paso 5:** commit `feat(nuevo): nomos nuevo crea un juego desde la semilla`.

### Tarea 3.2: La semilla, comprobada en Unreal 5.9 de verdad

- [ ] **Paso 1:** `nomos nuevo Prueba`. `Scripts/compilar.ps1`: compila sin errores.
- [ ] **Paso 2:** `Scripts/montar_contenido.py` en el editor (`nomos ue py`); después `nomos ue test Prueba.Reglas` pasa.
- [ ] **Paso 3:** `python skills/ue-oficio/scripts/revisar_acabado.py <Prueba>` da 0 fallos.
- [ ] **Paso 4:** `Scripts/empaquetar.ps1`; `captura_empaquetado.ps1 -Tomas "0,3"`. Mira las dos capturas: pantalla de
  carga y menú, con la fuente propia nítida y tildes, sin material de cuadros.
- [ ] **Paso 5:** lo que el contenido generado deba viajar en la plantilla (los `FF_*.uasset` y `L_Principal.umap`),
  cópialo a `plantillas/semilla/Content/` para que un juego nuevo no dependa de abrir Unreal. Repite los pasos 1 a 4 con
  un `nomos nuevo Prueba2` para comprobar que así también sale bien.
- [ ] **Paso 6:** `docs/aceptacion-semilla.md` con tiempos y las dos capturas. Borra `Prueba` y `Prueba2`. Commit.

Recorte: si a las 2 h no empaqueta limpio, quita el menú de la semilla y deja carga, HUD, fuentes y configuración.

- [ ] **Cierre de fase:** `npm test`, `npm run build`, fusiona en `main`.

---

## Fase 4 · Equipo sincronizado por Git (presupuesto: 2 h; no usa Unreal, puede ir en un subagente mientras corre la fase 3)

### Tarea 4.1: Embebido y completo

**Files:** Modify `service/src/embed.ts`. Test: `tests/service/embed.test.ts`.

- [ ] **Paso 1 (prueba que falla):** tras `embed`, existe `<juego>/.claude/skills/ue-oficio/scripts/revisar_acabado.py`, y
  `acabadoScript()` cargado desde `<juego>/Tools/Nomos/service/src/checks/acabado.ts` apunta a un archivo que existe.
- [ ] **Paso 2:** falla.
- [ ] **Paso 3:** `embeddedSkills` incluye `ue-oficio`.
- [ ] **Paso 4:** pasa; commit `fix(embed): ue-oficio viaja con el juego`.

### Tarea 4.2: La tarjeta cuenta lo hecho y por dónde va `main`

**Files:** Modify `service/src/team.ts`. Test: `tests/service/team.test.ts`.

**Interfaces:** `Card` gana `done?: {id: string; title: string; summary: string; at: string}[]` (las 5 últimas tareas en
`done`, la más reciente primero; `summary` es el del `NOMOS_DONE`) y `main?: {commit: string; at: string} | null` (cabeza
local de la rama compartida). Los dos son opcionales al leer.

- [ ] **Paso 1 (pruebas que fallan):** `myCard` con 7 tareas `done` → 5 en `done` ordenadas; `recordPeers` con una tarjeta
  sin `done` ni `main` no lanza y `listPeers` la devuelve con `done: []`.
- [ ] **Pasos 2-4:** falla, implementa, pasa.
- [ ] **Paso 5:** commit `feat(equipo): la tarjeta cuenta lo hecho y la cabeza de main`.

### Tarea 4.3: `main` al día sin integrar

**Files:** Modify `service/src/team.ts` (`teamTick`), `service/src/handlers/integrate.ts` (extrae lo de `:257-259` a una
función que se pueda llamar desde fuera). Test: `tests/service/team-main.test.ts` (usa `team-fixture.ts`: dos clones y un remoto desnudo).

**Interfaces:** Produce en `integrate.ts`: `advanceLocal(git, projectDir: string, branch: string, to: string): Promise<boolean>`
(avanza el checkout del usuario solo si está en esa rama, limpio y es avance rápido). Evento `team.main_moved`
`{commit, by, title, files}`; `by` y `title` salen de la línea `Nomos-Equipo:` y del asunto del commit.

- [ ] **Paso 1 (pruebas que fallan):** Ana empuja a `main` → en el clon de Richard, tras un pase de `teamTick`, hay un
  `team.main_moved` con `by: 'Ana'` y su checkout apunta al commit nuevo. Con un archivo modificado sin commitear en el
  clon de Richard: sale el evento y el checkout **no** se mueve. Dos pases seguidos sin cambios: un solo evento.
- [ ] **Pasos 2-4:** falla, implementa (trae `main` con el `fetchMain` que ya existe, en el mismo ritmo `pullSeconds`),
  pasa. `team.main_moved` no despierta al director.
- [ ] **Paso 5:** commit `feat(equipo): main se mantiene al día y avisa de quién lo movió`.

### Tarea 4.4: `nomos equipo`, de un vistazo

**Files:** Modify `service/src/team.ts` (CLI), `panel/src/views/Equipo.tsx`. Test: `tests/service/team.test.ts` y la prueba
del panel de `Equipo`.

**Interfaces:** Produce `teamText(me: Card, peers: Peer[], behind: Record<string, number>, now: number): string`.
`nomos equipo` equivale a `nomos team status --texto`.

Formato exacto (una persona por bloque; las líneas `haciendo` y `hecho` solo si hay algo):

```text
Richard (combate) · presente · main 4e3fa41, al día
  haciendo: Lanzamiento de la brasa [implementando] · reserva L_Patio hasta 16:40
  hecho:    Sombras que nacen en los bordes (hace 12 min)
Ana (UI) · ausente 40 min · main 9ab948d, 2 commits atrás
```

- [ ] **Paso 1 (prueba que falla):** `teamText` con esos datos devuelve exactamente ese texto.
- [ ] **Pasos 2-4:** falla, implementa, pasa. En el panel, la franja Equipo añade por persona el título de lo último hecho
  y, si va por detrás, «N atrás» junto al commit. `npm run test:panel`, `npm run build`.
- [ ] **Paso 5:** commit `feat(equipo): nomos equipo y la franja del panel enseñan lo hecho y quién va por detrás`.

Recorte: si el panel pasa de 40 min, deja solo la orden de texto.

### Tarea 4.5: Lo aprendido viaja con el juego

**Files:** Modify `service/src/handlers/worker-start.ts:125-128`. Test: `tests/service/brief.test.ts`.

- [ ] **Paso 1 (prueba que falla):** con un `docs/aprendido.md` de 50 líneas en el worktree, el contexto del brief
  contiene `## Aprendido en este juego` y las 30 últimas líneas, no las 20 primeras. Sin archivo, no hay encabezado.
- [ ] **Pasos 2-4:** falla, implementa, pasa.
- [ ] **Paso 5:** commit `feat(brief): lo aprendido por el equipo entra en el brief de cada worker`.

La regla para escribir en ese archivo ya la puso la tarea 2.1 y la fusión sin conflicto, el `merge=union` de la semilla.

### Tarea 4.6: Dos clones y guía para el equipo

**Files:** Create `docs/aceptacion-jam-equipo.md`, `docs/jam-equipo.md`.

- [ ] **Paso 1:** con un `nomos nuevo` en una carpeta temporal, un remoto desnudo local y dos clones (Richard y Ana),
  cada uno con su servicio en un puerto y workers con el `claude` falso de las pruebas: Richard integra una tarea → en
  menos de 70 s, `nomos equipo` en el clon de Ana la enseña en «hecho», su `main` avanzó solo y una tarea de Ana sobre el
  mismo `.umap` espera con «Richard tiene reservado…». Pega las salidas en `docs/aceptacion-jam-equipo.md`. Apaga los dos
  servicios y borra las carpetas temporales.
- [ ] **Paso 2:** `docs/jam-equipo.md`, una página para quien no ha visto Nomos: qué instalar (Git, Git LFS, Node 25,
  Claude Code, Unreal 5.9), clonar, `/nomos`, elegir frente, cómo se ve a los demás (`nomos equipo` y el panel), qué hacer
  si alguien tiene reservado un mapa, y una prueba de 10 minutos para hacer juntos antes de la jam (cada uno integra una
  tarea mínima y comprueba que ve la del otro). Di sin rodeos lo que no está probado: dos máquinas con GitHub y LFS.
- [ ] **Paso 3:** commit.

- [ ] **Cierre de fase:** `npm test`, `npm run test:panel`, `npm run build`, fusiona en `main`.

---

## Fase 5 · Candela, con y sin Nomos (presupuesto: 4 h de reloj; necesita las fases 1 a 3 en `main`)

Lee `docs/demo/candela.md` entero antes de empezar. El encargo es el bloque de texto de ese archivo, sin cambiar una coma.

### Tarea 5.1: Rama B, con Nomos (va primero)

- [ ] **Paso 1:** `nomos nuevo Candela`. En esa carpeta: `nomos start --data .nomos`. Comprueba con `nomos doctor` que el
  motor es el 5.9 y con `nomos status` que el modo es rápido.
- [ ] **Paso 2:** escribe la línea `inicio` en `docs/tiempos.jsonl` y manda el encargo como mensaje del panel (la misma
  ruta HTTP que usa el chat del panel; búscala en `service/src/routes`). No repartas tú: lo hace el director por evento.
- [ ] **Paso 3:** espera sin intervenir. Mira `nomos status` como mucho cada 10 minutos. Cada vez que tengas que hacer
  algo para que avance, anótalo como intervención en `docs/demo/notas-B.md` con la hora y la causa: es un fallo de Nomos.
- [ ] **Paso 4:** al llegar la marca FIN o a los 120 min, para. `nomos metricas --json` a `docs/demo/metricas-B.json`.
  `nomos stop`.

### Tarea 5.2: Rama A, sin Nomos

- [ ] **Paso 1:** crea `Unreal Projects/CandelaSolo` como proyecto C++ en blanco de 5.9 (plantilla `TP_Blank` del motor más
  un módulo de juego mínimo; comprueba que compila antes de empezar). `git init` y un commit.
- [ ] **Paso 2:** lee `claude --help` y lanza al agente sin skills, sin plugins y sin el `CLAUDE.md` de Nomos, en segundo
  plano y con la salida a un archivo. Punto de partida: `claude -p --model opus --disable-slash-commands` con los mismos
  permisos que usan los workers de Nomos (`service/src/handlers/worker-launch.ts`). Si el clasificador de permisos lo
  impide, usa un subagente Opus con la instrucción de no cargar skills ni leer nada de Nomos, y dilo en la comparativa.
- [ ] **Paso 3:** espera sin intervenir. Al llegar FIN, al terminar el proceso o a los 120 min, para.

### Tarea 5.3: Capturar, medir y juzgar

- [ ] **Paso 1:** en los dos proyectos, con `CANDELA_AUTO=1`: `captura_empaquetado.ps1 -Tomas "0,3,15,30,55"` y un vídeo
  de 60 s del `.exe`. Si una rama no dejó `.exe`, empaquétala tú con sus fuentes tal cual (cuenta como intervención); si
  no compila, captura lo que haya y sus criterios dependientes puntúan 0.
- [ ] **Paso 2:** medidas objetivas de la tabla de `candela.md` para las dos.
- [ ] **Paso 3:** juez a ciegas: un subagente Sonnet recibe las cinco capturas de cada juego, etiquetadas X e Y al azar, y
  la rúbrica; devuelve la puntuación por criterio con una frase de motivo. El criterio 6 lo puntúas tú con los `.exe`.
- [ ] **Paso 4:** escribe `docs/demo/comparativa.md` y monta `Escritorio/Candela-demo/` con los dos vídeos, el vídeo lado
  a lado (`ffmpeg … hstack`), las diez capturas y una copia de la comparativa. Acceso directo en el Escritorio al
  `Candela.exe` de B.

### Tarea 5.4: Si la diferencia no es grande

- [ ] **Paso 1:** compara con el umbral de `candela.md`. Si se cumple, salta a la fase 6.
- [ ] **Paso 2:** si no, elige como mucho tres causas de lo que le faltó a B (de `notas-B.md` y de las capturas),
  arréglalas **en Nomos** (skill, semilla, tabla de camino corto o servicio) con prueba, en 90 min como mucho.
- [ ] **Paso 3:** repite solo la rama B en `Unreal Projects/Candela2` y vuelve a medir y juzgar. La comparativa enseña las
  dos pasadas de B. No hay tercera pasada.

---

## Fase 6 · Cerrar (presupuesto: 30 min)

- [ ] `npm test`, `npm run test:panel`, `npm run build` en verde; todo fusionado en `main`. Sin push.
- [ ] Libera disco de lo tuyo: `Intermediate` y `Saved/StagedBuilds` de `CandelaSolo` (y de `Candela2` si existió). El
  proyecto `Candela` y su `Empaquetado/` se quedan: es la demo.
- [ ] `docs/jam-rapido-informe.md`: qué se hizo por fase, qué se recortó, las cifras de la comparativa, lo que no está
  probado y, en una lista aparte, lo que el usuario tiene que hacer: `git push origin main`, crear el repo del juego de la
  jam y pasar `docs/jam-equipo.md` al equipo.
- [ ] Guarda en Second Brain un punto de control con el commit de `main`, las cifras medidas y lo no probado (evidencia
  `observed`).
- [ ] Comprueba que no queda ningún servicio de Nomos, editor de Unreal ni proceso `claude` lanzado por ti.

## Lo que este plan deja fuera, a propósito

- Borrar el modo completo del servicio: `rapido: false` sigue existiendo como salida de emergencia.
- `nomos entrega --verificar` como orden: la cubren las dos líneas nuevas del brief y la comprobación `acabado` del servicio.
- Que las comprobaciones usen el editor caliente en vez de abrir uno en frío (12-15 s cada una): ganancia pequeña, cambio delicado.
- Bloqueos con `git lfs lock`: las reservas de Nomos ya cubren mapas y assets.
- Prueba real con dos máquinas, GitHub y LFS: la hace el equipo con la guía de la tarea 4.6.
