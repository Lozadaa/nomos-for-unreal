# Arsenal visual

Qué hay en este entorno para que el juego se vea con oficio, por necesidad y de más a menos calidad, con su coste.
Elige en el **plan de arte** (`docs/direccion.md`, `## Plan de arte`) antes de programar nada visible, y reserva para lo
visual al menos un tercio del tiempo: no lo dejes para el final. Una forma de `/Engine/BasicShapes` solo con
`// forma-basica: <motivo>` en la línea y nunca para Protagonista, Amenaza u Objetivo (`revisar_acabado.py` lo bloquea).
La pregunta de control, con tus `docs/capturas/detalle-*.png` delante: ¿parece un juego que alguien querría jugar o un prototipo gris?

## Una forma protagonista (y amenazas, objetivos)
- **Malla procedural con normales suaves y UV** (`UProceduralMeshComponent`, módulo `ProceduralMeshComponent` en Build.cs y en
  el `.uproject`): perfil de 15-30 puntos suavizado (Catmull-Rom) y torneado o extruido, 24-48 lados, una normal por vértice
  (no por cara: facetado = prototipo), UV y color por vértice. 20-40 min. Lo mejor para objetos con forma clara.
- **Geometry Script** (plugin `GeometryScripting`, viene con el motor): booleanas, barridos por curva, biselado y remallado
  desde Python en el editor caliente (`nomos ue py`), guardado como StaticMesh. 30-60 min; para piezas duras con detalle. {unreal}
- **Blender por línea de órdenes** (modelado por script, exporta FBX) e importar con la receta `importar_malla`, que mide
  la escala. 30-60 min; orgánico o con muchos detalles. {blender}
- **Biblioteca de Fab**: `nomos asset search "<palabras>"`, `nomos asset download <id>`, `asset migrate` y `asset prepare`.
  5-15 min si hay algo que encaje con la dirección; mira la miniatura antes. {fab_plugin}
- **Meshy**: `nomos asset generate <tarea> --kind text|image`, varias cuentas, gasta créditos; solo piezas rígidas (nunca
  personajes, rig ni animación) y revisa la malla antes de usarla. 5-10 min de espera. {meshy}

## Un material con vida
- Color por vértice desde la malla procedural (veta, desgaste, franjas pintadas) + un material propio con ruido a dos
  escalas, rugosidad que cambia (barniz 0,3-0,4, tierra 0,9) y normal o relieve. Un color plano por pieza es prototipo.
- `nomos fastvfx crear <receta.json> --preview` para materiales de efecto (brillo, holograma, energía): ver fastvfx.md.
- Material propio por Python en el editor caliente (`nomos ue py`); en 5.9 compílalo con renderer y míralo en una captura.
- MCP de Unreal en el editor, si está, para inspeccionar y ajustar materiales y actores sin escribir un script. {unreal_mcp}

## Un suelo
- Malla procedural de rejilla (60×60 o más) con color por vértice de ruido fbm a dos escalas, degradado hacia el borde
  (tierra → hierba) y relieve leve; encima, 100-500 piedras, matas o marcas repartidas con instancias (`UInstancedStaticMeshComponent`,
  mallas propias) o receta `poblar_pcg`. 20-30 min. Un plano de un color es prototipo.

## Un fondo
- Horizonte o paredes que cuenten dónde estamos: `SkyAtmosphere` + `ExponentialHeightFog` cálida o fría según la dirección,
  siluetas lejanas (árboles, casas, montes) con mallas sencillas propias y niebla. Nunca gris liso.

## Luz y cámara
- Luz con intención: sol bajo con color, cielo, sombras suaves; receta `post_exterior` como punto de partida (iluminacion.md).
- Posproceso en la cámara: exposición fija, bloom suave, viñeta 0,4-0,6, motion blur leve, gradación hacia la paleta.
- Cámara que sigue la acción (muelle con retardo, encuadre a tres cuartos, acercarse en el golpe) en vez de un plano fijo
  (camara-pawn.md). Lumen está activo por defecto: aprovecha luz de rebote y emisivos.

## Movimiento y efectos
- Niagara (plugin activo en la semilla) o `nomos fastvfx` (`FX_Energy_Base`): polvo al chocar, chispas, estelas.
- Movimiento secundario barato: bamboleo, inclinación, estela con malla procedural, sacudida de cámara en el impacto.

## Sonido
- `nomos sonido buscar "<palabras en inglés>"` y `nomos sonido bajar <id> --juego .` (WeLoveIndies, con licencia; requiere
  `nomos sonido login`). Plan B: MetaSounds (plugin activo en la semilla) o sintetizado.
