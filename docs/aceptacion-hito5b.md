# Aceptación del hito 5b · personajes y animación

Unreal 5.8.3, Windows 11. Las pruebas reales con el editor se hicieron primero en un **proyecto de sonda** (en blanco, con
los plugins PythonScriptPlugin, IKRig y MetaHumanCharacter, y copias de las plantillas del motor y del preset Hudson). Sirvió
para aprender la API sin tocar `KratosFabTest`. Después, la aceptación real se hizo sobre `KratosFabTest` por el servicio de
este worktree (`127.0.0.1:8780`, datos en `KratosFabTest/.nomos-hito5b`, fuera de git por `.git/info/exclude`). Horas en UTC
del 24 de octubre de 2026, sacadas de los comandos del servicio.

## Recorrido real en KratosFabTest

Antes de empezar: KratosFabTest no tenía `Binaries/` y el editor por lotes se cerraba sin informe. Se compiló el módulo de
editor (`Build.bat KratosFabTestEditor`, 44 s; solo crea `Binaries/` e `Intermediate/`, ignorados por git).

| Etapa | Desde → hasta | Duración | Resultado |
|---|---|---|---|
| Indexado del catálogo | 04:28:43 → 04:28:44 | 1 s | Hudson, Emory (Megascans) y las tres plantillas del motor |
| (a) Candidatos para «un héroe MetaHuman con ataque» | 04:29:18 | — | Decisión: MetaHuman Hudson, Manny (maniquí UE5), MetaHuman Emory, con miniaturas |
| (a) Visor sobre Hudson y elección de Hudson en el panel | 04:31:11 → 04:31:22 | 11 s | grabado con Playwright (demo, parte 1) |
| (a) Migración del preset Hudson (1,4 GB) | 04:31:20 → 04:31:38 | 17 s | copiado y verificado |
| (a) Migración de los maniquíes UE5 (esqueleto del clip) | 04:31:39 → 04:31:55 | 16 s | verificado |
| (a) Migración de las animaciones de combate | 04:31:56 → 04:32:08 | 12 s | verificado |
| (a) `character.setup`, primer intento | 04:32:09 → 04:32:24 | 15 s | **falla**: «BP_Hudson no tiene malla esquelética» (hallazgo 5) |
| (a) Migración de nuevo → Decisión «MetaHuman necesita el plugin LiveLink» → «Activar LiveLink» | 04:36:31 → 04:37:02 | 31 s | `.uproject` con LiveLink (4 líneas) |
| (a) `character.setup` con `AM_ComboAttack` retargeteado a Hudson | 04:48:26 → 04:51:21 | **2 min 54 s** | `animation` **passed**: pelvis a 81–84 cm, pose ≤ 0,065 frente al original, 110 fotogramas, movimiento 1,8 % |
| (b) Manny con `AM_ComboAttack` (sin retarget) | 04:52:01 → 04:54:49 | 2 min 47 s | `animation` **passed** |
| (c) Migración del maniquí UE4 | 05:01:34 → 05:01:47 | 13 s | verificado |
| (c) Retarget real UE4 → UE5: `ThirdPersonRun` sobre Manny | 05:01:57 → 05:04:23 | 2 min 26 s | `animation` **passed**; 0 cadenas sin mapear; root motion en `root` |
| (e) Review Focus 1: el clip sobre la malla de la cara (sin piernas) | 05:04:54 → 05:07:41 | 2 min 47 s | falla por pose y bloquea («Animación rota») |
| (e) Lo mismo con el criterio corregido (hallazgo 6) | 05:08:05 → 05:08:19 | 14 s | Decisión **«Retarget manual: LeftLeg, RightLeg sin mapear»** con guion; sin PIE ni vídeo |
| (f) `character.metahuman` Nomos_Heroe por script | 05:08:36 → 05:08:57 | 21 s | sin el plugin MetaHumanCharacter en el proyecto: run esperando externo + Decisión con guion de 5 pasos |
| (d) Cascadeur `cleanup` sobre `MM_Attack_01` | 05:09:06 → 05:09:37 | 31 s | Unreal exporta el FBX, Cascadeur lo importa sin ventana, la exportación la bloquea la licencia gratuita: Decisión «Exportar a mano / Usar solo retarget» y Capacidades «Cascadeur · No responde» con el motivo |
| Entregas con el vídeo en el visor y Capacidades | 05:10 | — | grabado con Playwright (demo, parte 2) |

**Revisión → integración → DONE de (a):** quedó pendiente de una decisión del usuario sobre meter 1,6 GB de binarios en git.
El usuario eligió Git LFS («Ok git lfs») y se hizo después: ver «Cierre con LFS».

**Seguridad.** `Config/DefaultEngine.ini` sigue sin seguir y sin tocar (515 bytes, 2026-10-22 21:20); no entró en ningún commit
ni en ningún informe.

### Entregables

- Vídeos: `docs/capturas-5b/heroe-metahuman-ataque-1280x720.mp4` (Hudson, dos ángulos), `manny-ataque-1280x720.mp4`,
  `retarget-ue4-a-ue5-1280x720.mp4` y `demo-5b-panel.mp4` (29 s: Decisión con candidatos → visor sobre Hudson → elegir →
  Entregas con el vídeo abierto → Capacidades). Cascadeur antes/después: no hay, la licencia no exporta FBX.
- Capturas: `candidatos-1920.png`, `visor-candidato-1920.png`, `entregas-animacion-1920.png`, `visor-video-animacion-1920.png`,
  `capacidades-1920.png`, `pie-heroe-1280x720.png` y `pie-heroe-1920x1080.png`.

## Cierre con LFS (Tarea 5)

Mismo KratosFabTest, servicio de la rama `hito5b-lfs` (`127.0.0.1:8780`, datos en `KratosFabTest/.nomos-hito5b-lfs`, fuera de
git por `.git/info/exclude`), worker y revisores Claude (Sonnet 5.5) por Orca. Antes: `master` en `2263a65`, sin
`.gitattributes`, `.git` de 1,3 GB (1.191 objetos sueltos, 1,22 GiB: los blobs que el worker commiteó antes de decidir LFS).
Horas UTC del 24 de octubre, de los eventos del servicio.

| Etapa | Desde → hasta | Duración | Resultado |
|---|---|---|---|
| Tarea, candidatos y elección de Hudson | 07:34:06 → 07:34:23 | 17 s | Decisión con Hudson, Manny y Emory; planificador en pausa hasta montar el personaje |
| Migraciones (Hudson, maniquíes, animaciones de combate) | 07:34:28 → 07:35:12 | 44 s | ya estaban: solo se copia lo que falta, nada se sobrescribe |
| `character.setup` (Hudson con `AM_ComboAttack`) | 07:35:13 → 07:38:13 | 3 min | `animation` **passed** |
| Worker: copia, compila el módulo y commitea | 07:39:23 → 07:41:53 | 2 min 30 s | 668 archivos, 1,5 GB, iguales al checkout del usuario |
| Siete rondas de revisión y comprobaciones | 07:44:07 → 12:06:56 | 4 h 23 min | ver abajo: casi todo fueron fallos de las comprobaciones de Nomos, corregidos en el código |
| Última ronda de comprobaciones | 11:37:47 → 12:06:56 | 29 min | blueprint 28 s, asset (102 carpetas) 25 min, animation 3 min, map 1 min: **todo en verde** |
| Decisión «Contenido pesado (1491 MB): 666 archivos, 32 de más de 10 MB» | 12:07:28 → 12:07:34 | 6 s | Configurar Git LFS / Integrar sin LFS / Cancelar, con la nota de la cuota de GitHub (sin remoto) |
| `integrate.lfs` (carril largo) | 12:07:57 → 12:08:16 | **19 s** | `git lfs migrate import` de la rama, `.gitattributes` en `master` (`7ff0785`), gc |
| Integración, primer intento | → 12:08:41 | — | **falla**: la raqueta (hito 7) que `master` ya seguía como blob sale «modificada» con el `.gitattributes` nuevo (hallazgo 12) |
| Integración tras el arreglo | 12:41:50 → 12:42:19 | 29 s | `6bbe44d` (la raqueta pasa a puntero, mismo contenido) y merge `9a1c3c7`; sin recomprobar |
| Cierre | 12:42:57 → 12:43:08 | 11 s | **DONE**; archivo de 81 entradas; worktrees retirados |

**Después**, comprobado en KratosFabTest: `master` en `9a1c3c7`; `git lfs ls-files` = **666** (93 de Hudson); `git count-objects`:
13 objetos sueltos (2,7 KiB) y packs de 25 MB, los binarios en `.git/lfs/objects` (1,5 GB); checkout del usuario limpio (la línea
de LiveLink ya es de `master`); Capacidades «Git LFS · git-lfs 3.7.1 · configurado en el proyecto». `Config/DefaultEngine.ini`
**sin seguir y sin tocar** (515 bytes, 2026-10-22 21:20); no está en `master` ni en la rama del héroe. (Dos ramas de workers del 23
de octubre sin fusionar, `kratos/4c443009` y `kratos/2e3d41ae`, tienen un commit que le añade dos líneas: son anteriores y no se tocaron.)
Capturas: `docs/capturas-5b/decision-lfs-1920.png` y `capacidades-lfs-1920.png`.

**Las siete rondas.** El worker cumplió a la primera; lo que fallaba eran las comprobaciones de Nomos sobre contenido de terceros:
blueprint y map daban por rotas las referencias **blandas** que faltan en las plantillas de Epic (malla de vista previa
`SKM_Manny`, secuencias `LS_Attack_*`); asset rechazaba los **planos** del rig facial de MetaHuman y las **tarjetas de pelo** sin
material propio; build comparaba la captura con la **línea base de otro mapa**; map y build elegían como mapa de juego el
**escenario de animación** de Nomos. Además: dos assets de la prueba (c) (`IK_SK_Mannequin` y su retargeter) dependen del maniquí
UE4 (`Content/Mannequin`, fuera del alcance) y se quedaron fuera por decisión del director (la spec se actualizó); una instrucción
mía equivocada (quitar 15 assets, entre ellos los `MM_Attack_*` que forman `AM_ComboAttack`) la paró el segundo revisor y se
deshizo; la rama acabó en un solo commit (`72b3e10`) sobre `2263a65`. Por el límite de correcciones el director subió
`limits.corrections` a 7 en `.nomos-hito5b-lfs/config.json`, con la Decisión registrada.

### Hallazgos del cierre con LFS

10. **Un diff de revisión con 1,5 GB de binarios.** La huella con `diff --binary` tardaba 37 s y la CLI se rendía a los 10 s. Ahora la
    huella sale de los shas de blob (8 s) y `task review` espera hasta 2 min.
11. **Las comprobaciones ensuciaban el worktree** (mapa re-guardado, clips retargeteados nuevos en cada pasada, `Build/`, y un
    `Config/DefaultEngine.ini` que genera el editor con un token propio, no el del usuario). Ahora cada lote deshace lo que escribió.
12. **Adoptar LFS en un repo que ya seguía `.uasset` como blobs.** Con el `.gitattributes` nuevo, esos archivos salen «modificados»
    en cualquier checkout y el merge se niega. El commit de LFS los pasa a puntero (mismo contenido, comprobado por `oid` y
    tamaño). Además, git trunca su mensaje de error a 4 KB: el avance calcula él mismo lo que bloquea y decide por contenido, no por
    la caché de stat (que daba resultados distintos según el reloj).
13. **Un fallo inesperado dejaba la integración retenida.** El run integrador quedaba «en curso» con la reserva y la siguiente
    integración esperaba para siempre. Ahora un fallo definitivo cierra los runs de la orden y suelta sus reservas. (El que quedó
    colgado antes del arreglo se cerró a mano con la misma función, con el servicio parado.)
14. **Más del ciclo.** Una run de assets terminada impedía que el planificador arrancara el worker; un `NOMOS_REVIEW` partido a
    mitad de palabra no se leía; el bloqueo «Máximo de N correcciones» no se levantaba al subir el límite; `task spec` devuelve la
    tarea a `preparada` (hay que pedir al worker que confirme para volver a revisión); un `NOMOS_DONE` idéntico a uno anterior se
    descarta. Todo corregido salvo los dos últimos, que se anotan como pendientes.
15. **Sin vigilante armado, el director tardó 12 min en ver una pregunta del worker.** Hay que armar `nomos vigila` desde el principio.

### Hallazgos del recorrido real

5. **El Blueprint de un MetaHuman de Bridge necesita LiveLink.** Sin el plugin, `BP_Hudson` no compila (nodos `LiveLinkPose`,
   `SetSubject`, `SetRetargetAsset`) y se queda sin mallas. La migración de un preset ahora abre la Decisión «MetaHuman
   necesita el plugin LiveLink» y, con «Activar», lo añade al `.uproject`, como hace Bridge.
6. **Una cadena principal sin pareja en el origen también es «sin mapear».** Un clip con piernas sobre un esqueleto sin
   piernas dejaba vacía la lista del destino. Ahora cuentan los dos lados y sale la Decisión «Retarget manual».
7. **Git Bash convierte `/Game/...` en rutas de Windows.** La CLI recibía `C:/Program Files/Git/Game/...`. Hay que usar
   `MSYS_NO_PATHCONV=1` con `--data` en formato Windows, o PowerShell. Lo dice la referencia de personajes de la skill.
8. **KratosFabTest sin `Binaries/`.** El editor por lotes se cerraba sin informe. Se compiló el módulo a mano. Pendiente:
   que Nomos lo detecte y lo diga, o compile antes de abrir el editor.
9. **«Retarget a mano» no podía funcionar.** Al relanzar, Nomos regeneraba los IK Rig y volvía a mapear todas las cadenas
   (`auto_map_chains(FUZZY, True)`): lo emparejado a mano se perdía. Comprobado en KratosFabTest con el IK Retargeter del
   caso (e): Spine emparejada a mano con Neck volvía a Spine. Ahora el retargeter existente se reutiliza con sus IK Rig y solo
   se rellenan las cadenas sin pareja; la misma prueba conserva Spine ← Neck (después se restauró el mapeo original).

## Hallazgos de la sonda (2026-10-24)

### 1. `RTG_MH_IKRig` es MetaHuman → MetaHuman
`IKRetargeterController` lo confirma: el origen y el destino de `RTG_MH_IKRig` son `IK_MH_IKRig`, con la malla de vista previa
`/MetaHumanCharacter/Body/IdentityTemplate/SKM_Body`. No hay retargeter maniquí → MetaHuman en el plugin. Nomos crea uno
por script (IK Rig autogenerado del origen, `auto_map_chains` FUZZY, `add_default_ops`) y lo ejecuta con
`IKRetargetBatchOperation.run_batch_retarget` (`DuplicateAndRetarget` está deprecado en 5.8).

### 2. `IK_MH_IKRig` no sirve para un MetaHuman de Megascans/Bridge
Con `IK_MH_IKRig` como destino sobre Hudson (`metahuman_base_skel` en `/Game/MetaHumans/Common`), el personaje quedaba de
rodillas a mitad del combo. Con un IK Rig autogenerado para el cuerpo de Hudson queda en guardia, igual que Manny. Nomos usa
el del plugin solo con MetaHumans que no son de Bridge.

### 3. Defecto visto por el usuario: malla estirada hacia la raíz (Review Focus 10)
En el primer vídeo de Hudson, el cuerpo seguía el clip, pero la cintura del jersey y la entrepierna del pantalón se estiraban
hasta el suelo, entre los pies. El usuario dijo: «las partes del cuerpo están raras».
- **Causa raíz.** `add_default_ops` deja la operación «Root Motion» del IK Retargeter con `TargetRoot = pelvis`. Copia la raíz
  del origen (en el suelo) sobre la pelvis del destino. En el clip retargeteado, la pelvis quedaba en (0; −0,3; −5,7) cm y su
  traslación acababa en `spine_01`, así que los vértices pesados a la pelvis caían a la raíz. `set_settings` ignora ese campo:
  el arreglo pasa por el controlador de la operación (`set_target_root_bone('root')`). Ahora la pelvis mide 82–83 cm en todo
  el clip.
- **Un diagnóstico mío que estaba mal.** Interpreté que la pelvis medía 0 porque «en el cuerpo MetaHuman pelvis es un socket».
  Era el síntoma. El director lo corrigió y los datos (traslación local de `pelvis` en el clip) lo confirmaron.
- **Prendas.** Torso, Legs y Feet llevan leader pose al cuerpo. La tela Chaos del jersey se desactiva en el mapa de prueba
  (en el juego, cambiar esa propiedad vuelve a ejecutar el construction script del Blueprint y deja componentes `TRASH_`).
  Además, en el juego se reinicia la tela con distancia 0.
- **Comprobaciones nuevas** de `animation`, que fallan con «malla estirada hacia la raíz»: pelvis del cuerpo > 50 cm en cada
  instante, y ninguna prenda > 10 cm por debajo del punto más bajo del cuerpo. Otra falla con «prendas sin seguir al cuerpo»:
  cada componente tiene leader pose al cuerpo (o AnimInstance propia) y su caja se mueve con la del cuerpo. Con el retarget
  roto marcan «pelvis a 0 cm» en los tres instantes; con el arreglo pasan.
- **El vídeo muestra dos ángulos** (frontal 3/4 y lateral, `hstack`).
- **Aprendizaje.** La diferencia media entre fotogramas detecta un vídeo estático, no una malla mal anclada. Antes de dar por
  bueno un vídeo de animación hay que mirar fotogramas ampliados desde varios ángulos.

### 4. MetaHuman creado por script
`MetaHumanCharacterEditorSubsystem` existe en el editor por lotes; `create_asset` y `try_add_object_to_edit` funcionan.
`build_meta_human` no ensambla: «Character is not rigged». `request_auto_rigging` lanza el inicio de sesión de Epic (EOS, flujo
por navegador con código: `authorization_pending`) y no termina sin la GUI. Tampoco está el contenido opcional de MetaHuman
Creator (texturas). Por eso la vía queda **asistida**: Decisión con un guion de 5 pasos.

### Vídeos de la sonda
- `docs/capturas-5b/sonda/manny-ataque-1280x720.mp4`: Manny con `AM_ComboAttack` original.
- `docs/capturas-5b/sonda/heroe-metahuman-ataque-2-angulos.mp4`: Hudson con `AM_ComboAttack` retargeteado, ya corregido,
  desde dos ángulos.

## Lo que destapó Esquina (2026-10-24)

Dos defectos del servicio que el director de Esquina (UE 5.8.3) estaba sorteando a mano, según su diario.

### 1. La línea base visual no distinguía el mapa por defecto
- **Síntoma.** J0.4 cambió el mapa por defecto a `L_Lookdev` y `build` falló al 100 % contra la línea base del mapa de la
  plantilla; J1.1 falló `map` al 57 % (línea base de `L_Lookdev`, captura de `L_Gym`).
- **Causa.** El nombre de la línea base solo llevaba mapa si el diff tocaba un `.umap` (o lo decía el informe de PIE). Sin él,
  `outcome.map` era nulo y todas las capturas del mapa por defecto compartían `build-1280x720.png` / `map-1280x720.png`.
- **Arreglo.** Sin mapa por diff, recorrido ni informe, map y build toman el mapa con el que arranca el juego:
  `GameDefaultMap` de `Config/DefaultEngine.ini` o, si no está, el último `/Game/` cargado en el log. Se guarda en el TestRun
  y en la captura, y la línea base es siempre `<check>-<mapa>-<captura>.png`. Una línea base antigua sin mapa se adopta para el
  mapa por defecto renombrándola, con una línea en el resumen; un mapa elegido por el diff o por `walkthrough.map` no la adopta.

### 2. `animation` sin personaje bloqueaba la puerta
- **Síntoma.** En J1.2, montajes provisionales sobre secuencias de la plantilla (sin personaje de Nomos) abrieron dos veces
  «Comprobación no disponible: animation»; el director tuvo que elegir «continuar» en cada lote.
- **Causa.** La selección por diff pide `animation` ante cualquier clip o montaje; la comprobación, sin `nomos-personaje.json`
  ni malla con clips en el diff, terminaba `skipped`, y la puerta trata `skipped` como «no se pudo ejecutar».
- **Arreglo.** «No aplica» ya no es «no disponible»: sin personaje que reproducir, `animation` no se selecciona para ese diff y
  el resumen del lote dice «animation no aplica». Con personaje, sigue exigida y, si no se puede ejecutar, abre la Decisión.
