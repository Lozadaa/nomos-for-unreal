# Aceptación del hito 5b · personajes y animación

Unreal 5.8.3, Windows 11. Las pruebas reales con el editor se hicieron primero en un **proyecto de sonda** (en blanco, con
los plugins PythonScriptPlugin, IKRig y MetaHumanCharacter, y copias de las plantillas del motor y del preset Hudson). Sirvió
para aprender la API sin tocar `KratosFabTest`. Después, la aceptación real se hizo sobre `KratosFabTest` por el servicio de
este worktree (`127.0.0.1:8780`, datos en `KratosFabTest/.kratos-hito5b`, fuera de git por `.git/info/exclude`). Horas en UTC
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
| (f) `character.metahuman` Kratos_Heroe por script | 05:08:36 → 05:08:57 | 21 s | sin el plugin MetaHumanCharacter en el proyecto: run esperando externo + Decisión con guion de 5 pasos |
| (d) Cascadeur `cleanup` sobre `MM_Attack_01` | 05:09:06 → 05:09:37 | 31 s | Unreal exporta el FBX, Cascadeur lo importa sin ventana, la exportación la bloquea la licencia gratuita: Decisión «Exportar a mano / Usar solo retarget» y Capacidades «Cascadeur · No responde» con el motivo |
| Entregas con el vídeo en el visor y Capacidades | 05:10 | — | grabado con Playwright (demo, parte 2) |

**Lo que no se hizo: revisión → integración → DONE de (a).** El personaje y sus clips quedan como archivos sin seguir en el
checkout de KratosFabTest (1,4 GB del MetaHuman, 126 MB de los maniquíes, 6 MB de `/Game/Kratos`) más la línea de LiveLink en
`KratosFabTest.uproject`. Llevarlos a DONE por el ciclo normal (worker en un worktree → commit → revisión → `checks.run` con
`animation` → integración en `master`) mete 1,6 GB de binarios en la historia de git del proyecto, sin Git LFS. Es una
decisión del usuario: ver el informe final. `master` sigue en `2263a65`.

**Seguridad.** `Config/DefaultEngine.ini` sigue sin seguir y sin tocar (515 bytes, 2026-10-22 21:20); no entró en ningún commit
ni en ningún informe.

### Entregables

- Vídeos: `docs/capturas-5b/heroe-metahuman-ataque-1280x720.mp4` (Hudson, dos ángulos), `manny-ataque-1280x720.mp4`,
  `retarget-ue4-a-ue5-1280x720.mp4` y `demo-5b-panel.mp4` (29 s: Decisión con candidatos → visor sobre Hudson → elegir →
  Entregas con el vídeo abierto → Capacidades). Cascadeur antes/después: no hay, la licencia no exporta FBX.
- Capturas: `candidatos-1920.png`, `visor-candidato-1920.png`, `entregas-animacion-1920.png`, `visor-video-animacion-1920.png`,
  `capacidades-1920.png`, `pie-heroe-1280x720.png` y `pie-heroe-1920x1080.png`.

### Hallazgos del recorrido real

5. **El Blueprint de un MetaHuman de Bridge necesita LiveLink.** Sin el plugin, `BP_Hudson` no compila (nodos `LiveLinkPose`,
   `SetSubject`, `SetRetargetAsset`) y se queda sin mallas. La migración de un preset ahora abre la Decisión «MetaHuman
   necesita el plugin LiveLink» y, con «Activar», lo añade al `.uproject`, como hace Bridge.
6. **Una cadena principal sin pareja en el origen también es «sin mapear».** Un clip con piernas sobre un esqueleto sin
   piernas dejaba vacía la lista del destino. Ahora cuentan los dos lados y sale la Decisión «Retarget manual».
7. **Git Bash convierte `/Game/...` en rutas de Windows.** La CLI recibía `C:/Program Files/Git/Game/...`. Hay que usar
   `MSYS_NO_PATHCONV=1` con `--data` en formato Windows, o PowerShell. Lo dice la referencia de personajes de la skill.
8. **KratosFabTest sin `Binaries/`.** El editor por lotes se cerraba sin informe. Se compiló el módulo a mano. Pendiente:
   que Kratos lo detecte y lo diga, o compile antes de abrir el editor.

## Hallazgos de la sonda (2026-10-24)

### 1. `RTG_MH_IKRig` es MetaHuman → MetaHuman
`IKRetargeterController` lo confirma: el origen y el destino de `RTG_MH_IKRig` son `IK_MH_IKRig`, con la malla de vista previa
`/MetaHumanCharacter/Body/IdentityTemplate/SKM_Body`. No hay retargeter maniquí → MetaHuman en el plugin. Kratos crea uno
por script (IK Rig autogenerado del origen, `auto_map_chains` FUZZY, `add_default_ops`) y lo ejecuta con
`IKRetargetBatchOperation.run_batch_retarget` (`DuplicateAndRetarget` está deprecado en 5.8).

### 2. `IK_MH_IKRig` no sirve para un MetaHuman de Megascans/Bridge
Con `IK_MH_IKRig` como destino sobre Hudson (`metahuman_base_skel` en `/Game/MetaHumans/Common`), el personaje quedaba de
rodillas a mitad del combo. Con un IK Rig autogenerado para el cuerpo de Hudson queda en guardia, igual que Manny. Kratos usa
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
