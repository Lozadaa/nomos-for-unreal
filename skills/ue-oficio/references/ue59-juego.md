# UE 5.9 en un juego: qué aprovechar y cómo

Mapa de lo nuevo del 5.9 MegaJam Preview que un juego hecho por workers puede usar. Complementa a
[ue59-preview](ue59-preview.md), que cuenta qué cambia para Nomos. Marcas: **[fuente]** notas de la versión o anuncio
(URL al final); **[observado]** leído en la instalación de este equipo (`C:\Program Files\Epic Games\UE_5.9`,
Changelist 60351404) el 2026-11-09; **[plan]** sin probar todavía en un juego de Nomos.

## Cómo se usa este mapa

- **Al repartir (director o arranque):** en cada spec, nombra la feature del 5.9 que encaja con la tarea y su plan B
  de 5.8. Ejemplo: «vidrio con AVBOIT (`r.OIT.Method 1`); si no se ve bien, translucidez normal ordenada».
- **Al trabajar (worker):** prueba la feature en 10 minutos como mucho. Si falla, se cae o no se nota en la captura,
  vuelve al plan B y sigue: el preview es inestable y no puede frenar la tarea.
- **Al entregar:** añade al summary una línea por feature probada, con este formato:
  `NOMOS_UE59 <feature>: usada | descartada — <motivo en una frase>`. Así Nomos aprende qué funciona en 5.9.
- Todo ajuste de render va en `Config/DefaultEngine.ini`, sección `[/Script/Engine.RendererSettings]` o
  `[SystemSettings]`, no en código, para que se pueda quitar con una línea.

## Render y luz

| Feature | Para qué sirve en un juego | Cómo se activa | Estado |
|---|---|---|---|
| **AVBOIT**, transparencia sin orden | Vidrio, agua, humo y partículas que se cruzan sin parpadeo de orden. Ideal para objetos de vidrio que ruedan unos delante de otros. | `r.OIT.Method=1`. Por defecto solo aplica a translucidez Nanite (`r.AVBOIT.Nanite=1`); para mallas normales, `r.AVBOIT.NonNanite=1`. Necesita `r.AVBOIT.Support=1`, que viene encendido y es de solo lectura. [observado] | Sin marca de estado en las notas. El material translúcido debe emitir solo su propio color. [fuente] |
| **Lumen World Cache** | Iluminación global sin tarjetas de malla, por path tracing en tiempo real. | Exige ray tracing por hardware y se activa por proyecto. `r.Lumen.WorldCache.Allowed` viene en 1. El interruptor de proyecto no aparece en `RendererSettings.h`. [fuente; interruptor sin confirmar] | Sin marca. |
| **Ambient Lighting Volumes** | Cajas o esferas que tiñen u oscurecen la luz del cielo dentro, con bordes suaves: interiores, cuevas, sombra bajo un techo. | Actor `AAmbientLightingVolume`. Solo funciona con un Sky Light **Movable** y sin Lumen como iluminación global. [observado + fuente] | Experimental. [fuente] |
| **Sombras lejanas** | Controlar el coste de sombras a distancia. | Por componente: `SetCastFarShadow(bool)` en `UPrimitiveComponent`, propiedad `bCastFarShadow`. También pueden actualizarse a su propio ritmo. [observado + fuente] | Sin marca. |
| **Vistas de depuración de sombras** | Diagnosticar sombras demasiado grandes, cortadas o con ruido. | Vista «Virtual Shadow Map Overview», colores por cascada, tiles de profundidad y vista «Far Shadow». No hay comando publicado. [fuente] | Sin marca. |
| **Nanite: culling más fino** | Más rendimiento con mallas con skin, spline o World Position Offset. | Automático, sin tocar contenido. [fuente] | Sin marca. |
| **Dynamic Wind** | Viento en follaje Nanite por GPU: ráfagas, remolinos, contacto con el personaje. Tiene un modo ligero estilizado. | Plugin `DynamicWind`, apagado por defecto. Epic lo describe como «Extremely experimental». [observado] | Experimental. |

## Animación, VFX y sonido

- **Notifies de UAF con Play Sound y Play Niagara Effect** de serie: un golpe, un paso o un choque con su sonido o
  efecto, sin código propio. [fuente]
- **Control Rig por referencia de asset:** los nodos antiguos quedan deprecados. Usa las versiones por asset. [fuente]
- **IK Retargeter:** Proximity IK, Pelvis Volume y Limb Twist para reutilizar animaciones entre personajes de distinta
  proporción. [fuente]
- **Chooser tables** editables desde Blueprint o Python: elegir animación según estado sin grafos enormes. [fuente]
- **Python ampliado** para audio, MetaSounds, Niagara, materiales, física, PCG, red y UI. Las limitaciones que anota
  [fastvfx](../../nomos/references/fastvfx.md) son de 5.8: vuelve a probarlas antes de rodearlas. [fuente; detalle sin
  publicar]

## Gameplay e IA

- **StateTree editable desde Blueprint o Python**: tareas, consideraciones, evaluadores y tareas globales. Un worker
  puede montar la lógica de una IA por script. [fuente]
- **Navmesh progresivo**: construye tiles poco a poco, con un tope por tick, y puede conservar los que quedan fuera
  del radio del invocador. Útil en mapas grandes o generados. [fuente]
- **Mass Characters**: muchedumbres con Mass, interpolación, visualización y replicación selectiva de pawns. [fuente]
- **World Partition y Data Layers**: funciones nuevas de Blueprint para capas hijas y para saber si algo pertenece a
  una capa. [fuente]
- **PCG**: nodo Concave Hull, validación de aristas desde script y HLSL de nodos personalizados desde Blueprint. Sigue
  las reglas de [pcg](pcg.md). [fuente]

## UI

- **Widget Component con profundidad y velocidad**: los widgets en 3D se integran con TSR y motion blur sin estelas.
  [fuente]
- **Editable Text** con eventos y colores de selección; **List View y Tile View** con orientación y opciones de
  selección. [fuente]
- El toolset de UMG ya no existe en 5.9; ahora hay toolsets de CommonUI, animación de widgets y análisis estático de
  widgets. Nomos no usa toolsets, así que no afecta a [ue-umg-ui](../../ue-umg-ui/SKILL.md). [observado]

## Editor y scripts

- **Editar Blueprints desde Python o Blueprint**: grafos, nodos y variables. Antes de escribir un Blueprint a mano en
  C++, mira si se puede montar por script. [fuente]
- **Map Check** como subsistema, con log desde Blueprint y sustitución de actores por asset o clase. [fuente]
- **Rutas extra de Python** gestionables desde el editor. [fuente]
- **Modular Test Framework** para tests acotados de plugins. Los tests de juego de Nomos siguen siendo de
  automatización (`nomos ue test`). [fuente]

## No usar en un juego de Nomos

- **Unreal Canvas, Unreal Assistant y Slate Qt Bridge**: necesitan una persona en el editor o claves de API propias.
- **Target WebAssembly**: exige compilar el motor desde código fuente.
- **Cambiar el root component de un Blueprint desde Python**: puede tumbar el editor (UE-411502). Que una clase base
  C++ sea dueña del root. [fuente]
- **Deshacer tras añadir nodos de Deformer Graph por script**: puede tumbar el editor y perder lo no guardado. Guarda
  antes. [fuente]

## Fuentes

- Notas de la versión 5.9: https://dev.epicgames.com/documentation/unreal-engine/unreal-engine-5-9-release-notes
- Anuncio del preview: https://forums.unrealengine.com/t/unreal-engine-5-9-megajam-preview/2852840
- Nombres de variables, clases y plugins: código y `.uplugin` de la instalación local, rutas
  `Engine/Source/Runtime/Renderer/Private/OIT/`, `Engine/Source/Runtime/Engine/Classes/Engine/AmbientLightingVolume.h`,
  `Engine/Source/Runtime/Engine/Classes/Components/PrimitiveComponent.h` y `Engine/Plugins/Experimental/DynamicWind/`.
