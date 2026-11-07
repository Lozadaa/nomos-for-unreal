# Importar mallas, materiales y texturas sin sorpresas

## Escala y ejes

- **Mide siempre tras importar** (`get_bounding_box`, `get_actor_bounds` o el `tam` del JSON de escena). Señales:
  - ×100: la malla vino en metros a una escena en cm (400 cm entraron como 400 m). [probado]
  - ×10 y Y arriba: mallas generadas por IA y glTF. Corrige escala y rotación en la importación. [probado]
  - «Se ve la sombra pero no el objeto»: escala ×100, `bOwnerNoSee` o cámara dentro del plano de recorte. [probado]
- Rango sano por defecto: la dimensión mayor entre 1 cm y 50 m, salvo que la spec diga otra cosa.

## Desde Blender [probado]

- Escena en centímetros (`scale_length=0.01`, unidad `CENTIMETERS`) y FBX con `FBX_SCALE_ALL` y `apply_unit_scale`.
  No te fíes de lo que «dice» un FBX: mide en UE.
- Antes de exportar, comprueba en Blender que los límites cumplen la spec (centrado, ancho, base en 0, alto) y deja un
  JSON con ellos junto al FBX; en UE, compara. Una razón de ×100 es error de unidades.
- **No llames a `mesh.materials.clear()` después de asignar `material_index` por cara**: todas las caras vuelven al
  índice 0 y UE importa un solo slot. Comprueba que hay más de un índice antes de exportar.
- Módulos de kit (paredes, fachadas): ancho en +X local y centrado, profundidad en Y fina y centrada, pivote en la base
  (`min.z = 0`). La gramática de edificios de PCG calcula el tamaño así; un kit con el ancho en Y quedó solapado y
  girado.

## Reimportar

- Si borras una malla para reimportarla, las referencias duras a ella (Blueprints, `meshInfo` de PCG) quedan en None y
  no se reenlazan. Reimporta encima o reapunta todo. [probado]
- Leer qué malla tiene un componente: su propiedad `StaticMesh`, no el nombre del componente. [probado]

## Materiales

- Lee los nombres de slot de la malla; no supongas índices. [plan]
- Asigna el material en el asset de StaticMesh si debe valer para todas las copias colocadas. [probado]
- Mejorar el material maestro (albedo, normal) mejora todas sus instancias a la vez. [probado]
- Una variación de color por objeto sin material propio: duplica la malla con su instancia de material, o datos por
  instancia (`PerInstanceCustomData`) si es ISM/PCG. [probado]
- No pongas un albedo con ventanas pintadas sobre una malla con relieve propio: aplana el detalle. [probado]
- Metal pulido bajo cielo despejado se ve negro: tinte claro y un emisivo leve (0,15-0,2). [probado]

## Texturas

- Altura o máscara: sRGB desactivado y el sampler en `LinearColor`, o el material no compila bien. [probado]
- Los PNG de decal suelen entrar como `TC_EditorIcon`: pásalos a `TC_Default`. [probado]
- Normal desde altura: `NormalFromHeightmap` (o tres muestras de altura y `DeriveNormalZ`) con intensidad baja,
  ≈0,3. A 1,5 la piedra parece papel de lija. [probado]

## Decals

- Proyectan por su +X local. Ponlo ~100 cm delante de la pared con profundidad de 400 cm o más y pruébalo primero con
  un decal rojo opaco para ver dónde cae. [probado]
- Usa solo el alfa de la textura con color neutro: si toma el RGB, sale teñido. [probado]
- Grietas y suciedad generadas por IA se ven sintéticas: pocas vetas y opacidad ≈0,3. [probado]

## Datos de terceros

- Valida offline los binarios generados (glTF, buffers) antes de dárselos al editor: un accessor mal dimensionado tumbó
  el RHI sin ningún error de Python. [probado]

Orden que funciona para dar detalle: materiales buenos → geometría con bisel (Nanite) → trim sheets → luz; decals al
final y sutiles. [plan]
