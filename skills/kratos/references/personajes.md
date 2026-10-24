# Personajes y animación

Política (decisiones del usuario, 2026-10-23 y 2026-10-24): **nunca Meshy** para personajes, formas orgánicas, `rig` ni
`animate`; los personajes salen del catálogo y los clips, del catálogo retargeteado; las animaciones tienen que funcionar
sobre MetaHuman; Cascadeur solo cuando hace falta; toda animación deja un vídeo y nunca se aprueba rota.

## 1. Candidatos primero

```sh
kratos asset candidates --task <id> "héroe MetaHuman con ataque" --animation AM_ComboAttack --data .kratos
```

Abre una Decisión con hasta tres personajes (miniatura si la hay, origen, licencia, coste). Orden: catálogo propio →
plantillas del motor (Manny, Quinn, maniquí UE4) → presets MetaHuman de Megascans → packs de Fab con esqueleto; si la
petición nombra MetaHuman, los presets van primero. Abrir la miniatura no elige. Sin candidatos: «Buscar en Fab» (nivel 2,
con clics) o «Usar maniquí del motor». Al elegir, el servicio encola la migración del personaje, la de los packs de los
clips (y del esqueleto de esos clips) y después `character.setup`; la tarea queda «Esperando editor».
Un preset MetaHuman de Bridge necesita el plugin **LiveLink**: la migración abre Decisión antes de activarlo en el `.uproject`.

## 2. `character.setup`: retarget y comprobación `animation`

```sh
kratos asset character /Game/MetaHumans/Hudson/BP_Hudson --task <id> --animation /Game/Variant_Combat/Anims/AM_ComboAttack --metahuman --data .kratos
```

En Git Bash, las rutas `/Game/...` se convierten en rutas de Windows: lanza con `MSYS_NO_PATHCONV=1` y pasa `--data`
en formato Windows (`cygpath -w`), o usa PowerShell.

- Mismo esqueleto: el clip se usa tal cual. Otro esqueleto: IK Rig autogenerado para origen y destino, IK Retargeter con
  cadenas mapeadas y `run_batch_retarget`. La raíz del «Root Motion» se fija a `root`: el valor por defecto (pelvis) deja la
  malla de un MetaHuman estirada hasta el suelo. Con un MetaHuman de Megascans no se usa `IK_MH_IKRig` (es del esqueleto de
  MetaHuman Creator).
- Cadena principal sin mapear (columna, cuello, cabeza, brazos, piernas): Decisión «Retarget a mano» con guion; la tarea no avanza.
  Al relanzar, el IK Retargeter que ya existe se reutiliza tal cual: solo se rellenan las cadenas sin pareja, nunca se pisa lo
  emparejado a mano.
- Un `character.setup` por clip (`--animation` una vez): cada clip tiene su PIE, su vídeo y su veredicto. Si el clip no está en
  el catálogo, la tarea se bloquea con «Falta el clip…» y la salida (`asset cascadeur --why clip_missing`).
- PIE en `/Game/Kratos/Maps/AnimTest` a 1280×720 y 1920×1080, congelado en el 0, 50 y 90 % del clip; vídeo del clip entero a
  30 fps desde dos cámaras (frontal 3/4 y lateral, unidas con `hstack`), MP4 H.264 si hay ffmpeg o zip de fotogramas si no.
- Falla con: caja del actor > ×3 de la de reposo; huesos con escala 0; pose lejos del original (sondas fuera de cámara);
  «malla estirada hacia la raíz» (pelvis < 50 cm o una prenda > 10 cm por debajo del cuerpo); «prendas sin seguir al cuerpo»
  (sin leader pose ni AnimInstance, o su caja quieta); «la animación no se reproduce» (vídeo estático).
- Deja `kratos-personaje.json` en la raíz del proyecto: `checks.run` repite la comprobación sobre el diff.

Antes de dar por bueno un vídeo de animación, míralo ampliado desde los dos ángulos: una métrica en verde no garantiza
que todas las partes acompañen al esqueleto.

## 3. MetaHuman creado por script (asistido)

`kratos asset metahuman <Nombre> --task <id>` intenta crear y ensamblar con `MetaHumanCharacterEditorSubsystem`. En UE 5.8.3,
el ensamblado exige el auto-rig, que es un servicio en la nube con inicio de sesión: la run queda esperando con Decisión y
un guion de 5 pasos en el editor. Nunca se da por hecho un MetaHuman que no existe.

## 4. Cascadeur, solo si hace falta

```sh
kratos asset cascadeur /Game/.../MM_Attack_01 --task <id> --action cleanup|author|fix-retarget --why clip_missing|retarget_rejected|user_request --mesh /Game/.../BP_Hudson [--metahuman]
```

Sin motivo válido, el servicio lo rechaza (`cascadeur_not_justified`). Unreal exporta el clip a FBX, Cascadeur lo procesa sin
ventana (`--run-python-code`) y exporta solo huesos (Z arriba, binario). El FBX vuelve a Unreal y el clip importado pasa por
`character.setup` sobre `--mesh`: sin su comprobación `animation` en verde no se usa.
La licencia gratuita o de prueba solo guarda `.casc`: Capacidades lo dice y la Decisión ofrece exportar a mano o seguir
solo con el retarget. Un FBX dejado en `.kratos/cascadeur/out/<run>.fbx` reanuda el flujo. Crear un clip (`author`) es trabajo
de animador: siempre va por el camino asistido (Decisión con guion y espera de ese FBX). El clip nuevo abre la Decisión
«Clip nuevo de Cascadeur» solo cuando su comprobación `animation` pasa, para que el usuario lo vea en Entregas.
