# Glifos de Nomos

Corrección del hito 9, 2026-10-23, con CORRECCIÓN 2 de agentes. La leyenda tiene **38 entradas: 30 iconos y 8 pastillas de proveedor**, incluido OpenCode. Antes de la corrección 2 eran 37; originalmente eran 68. Las pastillas identifican proveedores sin agente; los agentes usan monograma circular y nombre corto, según el addendum del brief.

## Registro y ubicaciones comprobables

La columna «Dónde aparece» conserva la referencia de la galería; la tabla de integración siguiente describe también las vistas conectadas en `hito9-vistas`. El registro se consulta desde la leyenda `?`, desde la paleta y desde `/estilo`.

| Clave | Glifo | Significado | Dónde aparece |
|---|---|---|---|
| `area/gameplay` | `Gamepad2` | Gameplay | /estilo · Glifos y Arte |
| `area/ui` | `LayoutPanelTop` | UI | /estilo · Glifos y Arte |
| `area/vfx` | `Sparkles` | VFX and materials | /estilo · Glifos y Arte |
| `area/camara` | `Video` | Camera | /estilo · Glifos y Arte |
| `area/ia` | `BrainCircuit` | AI | /estilo · Glifos y Arte |
| `area/escenarios` | `Mountain` | Levels | /estilo · Glifos y Arte |
| `area/assets` | `Box` | Assets | /estilo · Glifos y Arte |
| `area/animacion` | `PersonStanding` | Animation | /estilo · Glifos y Arte |
| `area/audio` | `AudioWaveform` | Audio | /estilo · Glifos y Arte |
| `area/qa` | `FlaskConical` | QA | /estilo · Glifos y Arte |
| `area/builds` | `Package` | Builds | /estilo · Glifos y Arte |
| `taskState/pendiente` | `Circle` | Pending | /estilo · Glifos; mapa de Arte para estados y modificadores |
| `taskState/preparada` | `CircleDot` | Ready | /estilo · Glifos; mapa de Arte para estados y modificadores |
| `taskState/implementando` | `Hammer` | Building | /estilo · Glifos; mapa de Arte para estados y modificadores |
| `taskState/revisando` | `Eye` | Reviewing | /estilo · Glifos; mapa de Arte para estados y modificadores |
| `taskState/probando` | `TestTube2` | Testing | /estilo · Glifos; mapa de Arte para estados y modificadores |
| `taskState/integrando` | `GitMerge` | Merging | /estilo · Glifos; mapa de Arte para estados y modificadores |
| `taskState/cerrando` | `DoorClosed` | Wrapping up | /estilo · Glifos; mapa de Arte para estados y modificadores |
| `taskState/done` | `CheckCircle2` | Done | /estilo · Glifos; mapa de Arte para estados y modificadores |
| `taskState/bloqueada` | `Ban` | Blocked | /estilo · Glifos; mapa de Arte para estados y modificadores |
| `taskState/decision` | `HelpCircle` | Needs decision | /estilo · Glifos; mapa de Arte para estados y modificadores |
| `directorState/esperando` | `Hourglass` | Idle | /estilo · Glifos |
| `directorState/escuchando` | `Radio` | Listening | /estilo · Glifos |
| `directorState/atendiendo` | `Activity` | Working | /estilo · Glifos |
| `directorState/vigilanteCaido` | `WifiOff` | Watcher down | /estilo · Glifos |
| `directorState/desconectado` | `PlugZap` | Disconnected | /estilo · Glifos |
| `provider/codex` | `Pastilla` | Codex | /estilo · Glifos y Arte |
| `provider/claude` | `Pastilla` | Claude | /estilo · Glifos y Arte |
| `provider/opencode` | `Pastilla / Oc` | OpenCode | /estilo · Glifos y grupo de agentes; sin adaptador nuevo en servicio |
| `provider/meshy` | `Pastilla` | Meshy | /estilo · Glifos y Arte |
| `provider/blender` | `Pastilla` | Blender | /estilo · Glifos y Arte |
| `provider/unreal` | `Pastilla` | Unreal | /estilo · Glifos y Arte |
| `provider/nomos` | `Pastilla` | Nomos | /estilo · Glifos y Arte |
| `provider/launcher` | `Pastilla` | Launcher | /estilo · Glifos y Arte |
| `artifact/model` | `Shapes` | Model | /estilo · Glifos |
| `artifact/texture` | `Image` | Texture | /estilo · Glifos |
| `artifact/screenshot` | `Camera` | Screenshot | /estilo · Glifos |
| `artifact/video` | `Film` | Video | /estilo · Glifos |
| `artifact/build` | `PackageCheck` | Build | /estilo · Glifos |
| `artifact/report` | `FileText` | Report | /estilo · Glifos |
| `artifact/diff` | `Diff` | Changes | /estilo · Glifos |

## Lectura y reutilización

| Grupo | Integración en las vistas |
|---|---|
| Áreas | Producción (fila y compositor), detalle y fallback de Catálogo y Decisiones; leyenda y Estilo |
| Estados de tarea | Fila, stepper, estado de Capacidades y eventos de su entidad; leyenda y Estilo |
| Estados del director | Leyenda y Estilo; la franja mantiene el punto y el copy de sus cinco estados |
| Proveedores | Monograma + nombre en fila, Chat y Capacidades; pastilla sin agente en fuentes, eventos y capacidades de servicio; proveedor completo en tooltip y detalle |
| Artefactos | Entregas: modelo con visor, captura con imagen e informe con FileText; leyenda y Estilo |

- Áreas, estados de tarea, estados del director y artefactos no comparten iconos. Dentro de cada grupo tampoco se repiten formas. La prueba compara SVG renderizados, además del contrato de iconos elegidos.
- Cada entrada tiene etiqueta y tono válido; `Glyph` y las pastillas exponen `role="img"` y `aria-label`. Las áreas desconocidas conservan el texto como nombre accesible y tooltip junto a `CircleDashed`.
- `AgentAvatar` muestra un círculo con monograma del implementador: Cx, Cl, Oc, Me, Bl, Un, Kr o La. Nombre corto derivado de área y rol junto al avatar; proveedor en tooltip y detalle. Anillo sólido durante ejecución, discontinuo al esperar respuesta, ninguno libre o terminado. Ordinal de 14 px únicamente entre agentes vivos del mismo nombre; no se extrae del id. `AvatarGroup` apila tres avatares y muestra +N para el resto, con recuento real por proveedor.
- Los roles llevan texto corto: Director, Implementación, Arte, Revisor, Calidad, Integrador, Coordinador. Las fuentes llevan pastillas: Fab, Megascans, Poly Haven, ambientCG, Kenney, Quaternius, Sketchfab, Freesound, Meshy y Blender. Ninguno de esos grupos se añade a la leyenda.
- Los eventos de tarea, revisión, prueba, integración y decisión reutilizan la forma del estado de su entidad con etiqueta neutral de entidad, sin inferir el estado actual a partir del prefijo; un evento de entrega reutiliza `PackageCheck`. Los eventos de ejecución y de agente aceptan `provider` para mostrar su pastilla. Una ejecución sin proveedor muestra «Ejecución». Agente sin proveedor usa `Bot`, Orden usa `ListChecks` y Reserva usa `Lock`. Mensaje, Respuesta, Descarga y eventos desconocidos usan texto corto. No existe un segundo registro de iconos de eventos.
- `AreaPictogram` amplía a 48 px el mismo icono del área. `EmptyState` utiliza el concepto de la vista a 48 px, una frase y una acción; admite reemplazar la acción con un callback o enlace de la vista.
- Se conservan `ProductionMap`, `Ring` y `DiffBars`. `Sparkline` exige título y entre uno y siete carriles con etiqueta visible, y recibe datos del consumidor. La galería no fabrica actividad. La procedencia real de los datos debe comprobarla quien integra el componente.
- No hay `ViewHeader`, patrones de cabecera ni ilustraciones abstractas de vacíos. Arte en código; colores mediante tokens; movimiento reducido conserva sus reglas.

## Nombres y monogramas de agentes

El nombre se calcula en el panel con `agentName(role, area, ordinal)`; no requiere un campo del servicio. El proveedor identifica al implementador en el avatar y en su tooltip; el nombre corto aparece junto al avatar.

| Área del servicio | Nombre corto |
|---|---|
| `ui` | UI |
| `gameplay` | Gameplay |
| `escenarios` | Escenas |
| `assets` | Assets |
| `animacion` | Anim |
| `audio` | Audio |
| `qa` | QA |
| `builds` | Builds |
| Ausente o desconocida | Proyecto |

| Rol del servicio | Nombre corto |
|---|---|
| `implementacion` | Worker |
| `revisor` | Master |
| `arte` | Artist |
| `qa` | Tester |
| `integrador` | Builder |
| `coordinador` | Lead |
| `director` | Nomos, sin área |
| `desarrollador`, `implementador` | Worker (compatibilidad) |
| `generador` | Artist (compatibilidad) |
| Ausente o desconocido | Worker |

| Implementador | Monograma |
|---|---|
| Codex | Cx |
| Claude | Cl |
| OpenCode | Oc |
| Meshy | Me |
| Blender | Bl |
| Unreal | Un |
| Nomos | Kr |
| Launcher | La |

Ejemplos: `UI Worker`, `UI Master`, `Anim Artist`. Si dos agentes `running` o `waiting` comparten nombre, `assignAgentNames` les asigna ordinal estable en el orden del consumidor: el primero conserva `UI Worker` y el segundo muestra `UI Worker 2`; ambos tienen insignia para distinguir la instancia. Agentes libres o terminados no provocan ni consumen ordinal. La insignia mide 14 px; el avatar, 24 px en fila, 32 px en Chat/detalle y 48 px en Capacidades. `AvatarGroup` muestra tres avatares solapados 8 px, después `+N`, con totales por proveedor y activos reales. Un implementador desconocido conserva su nombre y usa sus dos primeras letras; no se inventa una marca.

## Prueba de los cinco segundos

Comprobación automática: `npm --prefix panel test -- src/visual/uniqueness.test.tsx src/visual/recognition.test.tsx src/visual/presentations.test.tsx`. Verifica formas únicas, etiquetas, tonos, documentación y los símbolos exigidos por la corrección.

Comprobación con una persona nueva, pendiente de ejecutar: mostrar durante cinco segundos una fila o tarjeta, ocultarla y pedir que identifique área, estado y proveedor. Repetir con un artefacto y con `UI Worker` / `UI Worker 2`. Registrar aciertos y conceptos confundidos; corregir las formas o usar texto si no se entienden. Las pruebas automáticas y las capturas no sustituyen esta observación humana.
