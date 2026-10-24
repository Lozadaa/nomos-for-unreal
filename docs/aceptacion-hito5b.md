# Aceptación del hito 5b · personajes y animación

Unreal 5.8.3, Windows 11. Las pruebas reales con el editor se hicieron primero en un **proyecto de sonda** (en blanco, con
los plugins PythonScriptPlugin, IKRig y MetaHumanCharacter, y copias de las plantillas del motor y del preset Hudson). Sirvió
para aprender la API sin tocar `KratosFabTest`. La aceptación sobre `KratosFabTest` por el servicio va en las secciones de recorrido.

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
