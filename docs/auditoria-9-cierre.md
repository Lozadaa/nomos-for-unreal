# Cierre del hito 9 · Lenguaje visual

Fecha: 2026-10-23. Rama: `hito9-vistas`, base `083ec79`. Entrega local, sin push ni merge. Se leyó el brief completo, incluidos CORRECCIÓN 2 y REANUDACIÓN, y se continuó el trabajo existente.

## Resultado y commits

| Tarea | Commit | Resultado |
|---|---|---|
| Corrección 2 | `2ddec62` | Avatar circular por implementador, nombre corto, ordinal solo con duplicados vivos, OpenCode y grupos apilados. Ya existía al reanudar. |
| 3 | `7a8105b` | Dieta de texto en fila, compositor, Chat y detalle; tooltips completos y stepper. Ya existía al reanudar. |
| 4 | `4ac81e2` | Mapa que filtra, actividad por hora real, anillos, grupos en Capacidades y stat del diff. Ya existía al reanudar. |
| 5 | `7c68c88` | Vacíos de ocho vistas, miniaturas o pictogramas, visor accesible sin giro automático, opciones de decisión visuales, evidencia accesible y foco de las acciones. Se revisó y cerró el diff heredado. |
| 6 | Este commit: `docs: cierre del hito 9, lenguaje visual` | Tour persistente de tres pasos, leyenda con `?` y paleta, foco, E2E, revisión de movimiento, comparación y documentación. |

La implementación conserva el tema oscuro y los tokens. No se modificaron `service/`, `skills/`, `tests/` de raíz ni `design/`; no hay dependencias nuevas. `.nomos-brief.md` queda fuera de los commits.

## Verificaciones ejecutadas en esta reanudación

| Puerta | Resultado observado |
|---|---|
| Tarea 5 · `npm --prefix panel test` | 44 archivos, 227/227 pruebas |
| Tarea 5 · `npm --prefix panel run build` | Exit 0 |
| Tarea 5 · `npx playwright test`, desde panel | 37 aprobadas, 3 exclusiones históricas, cero fallos |
| Tarea 5 · `node scripts/capturas-9.ts tarea5` | 32 capturas regeneradas, vistas llenas/vacías a ambas resoluciones |
| Tarea 6 · `npm --prefix panel test` | 45 archivos, 239/239 pruebas |
| Tarea 6 · `npm --prefix panel run build` | Exit 0; JS inicial 230,92 KB gzip |
| Tarea 6 · `npx playwright test`, desde panel | 59 aprobadas, 3 exclusiones históricas, cero fallos; Chromium y Firefox |
| `node scripts/capturas-9.ts todas` y `tarea6` | Servicio, datos y Git temporales propios; ninguna excepción de página ni desbordamiento horizontal según aserciones del driver |
| Impeccable · detector mecánico sobre las vistas y ayuda modificadas | `[]`, exit 0 |
| `git diff --check` y revisión del alcance | Sin errores de whitespace ni cambios en carpetas excluidas |

Relevo: el agente Codex se detuvo con la Tarea 6 sin commit. Claude Opus leyó el diff pendiente y repitió las tres puertas de la Tarea 6 sobre ese árbol antes del commit, con el mismo resultado (239/239, build exit 0, 59 aprobadas y 3 exclusiones). No regeneró capturas ni recuentos: son los del agente anterior y coinciden con `palabras-despues.json`.

Las tres exclusiones de Firefox son las ya existentes: animaciones de View Transitions del detalle, medición de frames largos y carga del visor GLB con service worker. El nuevo caso de movimiento reducido del mapa sí se ejecutó en ambos navegadores. El build conserva el aviso de chunks mayores de 500 KB; el visor se carga aparte. No se ejecutó la suite de raíz ni se repitió un worker real de Codex.

El E2E de Actividad con 500 eventos pasó su umbral existente; registró frames largos de carga de 58 y 132 ms y ninguno al añadir el evento. Esto no demuestra que cada frame inicial dure menos de 50 ms ni sustituye las mediciones históricas de INP/CPU ×4.

### Evidencia RED → GREEN

La Tarea 5 llegó implementada parcialmente junto a sus pruebas. Se leyó todo su diff, se revisó de forma independiente y se ejecutaron sus puertas; no se inventa un RED previo observado para ese código heredado.

- Ayuda: tras adaptar el almacenamiento del entorno Node de prueba, `help.test.tsx` falló en cuatro casos por ausencia de tour, leyenda y comandos; cuatro comprobaciones de escritura ya pasaban. Después pasaron los ocho casos. La regresión adicional Buscar → Leyenda → Esc falló porque el foco volvía a un campo del contenido; se corrigió capturando el botón que abre la paleta.
- Mapa: el nuevo caso compartido lista/mapa falló con dos capturas en vez de una. Ahora `ProductionMap` actualiza su estado en el layout de la captura activa; conserva la transición propia en usos aislados y vuelve a comprobar movimiento reducido tras esperar una transición de ruta.
- Teclado: Enter y Espacio sobre un nodo fallaron por abrir una transición. Ahora pasan por `withViewTransition` con animación desactivada, conservando URL y filtro.
- Anillo: ambos navegadores detectaron una animación de `strokeDashoffset` de 300 ms al guardar un límite. Se eliminó la transición del arco; el porcentaje cambia de 30 % a 60 % con el dato nuevo, sin animación de repintado.
- Leyenda: la revisión de captura encontró grupos solapados en el Sheet estrecho. La regresión geométrica falló; el Sheet ahora usa su anchura propia y dos columnas, y la prueba comprueba que las etiquetas permanecen dentro de cada grupo.

Una corrida de E2E se descartó al lanzar por error un segundo proceso que compartía el puerto fijo y el archivo temporal del runner. La corrida final de 62 casos se ejecutó sin otro Playwright concurrente y terminó con 59 aprobadas y 3 exclusiones. Las capturas usan su propio puerto libre.

## Palabras antes y después

Medición reproducible del DOM completo renderizado de `main`, también por debajo del viewport; no se obtiene contando letras de una PNG. Se tokenizan letras/números Unicode por nodo; se excluyen atributos, valores de campos, ayudas `sr-only`, contenido oculto/inert/aria-hidden, `display:none`, `visibility:hidden`, `opacity:0`, títulos SVG y tooltips cerrados. Un select cerrado cuenta solo su opción seleccionada. Los diálogos de ayuda se capturan aparte y no se suman a `main`.

Se recompiló `083ec79` en un archivo Git temporal, con el mismo driver, semilla y reloj de la medición actual. [Baseline verificado y procedencia](capturas-9/palabras-antes-verificado.json); [medición final](capturas-9/palabras-despues.json). Los manifiestos y lockfile del panel son iguales a la base y se reutilizaron las dependencias instaladas. El driver del baseline solo sustituyó sus consultas de HEAD por el SHA archivado. El baseline original se conserva: su método anterior daba 156/32 en Producción; con el método actual son 149/25. La tabla utiliza los valores remedidos.

| Vista | Llena antes | Llena después | Vacía antes | Vacía después |
|---|---:|---:|---:|---:|
| Producción | 149 | 118 | 25 | 25 |
| Chat | 55 | 48 | 17 | 11 |
| Actividad | 14 | 45 | 12 | 6 |
| Entregas | 24 | 24 | 12 | 6 |
| Catálogo | 702 | 151 | 15 | 9 |
| Decisiones | 58 | 31 | 13 | 6 |
| Presupuesto | 57 | 58 | 9 | 5 |
| Capacidades | 53 | 75 | 0 | 6 |

Los resultados son iguales a 1366×768 y 1920×1080. Total de vistas llenas: 1112 → 550 palabras. La primera fila completa de Producción pasa de 9 a 7; su prueba aplica además el presupuesto ≤7 excluyendo título e id. Catálogo exige ≤5 por tarjeta y Decisiones ≤20 incluyendo opciones, con texto completo en ayudas y detalle.

Actividad aumenta porque ahora muestra título y siete carriles etiquetados de actividad por hora. Capacidades añade grupos y nombres de agentes reales; su vacío antes no ofrecía contenido. Presupuesto añade porcentajes. No se presenta una reducción universal: las cifras nuevas explican datos.

La revisión declarada en el JSON final es el HEAD previo al commit de cierre (`7c68c88`); `workingTree` identifica los archivos de Tarea 6 que se estaban midiendo. No se afirma que el árbol estuviera limpio al capturar. La base cuantitativa ya contiene las primeras correcciones del hito 9; las PNG históricas del hito 8 se usan como evidencia visual separada.

## Comparación de capturas

| Vista | Antes hito 8 · 1366 / 1920 | Después · 1366 / 1920 |
|---|---|---|
| Producción | [1366](capturas-8/produccion-1366.png) · [1920](capturas-8/produccion-1920.png) | [1366](capturas-9/produccion-llena-9-1366.png) · [1920](capturas-9/produccion-llena-9-1920.png) |
| Chat | [1366](capturas-8/chat-1366.png) · [1920](capturas-8/chat-1920.png) | [1366](capturas-9/chat-llena-9-1366.png) · [1920](capturas-9/chat-llena-9-1920.png) |
| Actividad | [1366](capturas-8/actividad-1366.png) · [1920](capturas-8/actividad-1920.png) | [1366](capturas-9/actividad-llena-9-1366.png) · [1920](capturas-9/actividad-llena-9-1920.png) |
| Entregas | [1366](capturas-8/entregas-1366.png) · [1920](capturas-8/entregas-1920.png) | [1366](capturas-9/entregas-llena-9-1366.png) · [1920](capturas-9/entregas-llena-9-1920.png) |
| Catálogo | [1366](capturas-8/catalogo-1366.png) · [1920](capturas-8/catalogo-1920.png) | [1366](capturas-9/catalogo-llena-9-1366.png) · [1920](capturas-9/catalogo-llena-9-1920.png) |
| Decisiones | [1366](capturas-8/decisiones-1366.png) · [1920](capturas-8/decisiones-1920.png) | [1366](capturas-9/decisiones-llena-9-1366.png) · [1920](capturas-9/decisiones-llena-9-1920.png) |
| Presupuesto | [1366](capturas-8/presupuesto-1366.png) · [1920](capturas-8/presupuesto-1920.png) | [1366](capturas-9/presupuesto-llena-9-1366.png) · [1920](capturas-9/presupuesto-llena-9-1920.png) |
| Capacidades | [1366](capturas-8/capacidades-1366.png) · [1920](capturas-8/capacidades-1920.png) | [1366](capturas-9/capacidades-llena-9-1366.png) · [1920](capturas-9/capacidades-llena-9-1920.png) |

Todas las vistas tienen pares `*-vacia-9-1366.png` / `*-vacia-9-1920.png`. El baseline comparable tiene 32 PNG adicionales `*-antes-verificado-9-*`. Hay capturas de [detalle](capturas-9/produccion-sheet-9-1366.png), [diff](capturas-9/cambios-9-1366.png), [guía del director](capturas-9/tour-director-9-1366.png), [compositor](capturas-9/tour-compositor-9-1366.png), [mapa](capturas-9/tour-mapa-9-1366.png) y [leyenda](capturas-9/leyenda-9-1366.png), también a 1920.

La comparación visual muestra filas con iconos y nombre de agente, stepper con nombre solo en la etapa activa, fuentes de catálogo identificables y menos descripción repetida. El mapa ocupa altura: a 1366 se ven menos filas simultáneamente que en el hito 8. Los pictogramas repetidos del catálogo representan la categoría Assets de la semilla; no se pretende que identifiquen un modelo concreto. La semilla no trae miniaturas del catálogo y estas capturas no acreditan un endpoint de miniaturas.

## Puertas de diseño

**UX Heuristics · Quick Diagnostic**: revisión independiente por código y capturas, 10/10 en el alcance examinado, sin problemas de severidad 3–4 abiertos. Se comprobaron identidad/vista, acción principal, navegación, búsqueda, estado de acciones, errores, regreso/cancelación, teclado, etiquetas y claridad. La nota es heurística; no representa una prueba con usuarios. El fallo de foco Buscar → Leyenda se reprodujo y quedó corregido.

**Impeccable colorize/distill**, modo Operate: se ejecutó `context --target panel/src/views/Produccion.tsx`, se leyeron colorize, distill y craft-floor y se revisaron Producción y Catálogo contra sus capturas. Se conserva la dirección oscura existente; color para acción/foco/estado y datos, fuentes con nombre en pastilla, título/id/nombre antes que descripciones repetidas. El objetivo principal es pedir y seguir trabajo; información secundaria en tooltip o detalle, conservando licencia y prohibición para IA. Detector final sin hallazgos mecánicos. No se afirma una nueva certificación global de contraste ni una prueba humana.

**review-animations**: se recuperaron la [skill oficial](https://github.com/emilkowalski/skills/blob/main/skills/review-animations/SKILL.md) y [sus estándares](https://github.com/emilkowalski/skills/blob/main/skills/review-animations/STANDARDS.md), ausentes de las carpetas locales, y se revisaron mapa, anillos y avatares. La revisión bloqueó tres aspectos; los tres se corrigieron con regresiones:

| Antes | Después | Por qué |
|---|---|---|
| Mapa esperaba a la transición de la lista y abría otra | Lista y mapa comparten captura; conserva transición aislada | Evita dos movimientos encadenados para el mismo evento |
| Arco del anillo animaba stroke-dashoffset 300 ms | Actualización directa del porcentaje | Evita animación de repintado y mantiene el dato real |
| Activación de nodo por teclado animaba la lista | URL y filas cambian sin animación | Respeta la regla local del teclado |

La curva local se mantiene por mandato del brief. Los avatares no tienen latido decorativo y `model-viewer` no gira solo. La guía cambia de ancla sin animación; el Sheet conserva las reglas de movimiento reducido. Veredicto de cierre: hallazgos de movimiento corregidos, con pruebas unitarias y E2E verdes; no se atribuye una medición de GPU a la revisión estática.

**Web Design Guidelines**: se recuperaron las [reglas actuales](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) y se revisaron ayuda/vistas por etiquetas, teclado, foco visible, imágenes con alt/dimensiones, texto largo, URL de filtros y movimiento reducido. La revisión visual añadió la regresión geométrica de la leyenda. Se preserva el copy español del producto sobre convenciones de mayúsculas del documento externo.

## Diferencias respecto del plan y pendientes

- Se aplicaron las dos correcciones: sin ViewHeader, caras, medallones, arte abstracto ni actividad inventada. `provider/opencode` es la única entrada añadida sobre el registro corregido de 37: ahora son 38 (30 iconos y 8 pastillas), sin icono nuevo. Las formas auxiliares de vacío no amplían el registro de entidades.
- La ejecución en curso usa el anillo de estado del avatar, sólido o discontinuo; no se inventa un porcentaje de avance del worker. El proveedor y la etapa siguen disponibles en tooltip/detalle. La tabla completa de áreas, roles, monogramas y ordinales está en [glifos](diseno/glifos.md).
- Miniaturas del catálogo: el panel acepta `thumbnailPath` y `thumbnail_path` si son servibles en el mismo origen, y cae al pictograma si fallan. Falta un endpoint del servicio para paths locales; no se cambió el servicio. Las opciones de decisión disponibles no tienen campo de miniatura, por lo que usan el pictograma del área con etiqueta y descripción accesibles.
- El tour conserva la ruta inicial durante el paso del director y solo navega a Producción al solicitar «Siguiente». Evita perder un enlace directo al abrir el panel. Si el navegador impide escribir localStorage no puede garantizarse la persistencia entre recargas.
- Comprensión en cinco segundos con una persona nueva: pendiente, como ya reconoce la guía. No se presenta como superada por las pruebas automáticas.
- Se mantienen el aviso de tamaño del bundle, las tres exclusiones históricas de Firefox y la limitación de frames largos de carga con 500 eventos. No se repitió la medición de INP ni la aceptación de workers reales.
- El archivo temporal del baseline y su junction a dependencias quedaron conservados: la revisión automática rechazó la limpieza con «blocked by policy». El servicio temporal terminó. No se intentó eludir el rechazo. Carpeta: `C:/Users/richa/AppData/Local/Temp/nomos-hito9-baseline-20d9ae7f0c524c759bfdfae51f1b6bad`.

## Cómo repetir las puertas

```powershell
npm --prefix panel test
npm --prefix panel run build
Set-Location panel
npx playwright test
node scripts/capturas-9.ts todas
```

Playwright usa el puerto fijo 18791 y un archivo temporal compartido: ejecutar una sola corrida a la vez. El driver de capturas usa su propio puerto libre y no consume el servicio del usuario. El modo `antes` conserva su guardia contra sobrescribir un baseline; para repetir la base, usar un archivo Git temporal de `083ec79`, dependencias del panel y los comandos/procedencia registrados en `palabras-antes-verificado.json`.
