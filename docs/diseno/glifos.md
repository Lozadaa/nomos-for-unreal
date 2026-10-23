# Glifos de Kratos

Corrección del hito 9, 2026-10-23. La leyenda tiene **37 entradas: 30 iconos y 7 pastillas de proveedor**. Antes tenía 68 entradas. Las pastillas son texto Geist Mono de 11 px más un punto cuyo color procede de los tokens; el nombre identifica al proveedor aunque no se perciba el color.

## Registro y ubicaciones comprobables

La columna «Dónde aparece» describe esta rama. Las otras vistas las integra otro agente: no se afirma aquí que ya usen estos componentes.

| Clave | Glifo | Significado | Dónde aparece |
|---|---|---|---|
| `area/gameplay` | `Gamepad2` | Gameplay | /estilo · Glifos y Arte |
| `area/ui` | `LayoutPanelTop` | Interfaz | /estilo · Glifos y Arte |
| `area/escenarios` | `Mountain` | Escenarios | /estilo · Glifos y Arte |
| `area/assets` | `Box` | Assets | /estilo · Glifos y Arte |
| `area/animacion` | `PersonStanding` | Animación | /estilo · Glifos y Arte |
| `area/audio` | `AudioWaveform` | Audio | /estilo · Glifos y Arte |
| `area/qa` | `FlaskConical` | Calidad | /estilo · Glifos y Arte |
| `area/builds` | `Package` | Compilaciones | /estilo · Glifos y Arte |
| `taskState/pendiente` | `Circle` | Pendiente | /estilo · Glifos; mapa de Arte para estados y modificadores |
| `taskState/preparada` | `CircleDot` | Preparada | /estilo · Glifos; mapa de Arte para estados y modificadores |
| `taskState/implementando` | `Hammer` | Implementando | /estilo · Glifos; mapa de Arte para estados y modificadores |
| `taskState/revisando` | `Eye` | Revisando | /estilo · Glifos; mapa de Arte para estados y modificadores |
| `taskState/probando` | `TestTube2` | Probando | /estilo · Glifos; mapa de Arte para estados y modificadores |
| `taskState/integrando` | `GitMerge` | Integrando | /estilo · Glifos; mapa de Arte para estados y modificadores |
| `taskState/cerrando` | `DoorClosed` | Cerrando | /estilo · Glifos; mapa de Arte para estados y modificadores |
| `taskState/done` | `CheckCircle2` | Hecha | /estilo · Glifos; mapa de Arte para estados y modificadores |
| `taskState/bloqueada` | `Ban` | Bloqueada | /estilo · Glifos; mapa de Arte para estados y modificadores |
| `taskState/decision` | `HelpCircle` | Espera decisión | /estilo · Glifos; mapa de Arte para estados y modificadores |
| `directorState/esperando` | `Hourglass` | Esperando | /estilo · Glifos |
| `directorState/escuchando` | `Radio` | Escuchando | /estilo · Glifos |
| `directorState/atendiendo` | `Activity` | Atendiendo | /estilo · Glifos |
| `directorState/vigilanteCaido` | `WifiOff` | Vigilante caído | /estilo · Glifos |
| `directorState/desconectado` | `PlugZap` | Desconectado | /estilo · Glifos |
| `provider/codex` | `Pastilla` | Codex | /estilo · Glifos y Arte |
| `provider/claude` | `Pastilla` | Claude | /estilo · Glifos y Arte |
| `provider/meshy` | `Pastilla` | Meshy | /estilo · Glifos y Arte |
| `provider/blender` | `Pastilla` | Blender | /estilo · Glifos y Arte |
| `provider/unreal` | `Pastilla` | Unreal | /estilo · Glifos y Arte |
| `provider/kratos` | `Pastilla` | Kratos | /estilo · Glifos y Arte |
| `provider/launcher` | `Pastilla` | Launcher | /estilo · Glifos y Arte |
| `artifact/model` | `Shapes` | Modelo | /estilo · Glifos |
| `artifact/texture` | `Image` | Textura | /estilo · Glifos |
| `artifact/screenshot` | `Camera` | Captura | /estilo · Glifos |
| `artifact/video` | `Film` | Vídeo | /estilo · Glifos |
| `artifact/build` | `PackageCheck` | Compilación | /estilo · Glifos |
| `artifact/report` | `FileText` | Informe | /estilo · Glifos |
| `artifact/diff` | `Diff` | Cambios | /estilo · Glifos |

## Lectura y reutilización

- Áreas, estados de tarea, estados del director y artefactos no comparten iconos. Dentro de cada grupo tampoco se repiten formas. La prueba compara SVG renderizados, además del contrato de iconos elegidos.
- Cada entrada tiene etiqueta y tono válido; `Glyph` y las pastillas exponen `role="img"` y `aria-label`. Las áreas desconocidas conservan el texto como nombre accesible y tooltip junto a `CircleDashed`.
- `AgentAvatar` muestra proveedor e instancia: `Codex 1`, `Claude 2`. Usa `instance` cuando llega explícita, el sufijo numérico del id si existe, o 1 como fallback para ids opacos. Quien integra varias instancias con ids opacos debe suministrar su número. No genera caras ni geometría.
- Los roles llevan texto corto: Director, Implementación, Arte, Revisor, Calidad, Integrador, Coordinador. Las fuentes llevan pastillas: Fab, Megascans, Poly Haven, ambientCG, Kenney, Quaternius, Sketchfab, Freesound, Meshy y Blender. Ninguno de esos grupos se añade a la leyenda.
- Los eventos de tarea, revisión, prueba, integración y decisión reutilizan la forma del estado de su entidad con etiqueta neutral de entidad, sin inferir el estado actual a partir del prefijo; un evento de entrega reutiliza `PackageCheck`. Los eventos de ejecución y de agente aceptan `provider` para mostrar su pastilla. Una ejecución sin proveedor muestra «Ejecución». Agente sin proveedor usa `Bot`, Orden usa `ListChecks` y Reserva usa `Lock`. Mensaje, Respuesta, Descarga y eventos desconocidos usan texto corto. No existe un segundo registro de iconos de eventos.
- `AreaPictogram` amplía a 48 px el mismo icono del área. `EmptyState` utiliza el concepto de la vista a 48 px, una frase y una acción; admite reemplazar la acción con un callback o enlace de la vista.
- Se conservan `ProductionMap`, `Ring` y `DiffBars`. `Sparkline` exige título y entre uno y siete carriles con etiqueta visible, y recibe datos del consumidor. La galería no fabrica actividad. La procedencia real de los datos debe comprobarla quien integra el componente.
- No hay `ViewHeader`, patrones de cabecera ni ilustraciones abstractas de vacíos. Arte en código; colores mediante tokens; movimiento reducido conserva sus reglas.

## Prueba de los cinco segundos

Comprobación automática: `npm --prefix panel test -- src/visual/uniqueness.test.tsx src/visual/recognition.test.tsx src/visual/presentations.test.tsx`. Verifica formas únicas, etiquetas, tonos, documentación y los símbolos exigidos por la corrección.

Comprobación con una persona nueva, pendiente de ejecutar: mostrar durante cinco segundos una fila o tarjeta, ocultarla y pedir que identifique área, estado y proveedor. Repetir con un artefacto y con Codex 1/2. Registrar aciertos y conceptos confundidos; corregir las formas o usar texto si no se entienden. Las pruebas automáticas y las capturas no sustituyen esta observación humana.
