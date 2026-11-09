# PCG en UE 5.8 desde un agente

El harness de origen montó grafos con el MCP de Epic; lo marcado **[MCP]** puede no pasar desde `nomos ue py`. Ninguna
regla se ha probado aún en Nomos.

## Ejecutar

- **Un grafo a la vez y espera a que termine**, también con volúmenes distintos del mismo grafo: el estado de ejecución
  vive en el asset y dos a la vez congelan el editor. Encaja con el turno de Unreal de Nomos. [probado]
- **Cuenta instancias al acabar** (ISM > 0) y comprueba la malla de cada ISM con su propiedad `StaticMesh`, no con el
  nombre. Una ejecución sin errores con 0 instancias es el fallo silencioso habitual. [probado]
- 49 edificios de gramática en serie, ~3 ISM cada uno, sin congelones. Más de eso, por lotes y verificando. [probado]
- La regeneración es asíncrona: mide límites en una llamada posterior (6-10 s). [probado]
- La primera lectura de datos de un nodo tras ejecutar puede salir vacía; vuelve a ejecutar antes de dar por malo. [MCP]

## Regenerar

- Cambiar material o descriptor del spawner no se aplica al reejecutar: borra el volumen y créalo de nuevo. Los
  cambios de escala sí. [probado]
- Cambiar el valor por defecto de un grafo no regenera los actores que lo usan, ni reasignar el mismo grafo. Para
  forzar: asígnale otro grafo y vuelve al original. [probado]
- El PCG de un componente de Blueprint se regenera al editar propiedades, no con «execute» del volumen; el componente
  acaba en `TRASH_`, así que vuelve a pedir la referencia. [probado]

## Nodos y datos

- No escribas `$Scale.Z` ni otra propiedad de transform a media cadena tras uniones o particiones: 0 instancias sin
  error. Para alturas por zona, `PCGMeshSelectorByAttribute`, o separa por zona, un `Transform Points` por grupo y
  Merge antes del spawner. [probado]
- La paleta del `Static Mesh Spawner` vive en `meshSelectorParameters` → `meshEntries` (`{descriptor:{staticMesh},
  weight}`). Selectores en 5.8: Weighted (por defecto), ByAttribute, WeightedByCategory, PrimitiveData. [probado]
- Al editar un nodo, manda el conjunto completo de parámetros: se fusiona y una clave vieja se queda. [MCP]
- Arrays (`meshEntries`, puntos de spline): de uno en uno («insertion points ambiguous»). [MCP; en Python asignar la
  lista entera probablemente funciona]
- Para recortar, `Difference` o `Cull Points Outside Actor Bounds`; `bCullPointsOutsideVolume` de `Create Points Grid`
  devolvió 0 puntos porque los límites del volumen se expanden después de generar. [probado]
- `Cluster` escribe su atributo como string: `Attribute Cast` a número antes de hacer cuentas. [probado]
- Pivote centrado (como `/Engine/BasicShapes/Cube`): apóyalo con `Attribute Maths Op` `$Position.Z = $Scale.Z × 50`;
  el `offset` de `Transform Points` no escala por punto. Con pivote en la base, quita ese nodo o flotará. [probado]
- Los pines de Attribute Maths cambian: con el operando en `inputSource`, un pin `In`; con `Create Constant`
  conectado, `InA`/`InB`/`InC`. Clamp es unario. [probado]
- Color por instancia: `instanceDataPackerType=PCGInstanceDataPackerByAttribute` con el atributo y
  `PerInstanceCustomData[0]` en el material. [probado]
- 5.8 no trae nodo Voronoi: `Cluster` (KMeans/EM) o el plugin PCGEx (MIT, dice soportar 5.8; sin probar). [fuente]
- 5.9 Preview anuncia nodo Concave Hull y funciones para añadir y validar aristas del grafo desde script; Voronoi sigue
  sin anunciarse. Nada de esto probado en Nomos: [ue59-preview](ue59-preview.md#pcg). [fuente]
- Los overrides de parámetros por instancia quedaron inertes vía MCP; el apaño fue duplicar el grafo por variante.
  Desde Python, prueba primero los setters de parámetros del grafo. [MCP]

## Gramática de edificios del plugin [probado]

- Grafo `/PCG/SampleContent/Grammar/Graphs/PCG_BuildingSample` y actor `BP_BuildingSample`. Duplica el grafo; no edites
  la muestra.
- Cadena: spline cerrada de planta → `Duplicate Cross-Sections` (pisos) → `Spline to Segment` → `Select Grammar` →
  `Subdivide Segment` → spawner ByAttribute.
- Quita el tinte verde: `debugFloors/debugModules=false` y `bOutputDebugColorAttribute=false` en Duplicate
  Cross-Sections y Subdivide Segment.
- La planta no está centrada en el actor: mide el desfase con un edificio de prueba (depende del kit). Escalar el actor
  añade módulos, no los estira.
- No tiene techo: coronas y tapas como actores aparte a `bounds.max.z`.
- Módulos del kit: ver [importar](importar.md) (ancho en +X, pivote en la base).
