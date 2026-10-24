# Kratos · Hito 5b «personajes y animación» · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Despausado 2026-10-24** por decisión del usuario («dale con el de animaciones y tal ese que pausamos cuando termines esto»). Refinado contra `main@8418068` (hitos 0-9 completos, MVP cerrado). Regla vigente del usuario: **sin Meshy `rig`/`animate`, nunca personajes ni formas orgánicas generadas**; personajes y animación salen del catálogo (plantillas del motor, Fab, MetaHuman) y del retarget de clips existentes. **Ningún worker Codex.**

**Goal:** Que una petición como «un héroe con animación de ataque» produzca una Decisión con hasta tres candidatos reales del catálogo (con miniatura cuando la hay), y que el elegido acabe **migrado al proyecto, con sus animaciones retargeteadas si vienen de otro esqueleto, reproduciéndose en PIE con capturas y una comprobación de deformación**, todo verificado por el servicio como una comprobación más (`animation`), con el mismo ciclo de tarea, revisión y cierre que ya existe.

**Architecture:** Nada nuevo de infraestructura: una fuente de catálogo más (`engine`: las plantillas del motor), un handler de candidatos que abre una Decisión con `options[].thumbnail` (el panel ya tiene `DecisionOptions` con miniatura y el `AssetViewer`), un handler `character.setup` que corre en el carril largo por `withEditor` con `UnrealEditor-Cmd` + un script Python (`service/unreal/kratos_character.py`), y una comprobación `animation` en `checks/select.ts` que lo reutiliza. MetaHuman queda como ruta opcional detrás de una capacidad.

**Tech Stack:** El de `main`: Node ≥ 25 sin dependencias, `node:sqlite`, `node:test`; adaptador `adapters/unreal-cmd.ts` (lotes, `render` opcional), `editor/queue.ts` (`withEditor`, reserva `editor/<proyecto>`), `handlers/asset-migrate.ts` (copia + verificación sin GUI), `repo/decisions.ts` (`openDecision`), `checks/{select,gate,run}.ts`, `repo/capabilities.ts`, `panel/src/components/{DecisionOptions,AssetViewer}.tsx`, `panel/src/lib/artifactName.ts`, `skills.ts` (rol `animation` → `rigging`, `ue-animation-system`), fakes `tests/fakes/unreal-cmd.mjs`.

**Hechos comprobados en este equipo (2026-10-24, Unreal 5.8.3 en `C:\Program Files\Epic Games\UE_5.8`):**
- `Templates/TemplateResources/High/Characters/Content/Mannequins/`: `Meshes/SKM_Manny_Simple`, `SKM_Quinn_Simple`, `SK_Mannequin` (esqueleto UE5), `Anims/Unarmed/{ABP_Unarmed, BS_Idle_Walk_Run, MM_Idle, Attack/, Jog/, Jump/, Walk/}`, `Anims/{Pistol,Rifle,Death}/`, `Rigs/`, materiales y texturas.
- `Templates/TP_ThirdPerson/Content/Variant_Combat/Anims/`: `ABP_Manny_Combat`, `AM_ChargedAttack`, `AM_ComboAttack` (montajes de ataque sobre Manny).
- `Templates/TemplateResources/High/Mannequin/Content/Character/Mesh/SK_Mannequin` (+ `_Female`): el maniquí **UE4**, esqueleto distinto → caso real de retarget.
- Plugins presentes: `IKRig`, `MotionWarping`, `AnimationLocomotionLibrary`, `MetaHuman*` (incl. `MetaHumanCharacter`, `MetaHumanSDK`), `Mutable`.
- `UIKRetargetBatchOperation::RunBatchRetarget(const FIKRetargetBatchOperationInputs&)` es `BlueprintCallable` (expuesto a Python como `unreal.IKRetargetBatchOperation.run_batch_retarget`); `DuplicateAndRetarget` está deprecado en 5.8. `UIKRetargeterController` también es accesible.
- El catálogo de KratosFabTest ya indexa 2 entradas `metahuman-preset` (Megascans Library) y 8 `pack`; ninguna con esqueleto. Game Animation Sample **no** está descargado (sería nivel 2 de Fab con clics: fuera de este hito).
- Scripts Python que ya existen y se reutilizan: `service/unreal/{kratos_import, kratos_verify, kratos_validate, kratos_pie_capture, kratos_compile_bp}.py` (entrada por variables `KRATOS_*`, salida JSON en `KRATOS_REPORT`).

**Spec:** `docs/plan-v2.md` §3.5, §4 (fila «Personaje y animación»), hito 5b de §6, prueba 30 de §7.

## Global Constraints

- Reglas del usuario: ningún Meshy para personajes ni animación (`rig`/`animate` siguen prohibidos; `requireKind` ya lo rechaza); ningún worker Codex; **ningún artefacto ni tarjeta con nombre de archivo o uuid** (nombres por `artifactName`/`provenance.label`); agentes `{Área} {Rol}` con avatar por proveedor (ya en main); el token del servicio nunca se pega en el chat; sin push ni merge; `.kratos-brief.md` fuera de los commits.
- **`Config/DefaultEngine.ini` de `KratosFabTest` está sin seguir a propósito (contiene un `SecurityToken` del usuario): nunca entra en un commit, nunca se sobrescribe, nunca se copia a un diff de revisión.** La regla del hito 7 (archivos locales del usuario fuera de los commits, `Config/` sin seguir fuera del diff) se respeta tal cual.
- Técnicas: cero dependencias npm en el servicio; TypeScript con sintaxis borrable; archivos ≤ 200 líneas; `127.0.0.1` + token en toda ruta; copy en español; LF; sin colores a mano fuera de `theme.css`/`tokens.json`; acciones del panel por `useAction`, navegación por `withViewTransition`; glifo nuevo solo si pasa la prueba de unicidad de `panel/src/visual/`; fixtures `.log` cubiertas por `!tests/fixtures/**/*.log`.
- Licencias: las plantillas del motor se indexan con licencia «Epic Content License (solo proyectos Unreal)», `ai_forbidden: false`, sin coste; se muestran en Catálogo como cualquier entrada.
- Todo paso que abra el editor va por `withEditor` en el carril largo y con tiempo máximo; si Unreal no está (`Capacidades`), el handler devuelve `{deferred:true, reason}` o abre Decisión, nunca inventa resultados.
- Verificación obligatoria de cada personaje: cargado en PIE con la animación reproduciéndose, capturas a 1280×720 y 1920×1080 en tres instantes del clip, y comprobación de deformación por script (caja envolvente del `SkeletalMeshComponent` dentro de ×3 de la pose de reposo, ningún hueso con escala 0, duración del clip > 0).

## Review Focus

1. Animación de un esqueleto distinto (maniquí UE4 → Manny UE5): el retarget por script debe producir el informe de cadenas/huesos sin mapear y, si no puede retargetear solo, abrir Decisión con guion; nunca una animación rota aprobada. (Tarea 2.)
2. Tres candidatos presentados: la Decisión lleva miniatura (si la hay), origen, licencia y coste; abrir la miniatura en el visor **no elige**; elegir encola la migración y el `character.setup`, y la tarea queda en espera de editor con su `waitReason`. (Tarea 1.)
3. Migración de plantillas del motor: las rutas internas (`/Game/Characters/Mannequins/...`) deben seguir resolviendo tras copiar; `kratos_verify.py` sin referencias rotas. (Tarea 0.)
4. `character.setup` con Unreal ocupado por otra tarea: `deferred` con «Esperando editor», sin pisar la reserva. (Tarea 2.)
5. MetaHuman sin la API disponible en modo lote o con pasos en la nube: la run queda `esperando_externo` con Decisión y guion, la tarea no se bloquea sola ni se da por hecha. (Tarea 3.)

## Estructura de archivos

- Create `service/src/catalog/sources/engine.ts` (plantillas del motor), `service/src/handlers/asset-candidates.ts`, `service/src/handlers/character-setup.ts`, `service/src/handlers/character-metahuman.ts`, `service/src/checks/animation.ts`, `service/unreal/kratos_character.py`, `service/unreal/kratos_retarget.py`, `service/unreal/kratos_metahuman.py`, `skills/kratos/references/personajes.md`, `skills/kratos/evals/09-heroe-ataque.md`, `docs/aceptacion-hito5b.md`, `docs/capturas-5b/`.
- Modify `service/src/catalog/{indexer,paths}.ts`, `service/src/handlers/asset.ts` (registro), `service/src/checks/{select,run}.ts`, `service/src/repo/capabilities.ts`, `service/src/cli-asset.ts` (`asset candidates`), `service/src/model.ts` (solo si hace falta un campo de metadata), `skills/kratos/SKILL.md`, `panel/src/lib/artifactName.ts`, `tests/fakes/unreal-cmd.mjs`, `docs/estado-entregas.md`.

---

### Task 0: Plantillas del motor en el catálogo

**Files:** Create `catalog/sources/engine.ts`; Modify `catalog/{indexer,paths}.ts`, `handlers/asset-migrate.ts` (solo la ruta destino para `source: 'engine'`); tests `tests/service/indexer.test.ts`, `asset-migrate.test.ts`.

- Indexar, a partir de `unrealPath` del `config.json` (`…/UE_5.8`), una entrada por carpeta de contenido: «Maniquíes UE5 (Manny y Quinn)» = `Templates/TemplateResources/High/Characters/Content` (categoría `character`), «Animaciones de combate (plantilla Tercera persona)» = `Templates/TP_ThirdPerson/Content/Variant_Combat/Anims` (categoría `animation`), «Maniquí UE4» = `Templates/TemplateResources/High/Mannequin/Content` (categoría `character`). `source: 'engine'`, `engineVersions: ['5.8']`, `license: 'Epic Content License (solo proyectos Unreal)'`, `formats: ['uasset']`, `tags` con `skeleton: UE5_Mannequin | UE4_Mannequin` y la lista de clips detectados por nombre (`AM_*`, `A_*`, `BS_*`, `MM_*`).
- `asset migrate` de una entrada `engine` copia **preservando la ruta relativa a `Content/`** (las plantillas referencian `/Game/Characters/Mannequins/...`) y verifica con `kratos_verify.py`; si el destino ya existe, no sobrescribe y lo dice.
- [ ] Pruebas con fixture de carpetas vacías con nombres reales; `npm test` ×2; commit `feat: plantillas del motor en el catálogo`.

### Task 1: Candidatos como Decisión

**Files:** Create `handlers/asset-candidates.ts`; Modify `handlers/asset.ts`, `cli-asset.ts`; tests `tests/service/asset-candidates.test.ts`; e2e `panel/e2e/candidatos.spec.ts`.

- `asset.candidates {taskId, query, kinds?: ('character'|'animation'|'metahuman-preset'|'pack')[]}` → busca en el catálogo (FTS existente) hasta 3 por tipo con esqueleto o preset; abre `openDecision` con `reason` «Elegir personaje base: N candidatos del catálogo» y `options[]` = `{id: entryId, label ≤ 4 palabras, description (origen · licencia · coste 0 ó créditos), thumbnail: /catalog/<id>/thumbnail si existe, recommended}`; sin candidatos → Decisión con las dos salidas reales («Buscar en Fab (nivel 2, con clics)» / «Usar maniquí del motor»).
- Resolver la Decisión encola `asset.migrate` del elegido (`idempotency migrate:<entry>:<proyecto>`) y después `character.setup` (Tarea 2) con las animaciones pedidas; la tarea pasa a `preparada` con `waitReason` «Esperando editor» mientras tanto.
- Panel: nada nuevo salvo prueba e2e: la Decisión muestra 3 tarjetas, la miniatura abre el `AssetViewer` y **no** elige; elegir cierra la Decisión. Captura `docs/capturas-5b/candidatos-1920.png`.
- [ ] `kratos asset candidates --task <id> "héroe con ataque"` desde la CLI; `npm test` ×2, `npm run test:panel`, Playwright; commit `feat: candidatos de personaje como Decisión`.

### Task 2: `character.setup`, retarget y comprobación `animation`

**Files:** Create `handlers/character-setup.ts`, `checks/animation.ts`, `service/unreal/kratos_character.py`, `service/unreal/kratos_retarget.py`; Modify `checks/{select,run}.ts`, `tests/fakes/unreal-cmd.mjs`, `panel/src/lib/artifactName.ts`; tests `tests/service/character-setup.test.ts`, `checks-select.test.ts`, `panel/src/lib/artifactName.test.ts`.

- `character.setup {taskId, mesh: '/Game/...', animations: ['/Game/...'], targetSkeleton?: '/Game/...'}` en el carril largo por `withEditor` (Review Focus 4): `kratos_character.py` carga el `SkeletalMesh`, resuelve el esqueleto, y por cada animación: mismo esqueleto → la usa; distinto → `kratos_retarget.py` con `unreal.IKRetargetBatchOperation.run_batch_retarget` usando un `IKRetargeter` existente del pack (`Rigs/`) o uno creado por script con `IKRetargeterController` y mapeo automático de cadenas; el informe lista cadenas/huesos sin mapear; si queda alguna cadena principal sin mapear (`spine`, `head`, brazos, piernas) → Decisión «Retarget manual» con guion y la tarea no avanza (Review Focus 1).
- Prueba en PIE: crea (o reutiliza) `/Game/Kratos/Maps/AnimTest` con un actor de prueba que reproduce el clip o el montaje; `kratos_pie_capture.py` a 1280×720 y 1920×1080 en 0 %, 50 % y 90 % del clip; comprobación de deformación (Global Constraints); JSON → `recordTestRun` tipo `animation` y artefactos con `provenance.label` («Animación · captura 1280×720 · 50 %», «Retarget · informe», «Deformación · informe»). `artifactName.ts` conoce los nuevos tipos (filtro Capturas/Informes ya existente).
- `checks/select.ts`: nuevo `CheckId 'animation'` para `SK_*`, `SKM_*`, `ABP_*`, `AM_*`, `A_*`, `BS_*`, `MM_*`, `IK_*`, `RTG_*` y rutas `/Anims/`, `/Animations/`, `/Characters/`; orden `cpp, blueprint, asset, animation, map, umg, build`; `checks/run.ts` lo ejecuta con el mismo `checkGate`. `kratos task check` lo relanza.
- Fake `unreal-cmd.mjs`: informes de `character`/`retarget` configurables (ok, cadenas sin mapear, editor ocupado) para probar sin motor.
- [ ] `npm test` ×2, `npm run test:panel`, `npm run build`; commit `feat: character.setup, retarget por lotes y comprobación animation`.

### Task 3: MetaHuman por capacidad (opcional, sin inventar)

**Files:** Create `handlers/character-metahuman.ts`, `service/unreal/kratos_metahuman.py`; Modify `repo/capabilities.ts`; tests `tests/service/capabilities-metahuman.test.ts`, `character-metahuman.test.ts`.

- Capacidades: filas «MetaHuman» (plugins `MetaHumanCharacter`/`MetaHumanSDK` presentes en el motor + al menos un `metahuman-preset` indexado) y «Retarget IK» (`IKRig`); `estado` `listo | ausente`, con detalle.
- `character.metahuman {taskId, presetEntryId, name}`: en modo lote intenta `unreal.MetaHumanCharacterEditorSubsystem` (crear desde el preset, ensamblar, guardar en `/Game/MetaHumans/<name>`); tiempo máximo 10 min; cualquier paso que exija GUI o nube deja la run en `esperando_externo` y abre Decisión «Crear el MetaHuman en el editor (guion de 5 pasos) / Usar maniquí del motor» (Review Focus 5). Lo que ocurra de verdad en 5.8.3 se documenta en `docs/aceptacion-hito5b.md`; si la API no existe en lote, la ruta queda como «asistida» y se dice.
- [ ] Prueba real **una vez** en `KratosFabTest` con un preset indexado (resultado real, sea cual sea); `npm test` ×2; commit `feat: MetaHuman por capacidad`.

### Task 4: Skill, aceptación y cierre del hito

**Files:** Modify `skills/kratos/SKILL.md` (sección «Personajes», ≤ 10 líneas), Create `references/personajes.md`, `evals/09-heroe-ataque.md`, `docs/aceptacion-hito5b.md`; Modify `docs/estado-entregas.md` (5b «En `main`» + prueba 30).

- SKILL: «Personajes: siempre candidatos primero (`asset candidates`); orden catálogo propio → plantillas del motor → Fab → MetaHuman si Capacidades lo marca; nunca Meshy para personajes ni animación; toda animación pasa por `character.setup` y la comprobación `animation` en PIE». skillsmith ≥ 95 (`npx -y @lozadaa/skillsmith@1.2.0 --path skills/kratos --report`).
- Aceptación real en `KratosFabTest` (datos en `.kratos-hito5b`; antes `kratos stop --data .kratos-hito7` si sigue vivo en 8780): (a) «Un héroe con animación de ataque» → candidatos (Manny, Quinn, preset MetaHuman) → Manny → migración de maniquíes + animaciones de combate → `character.setup` con `AM_ComboAttack` → capturas PIE → revisión → comprobaciones (`animation`) → integración → DONE; (b) retarget real de un clip del maniquí UE4 al Manny UE5 por `run_batch_retarget` → PIE con captura; (c) Review Focus 1 provocado a propósito (clip sobre un esqueleto sin retargeter) → Decisión. Tiempos por etapa como en `docs/recorrido-mvp.md`.
- Capturas finales en `docs/capturas-5b/` (Decisión con candidatos, visor abierto sobre un candidato, Entregas con capturas de animación, Capacidades con MetaHuman/Retarget, PIE 1280×720 y 1920×1080).
- [ ] `npm test` ×3 en verde al cerrar, `npm run test:panel`, `npm run build`, Playwright; commit `docs: aceptación del hito 5b`.

## Self-review

- Cobertura: §3.5 sin Meshy (decisión del usuario) y sin DeepMotion/Cascadeur/Rokoko (§9 del plan v2); fila de §4 → `character.setup` + rol `animation`; prueba 30 → Capacidades «MetaHuman» (Tarea 3) y Global Constraints.
- Review Focus 1, 4 → Tarea 2; 2 → Tarea 1; 3 → Tarea 0; 5 → Tarea 3.
- Riesgos conocidos: la API Python de MetaHuman en modo lote puede no existir (la Tarea 3 lo contempla); copiar plantillas del motor exige preservar `/Game/...` (Tarea 0 lo verifica); `run_batch_retarget` necesita un `IKRetargeter` válido (Tarea 2 crea o pide uno).

---

## CORRECCIÓN 1 del usuario (MetaHuman obligatorio y Cascadeur) — 2026-10-24

Petición literal: «me interesa que las animaciones funcionen en metahuman y todo eso, tienes que usar https://cascadeur.com/ ya está instalado si hace falta evidentemente cuando haga falta». Cambia dos cosas del plan: **MetaHuman deja de ser opcional** (el objetivo del hito es que las animaciones funcionen sobre MetaHuman) y **Cascadeur entra como herramienta de animación**, usada cuando el catálogo no tiene el clip o el clip hay que arreglarlo, nunca por defecto.

**Hechos comprobados en este equipo (2026-10-24):**
- Cascadeur **2026.2.3.0** instalado en `C:\Program Files\Cascadeur` (`cascadeur.exe`, `cascadeur_auth.exe`, `UnrealLiveLink.dll`, Python embebido en `Lib/` y `DLLs/`, `resources/scripts/python/commands/` con los comandos de serie incl. `custom_export/export_inplace_animation.py`, `import_bvh_animation.py`, `export_to_roblox.py`; `resources/autorig_templates/`; `resources/scripts/python_api_doc/`). Modelo oficial de scripting: archivos en la carpeta de comandos con `command_name()` y `run(scene)`, cargados al arrancar y visibles en el menú **Commands**; FBX por script con `FbxSceneLoader.get_fbx_loader(scene)` → `export_all_objects(path)` / `import`; la ayuda oficial habla de Python 3.8 (comprobar la versión embebida real). **No hay modo sin ventana documentado**; proyectos de terceros lanzan `cascadeur.exe --run-script <módulo>` con la ventana abierta (sin confirmar en docs oficiales). La exportación FBX puede depender de la licencia: comprobarlo en la primera prueba real y reflejarlo en Capacidades.
- Flujo oficial Cascadeur ↔ MetaHuman (ayuda «Working with MetaHumans»): el MetaHuman entra en Cascadeur por FBX (exportado desde Unreal con Asset Actions → Export, o por Maya); su esqueleto se parece al maniquí UE4/UE5, así que la Quick Rigging Tool crea el rig con la plantilla del maniquí; la animación vuelve a Unreal con **File → Export Fbx/Dae → Without Meshes**, ajustes `FbxUpAxis = Z` y `TypeFbxAscii = Off`, y **se retargetea** en Unreal; si el personaje se deforma, en el Skeleton Tree de Unreal `root` y `pelvis` en *Animation* y el resto en *Skeleton*.
- Unreal 5.8.3: el plugin `MetaHumanCharacter` trae `Content/Animation/Retargeting/IK_MH_IKRig.uasset` y `RTG_MH_IKRig.uasset` (retargeter oficial maniquí → MetaHuman); `UMetaHumanCharacterEditorSubsystem` expone **51 funciones `BlueprintCallable`** (categorías `MetaHuman|Initialization`, `Pipeline` con `AssembleForPreview`, `Assembly`, `Model`, `Texture Synthesis`, `Eyes`, `Makeup`, `Testing`), más `MetaHumanCharacterExportBlueprintLibrary` y `MetaHumanCharacterExternalImportTool`: todo accesible desde Python del editor. El catálogo de KratosFabTest ya indexa dos presets MetaHuman de Megascans Library: **Hudson** y **Emory** (UAssets locales).

### Cambios a las tareas

**Tarea 2 (ampliada): `character.setup` con objetivo MetaHuman.** `targetSkeleton` admite `metahuman`: el retarget usa `RTG_MH_IKRig` del plugin (copiado o referenciado desde `/MetaHumanCharacter/...`) con `run_batch_retarget`; la prueba en PIE monta el MetaHuman (su Blueprint o su `SkeletalMesh` de cuerpo) y reproduce el clip retargeteado; la comprobación de deformación es la misma. Review Focus 1 se aplica también aquí (cadenas sin mapear → Decisión). La distorsión típica de FBX externos se corrige por script (`root`/`pelvis` en *Animation*, resto en *Skeleton*) y se anota en el informe.

**Tarea 3 (ahora obligatoria y primera en el orden real): MetaHuman funcionando.** Dos vías, en este orden:
1. **Preset del catálogo** (Hudson/Emory): `asset.candidates` los ofrece con su miniatura; elegirlo migra el preset al proyecto (`asset.migrate`, son UAssets) y encadena `character.setup` con `targetSkeleton: 'metahuman'`. **Esta vía es la aceptación principal del hito.**
2. **MetaHuman creado por script**: `character.metahuman {taskId, presetEntryId?, name}` usa `unreal.MetaHumanCharacterEditorSubsystem` en el editor por lotes (inicializar, modelo, ensamblar con `AssembleForPreview`/`Assembly`, guardar en `/Game/MetaHumans/<name>`), tiempo máximo 10 min; lo que requiera GUI o nube deja la run en `esperando_externo` + Decisión con guion. Se intenta de verdad una vez y se documenta el resultado real.
- Capacidades: filas «MetaHuman» (plugin + retargeter `RTG_MH_IKRig` + ≥ 1 preset indexado), «Retarget IK» y **«Cascadeur»** (ejecutable, versión, y si la exportación FBX funcionó en la última comprobación).

**Tarea 3b (nueva): Cascadeur cuando hace falta.**
- Política (en la skill y en `worker-policy`): una animación se resuelve **1)** con un clip del catálogo retargeteado; **2)** si no existe el clip pedido, o el retarget sale con artefactos que el QA visual rechaza, o el usuario lo pide, **Cascadeur**: nunca antes de haber buscado, y toda animación nueva o modificada pasa por QA visual y, si es una elección creativa (clip nuevo), por Decisión del usuario con las capturas.
- `adapters/cascadeur.ts`: detecta `cascadeurPath` (`config.json`, por defecto `C:\Program Files\Cascadeur\cascadeur.exe`), versión del ejecutable, carpeta de comandos del usuario; instala/actualiza los comandos de Kratos (`kratos_cascadeur/`: `kratos_import.py`, `kratos_cleanup.py` (AutoPhysics/limpieza con parámetros desde un JSON de entrada), `kratos_export.py` (FBX sin mallas, `FbxUpAxis Z`, ASCII off, a `.kratos/cascadeur/out/<run>.fbx`), cada uno con `command_name()` y `run(scene)` leyendo su trabajo de `.kratos/cascadeur/jobs/<run>.json`).
- `animation.cascadeur {taskId, action: 'cleanup'|'author'|'fix-retarget', sourceClip: '/Game/...' | fbx, targetSkeleton, notes}` en el carril largo: exporta esqueleto + clip desde Unreal a FBX por lotes (`service/unreal/kratos_export_fbx.py` nuevo) → escribe el job JSON → intenta `cascadeur.exe --run-script <comando>`; si el flag no existe o exige la ventana, la run pasa a `esperando_externo` y abre Decisión «Abrir Cascadeur y ejecutar Commands › Kratos › <comando> (guion)»; el servicio vigila `.kratos/cascadeur/out/` (watcher de archivos ya existente para descargas) y al aparecer el FBX continúa solo: `kratos_import.py` → retarget si procede → `character.setup` → comprobación `animation`. Si la exportación FBX falla por licencia, Capacidades lo dice y la Decisión ofrece «Exportar a mano» o «Usar solo retarget».
- Live Link de Unreal (`UnrealLiveLink.dll`) queda fuera de este hito: se anota como pendiente.
- Pruebas: adaptador con ejecutable falso (`tests/fakes/cascadeur.mjs`: éxito, sin flag, sin licencia), handler con los tres caminos (automático, asistido por Decisión + archivo detectado, fallo de licencia), política en `worker-policy`.

**Tarea 4 (aceptación, ampliada):** (a) **«Un héroe MetaHuman con animación de ataque»** → candidatos (Hudson, Emory, Manny) → Hudson → migración → `character.setup` con `AM_ComboAttack` retargeteado por `RTG_MH_IKRig` → PIE con capturas → revisión → `animation` → integración → DONE; (b) Manny con el mismo clip (caso simple); (c) retarget UE4 → UE5; (d) **Cascadeur**: el mismo clip de ataque pasado por `kratos_cleanup` (AutoPhysics) y devuelto a Unreal sobre el MetaHuman → QA visual compara antes/después; (e) Review Focus 1 provocado; (f) intento real de `character.metahuman` por script con el resultado que sea. Capturas en `docs/capturas-5b/` incluyen el MetaHuman animado a 1280×720 y 1920×1080 y Capacidades con MetaHuman/Retarget/Cascadeur.

**Skill (Tarea 4):** la sección «Personajes» dice el orden: catálogo propio → plantillas del motor → **MetaHuman (presets o creado)** → Fab; animaciones: clip del catálogo retargeteado → **Cascadeur solo cuando falta o falla**, siempre con QA visual y Decisión si es creativa; nunca Meshy para personajes ni animación.

### Review Focus añadidos
6. Clip del maniquí sobre un MetaHuman (preset Hudson): el retarget con `RTG_MH_IKRig` reproduce en PIE sin deformación; si el plugin no trae el retargeter en esta versión, Decisión con guion, nunca una animación rota. (Tarea 2/3.)
7. Cascadeur sin `--run-script` o sin licencia de exportación: la run queda `esperando_externo` con guion claro y el FBX dejado a mano en `.kratos/cascadeur/out/` reanuda el flujo solo. (Tarea 3b.)
8. Una animación nueva de Cascadeur nunca llega a `integrando` sin QA visual aprobado y, si es un clip nuevo, sin Decisión del usuario. (Tarea 3b.)

---

## CORRECCIÓN 2 del usuario (vídeo de las animaciones) — 2026-10-24

Petición literal: «graba un video de lo que hiciste de la animaciones». Las capturas fijas no bastan para juzgar una animación: **toda comprobación `animation` deja un vídeo corto del clip reproduciéndose en PIE como artefacto**, el visor lo reproduce, y la aceptación del hito entrega vídeos al usuario.

**Hechos comprobados en este equipo (2026-10-24):** `ffmpeg` 8.1.2 instalado por winget (`C:\Users\richa\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe`, también en el PATH como `ffmpeg`); Unreal 5.8 trae el volcado de fotogramas a paso fijo (`-benchmark -fps=30 -dumpmovie` en el juego lanzado con `-game`) y los protocolos `ImageSequenceProtocol`/`VideoCaptureProtocol` de MovieSceneCapture; Playwright graba vídeo `.webm` de forma nativa (`recordVideo`). `kratos_anim_capture.py` ya congela el clip en tres fracciones con `Shot`.

### Cambios

**Tarea 2 (ampliada): vídeo en la comprobación `animation`.**
- `kratos_anim_capture.py` graba además la **secuencia completa** del clip a paso fijo: lanzar el juego con `-game -windowed -ResX=1280 -ResY=720 -benchmark -fps=30 -dumpmovie` (o, si el volcado no incluye el personaje por el orden de carga, `Shot` por tick con `t.FixedDeltaTime 0.0333` durante la duración del clip) hasta `Saved/Screenshots/`; duración = el clip entero, con tope de 8 s para clips más largos (y 3 s mínimo para poses/idles). Las tres capturas fijas y la comprobación de deformación se mantienen.
- `adapters/ffmpeg.ts` (nuevo, ≤ 60 líneas): detecta `ffmpegPath` (`config.json`, por defecto `ffmpeg` del PATH y la ruta de winget), versión, y codifica la secuencia a **MP4 H.264 `yuv420p` a 30 fps** (`-pix_fmt yuv420p -movflags +faststart`); Capacidades: fila «Vídeo (ffmpeg)» `listo | ausente`. Sin ffmpeg, el artefacto es la secuencia de fotogramas comprimida en un zip («Animación · fotogramas») y Capacidades lo dice; nunca se inventa un vídeo.
- Artefacto `kind: 'video'` con `provenance.label` «Animación · vídeo 1280×720 · <clip>» (nombre derivado, nunca de archivo); `artifactName.ts` lo clasifica (nuevo tipo «Vídeos» en el filtro de Entregas, o dentro de «Capturas» si el registro de glifos no admite uno más: decidir con la prueba de unicidad); el `TestRun animation` lo adjunta junto a las capturas y los informes.
- **`AssetViewer`** reproduce `mp4|webm` con `<video controls autoplay muted loop playsinline>` a tamaño grande (mismo cuadro que las imágenes); la miniatura de la tarjeta en Entregas es el fotograma del 50 % (ya existe como captura) con un glifo de reproducción superpuesto que pase la prueba de unicidad.
- El QA visual recibe el vídeo y los tres fotogramas; el brief de QA (`references/brief-qa-visual.md`) lo dice.

**Tarea 4 (aceptación, ampliada):** `docs/capturas-5b/` incluye `heroe-metahuman-ataque-1280x720.mp4` (MetaHuman con `AM_ComboAttack`), `manny-ataque-1280x720.mp4`, `retarget-ue4-a-ue5-1280x720.mp4` y, si Cascadeur llegó a usarse, `cascadeur-antes-despues-1280x720.mp4` (los dos clips en paralelo con ffmpeg `hstack`); además un **vídeo demo del panel** grabado con Playwright (`recordVideo`, 1920×1080): petición → Decisión con candidatos → visor sobre un candidato → Entregas con el vídeo de la animación abierto en el visor, convertido a `demo-5b-panel.mp4`. Todos ≤ 20 MB (ajustar `crf`); rutas en el informe final y en `docs/aceptacion-hito5b.md`. Fable los envía al usuario.

### Review Focus añadido
9. Un clip que no se reproduce (pose de reposo congelada, `AnimInstance` sin asignar, montaje que no arranca): el vídeo sale estático; la comprobación mide la diferencia media entre fotogramas consecutivos y, por debajo del umbral, **falla** con «la animación no se reproduce» en vez de aprobar. Prueba con fotogramas idénticos en el fake. (Tarea 2.)
9. Un clip que no se reproduce (pose de reposo congelada, `AnimInstance` sin asignar, montaje que no arranca): el vídeo sale estático; la comprobación mide la diferencia media entre fotogramas consecutivos y, por debajo del umbral, **falla** con «la animación no se reproduce» en vez de aprobar. Prueba con fotogramas idénticos en el fake. (Tarea 2.)

### Review Focus 10 (defecto visto por el usuario en la sonda, 2026-10-24)
En el primer vídeo del MetaHuman (Hudson con `AM_ComboAttack`) el cuerpo seguía el clip pero **la ropa no**: camiseta rígida colgando entre las piernas y pantalones en piezas sueltas (prendas en pose de reposo o tela sin inicializar; usuario: «las partes del cuerpo están raras»). Regla: el personaje se instancia por su Blueprint/actor ensamblado; todos los `SkeletalMeshComponent` distintos del cuerpo (prendas, pelo, cara) llevan `SetLeaderPoseComponent(cuerpo)` o reproducen el mismo clip; la simulación de tela se desactiva o se reinicia durante la captura. La comprobación `animation` **falla** con «prendas sin seguir al cuerpo» si algún componente no tiene leader pose ni AnimInstance, o si su caja envolvente no se mueve con la del cuerpo. El QA visual recibe el vídeo y rechaza ropa que no acompaña. La diferencia media entre fotogramas (Review Focus 9) **no** sustituye esta comprobación.
Precisión (2026-10-24, revisión fotograma a fotograma): el defecto es un **pico de malla desde la cintura hasta el suelo en el origen del actor** (cintura de la camiseta y entrepierna del pantalón): los vértices pesados a `pelvis` colapsan a la raíz porque esa pelvis no recibe la animación (esqueleto del retarget ≠ esqueleto real del preset legacy de Bridge `metahuman_base_skel`, o retarget root mal puesto). Comprobación añadida: durante todo el clip la Z mundial de `pelvis` del cuerpo > 50 cm y el punto más bajo de cada prenda no baja más de 10 cm del punto más bajo del cuerpo; si falla, «malla estirada hacia la raíz». El vídeo de QA lleva **dos ángulos** (frontal 3/4 y lateral) para revisar desde varios ángulos.

---

### Task 5: Cierre con Git LFS y DONE del héroe (decisión del usuario, 2026-10-24)

Usuario, literal: «Ok git lfs». El MetaHuman Hudson (1,36 GB en `Content/MetaHumans`) más los maniquíes (126 MB) y `/Game/Kratos` (7 MB) entran en el git de `KratosFabTest` **con Git LFS**, y la tarea (a) «un héroe MetaHuman con animación de ataque» llega a DONE por el ciclo normal.

**Hechos comprobados (2026-10-24):** `git-lfs/3.7.1` instalado y con los filtros ya configurados en el repo; `KratosFabTest` sin `.gitattributes` y **sin remoto** (LFS funciona en local; si algún día se publica en GitHub, su cuota gratuita de LFS es de 1 GB y este contenido la supera: hay que decirlo). Archivos sueltos de hasta 81 MB (`male_body_normal_map.uasset`, `Hudson.dna` 76 MB, mallas de cara 65-71 MB).

**Files:** Create `service/src/integration/lfs.ts`, `tests/service/lfs.test.ts`; Modify `service/src/handlers/integrate.ts` (o `integration/workspace.ts`), `service/src/adapters/git.ts`, `service/src/repo/capabilities.ts`, `skills/kratos/references/cierre.md`, `docs/aceptacion-hito5b.md` (sección «Cierre con LFS»), `docs/estado-entregas.md` (5b «En `main`», prueba 30), `docs/capturas-5b/`.

- **Detección**: antes de integrar, si el commit del worker trae archivos > 10 MB o más de 100 MB en total y el repo no los cubre con `filter=lfs` en `.gitattributes`, el integrador **no** fusiona: abre la Decisión «Contenido pesado (N MB): Configurar Git LFS (recomendado) / Integrar sin LFS / Cancelar», con el tamaño, el número de archivos y la nota de la cuota de GitHub si no hay remoto o es GitHub. Sin `git lfs` instalado, la opción recomendada no aparece y Capacidades lo dice.
- **«Configurar Git LFS»**: `git lfs install --local` en el checkout del usuario; `.gitattributes` con los patrones de Unreal (`*.uasset *.umap *.ubulk *.uexp *.uptnl *.dna *.fbx *.wav *.mp4 *.tga *.psd *.exr filter=lfs diff=lfs merge=lfs -text`) commiteado en `master` **antes** de integrar; la rama del worker se rehace con `git lfs migrate import --include=<patrones> --yes` acotado a sus commits (`--include-ref` de la rama, sin tocar `master`), y entonces `merge --ff-only` como siempre. Prueba con repos temporales reales (git + git-lfs locales, sin red) y con el fake de git para el camino sin LFS.
- **Capacidades**: fila «Git LFS» (versión, instalado, configurado en el proyecto). Fila «Cascadeur»: el detalle dice el plan detectado («Basic: solo .casc; FBX exige Indie o Pro») con el enlace a `cascadeur.com/plans` en la Decisión «Exportar a mano / Usar solo retarget / Activar licencia».
- **Aceptación**: en `KratosFabTest` (`.kratos-hito5b-lfs`), repetir (a) de principio a fin por el ciclo normal: petición → candidatos → Hudson → migración → `character.setup` → worker en worktree que commitea el contenido y la línea de LiveLink del `.uproject` → revisión → `checks.run` con `animation` (vídeo a dos ángulos) → Decisión de LFS → «Configurar Git LFS» → integración `ff-only` en `master` → cierre → **DONE**. Comprobar después: `git lfs ls-files | wc -l` > 0, `.git` sin los binarios sueltos (objetos LFS en `.git/lfs`), `master` avanzado, `Config/DefaultEngine.ini` **sin seguir y sin tocar**. Tiempos por etapa en `docs/aceptacion-hito5b.md`; captura de la Decisión de LFS y de Capacidades con la fila; `docs/estado-entregas.md` con el 5b en `main` y la prueba 30 pasada.
- [ ] `npm test` ×2 en verde, `npm run test:panel`, `npm run build`, Playwright si tocó el panel; commit `feat: Git LFS al integrar contenido pesado` y `docs: cierre del hito 5b con LFS`.
