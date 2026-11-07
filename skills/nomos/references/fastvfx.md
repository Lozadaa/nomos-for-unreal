# FASTVFX: efectos y materiales por receta

La IA diseña (elige plantilla y valores), el generador construye, la caché decide qué hace falta y la captura
verifica. Para un VFX o un material **no se escribe Python nodo a nodo**: se escribe una receta y se ejecuta
`nomos fastvfx crear`. Solo si ninguna plantilla sirve se construye a mano (y conviene proponer una plantilla nueva).

## Plantillas (v1)

| Plantilla | Tipo | Qué sale | Parámetros (rango) |
|---|---|---|---|
| `M_Master_VFX` | material | MI de `/Game/FastVfx/Maestros/M_Master_VFX` (aditivo, sin luz, válido en sprites/mallas/ribbons de Niagara) | `Color` [r,g,b(,a)], `Intensidad` 0–200, `Opacidad` 0–1, `RadioInicio`/`RadioFin` 0–1, `Suavidad`, `Anillo` 0–1, `AnchoAnillo`, `Caida` 0,1–8, `FresnelExp` 0,1–20, `FresnelPeso`, `RuidoEscala`, `RuidoVelocidad` −10–10, `RuidoPeso`, `DistorsionFuerza`; estáticos: `UsarMascaraRadial`, `DesvanecerConEdad`, `UsarFresnel`, `UsarRuido`, `UsarDistorsion` |
| `M_Master_Hologram` | material | MI del holograma (Fresnel, líneas de barrido, parpadeo) | `Color`, `Intensidad`, `Opacidad`, `FresnelExp`, `BrilloInterior`, `LineasDensidad` 0–20, `LineasVelocidad`, `LineasPeso`, `Parpadeo` 0–1, `ParpadeoVelocidad` |
| `FX_Energy_Base` | niagara | Copia de `/Game/FastVfx/Sistemas/FX_Energy_Base` (núcleo, onda expansiva, chispas, secundarias) con sus MIs | `Color`, `Intensidad` 0–20 (material); `Particulas` 0–5000, `Vida` 0,05–20, `Escala` 0,05–20 (parámetros de usuario del sistema) |

`nomos fastvfx plantillas` da la lista exacta con valores por defecto. Para un efecto sobre una esfera
(escudo, plasma) pon `UsarMascaraRadial: false` y `DesvanecerConEdad: false`: la máscara y la edad son para sprites.

## Receta

```json
{"fastvfx": 1, "nombre": "MI_Escudo_Azul", "plantilla": "M_Master_VFX", "calidad": "alta",
 "carpeta": "/Game/FastVfx/Generado", "parametros": {"Color": [0.1, 0.45, 1], "Intensidad": 5, "UsarFresnel": true},
 "preview": {"frame": 0.5}}
```

Campos: `fastvfx` (1), `nombre`, `plantilla`, opcionales `version_plantilla`, `carpeta` (por defecto
`/Game/FastVfx/Generado`), `calidad` (`alta`, `media` sin distorsión, `baja` sin ruido ni distorsión) y `preview.frame`
(segundos; en Niagara la edad exacta del sistema). Cualquier otro campo, parámetro o valor fuera de rango se rechaza
antes de abrir Unreal. Un archivo puede llevar una receta o una lista.

## Comandos (desde la carpeta del juego, con `--data .nomos`)

- `nomos fastvfx validar recetas/*.json`: solo comprueba.
- `nomos fastvfx crear recetas/a.json recetas/b.json --preview`: todo el lote en una apertura del editor (más otra
  en modo juego para las capturas). Imprime por receta la clase (`acierto`, `usuario`, `parametros`, `estaticos`,
  `nuevo`, `estructural`), tiempos, instrucciones del material y la ruta del PNG en `Saved/FastVfx/previews/`.
- `nomos fastvfx variar recetas/a.json --nombre FX_Energy_Roja --set Color=1,0.1,0.05 --set Particulas=200 --guardar recetas/roja.json --preview`.
- `nomos fastvfx log`: últimos lotes con sus medidas. `nomos fastvfx olvidar`: vacía la caché.

## Qué hace la caché

| Cambio | Qué hace FASTVFX |
|---|---|
| Nada (misma receta, asset y captura en disco) | No abre Unreal (`acierto`). |
| Solo `Particulas`/`Vida`/`Escala` de Niagara | El asset no cambia; los valores van al lanzar el sistema (`usuario`). Abre el modo juego solo para la captura. |
| Valores dinámicos (color, intensidad, ruido…) | Solo actualiza la MI; no compila shaders nuevos (`parametros`). |
| Switches estáticos o `calidad` | La MI compila su permutación de shader (`estaticos`). |
| Asset nuevo | MI o copia del sistema base ya construido (`nuevo`). |
| Plantilla, generador o versión de UE distintos | Reconstruye el maestro o el sistema base (`estructural`); el `.uasset` del sistema se borra con el editor cerrado. |

## En Blueprint o C++

Las variantes de Niagara guardan en el asset el color y la intensidad (sus MIs). `Particulas`, `Vida` y `Escala` son
parámetros de usuario: el valor de la receta se aplica al lanzar el sistema, p. ej.
`NiagaraComponent->SetVariableInt("Particulas", 200)` o `SetVariableFloat("Vida", 1.2f)`. El valor por defecto que
guarda el asset es el del sistema base (80, 1, 1): **no se puede cambiar desde Python en UE 5.8** (ver limitaciones).

## Verificación que hace sola

- Recetas: esquema, tipos, rangos y plantilla existente; nada de la receta se ejecuta como código.
- Unreal: cada conexión de nodo, cada parámetro de MI releído después de fijarlo, los parámetros de usuario del sistema
  leídos con un `NiagaraComponent`, `get_statistics` con shaders compilados de verdad (`-RenderOffscreen`).
- Captura: si la imagen no tiene píxeles de efecto (saturados o casi blancos sobre el escenario gris) la receta falla.

## Limitaciones conocidas

- Los valores por defecto de los parámetros de usuario de una copia de Niagara no se pueden fijar desde Python
  (`ExposedParameters` no es visible y `NiagaraExternalEditUtilities` de 5.8 es solo C++). Hace falta un ayudante C++.
- No hay evaluación por visión de la calidad artística: la captura demuestra que el efecto se pinta, no que sea bonito.
- Sin HLSL propio: los maestros usan nodos del motor.
- Arcos eléctricos y distorsión en el sistema Niagara no están en v1 (la distorsión existe en el material).
