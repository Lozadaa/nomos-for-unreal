# Corrección del lenguaje visual · Hito 9b

Fecha: 2026-10-23. Rama: `hito9-correccion`, base `13dc999`. Alcance: los seis puntos de CORRECCIÓN del plan, retomando los tres archivos de pruebas indicados en REANUDACIÓN. Se mantienen fuera del encargo las Tareas 3–6 originales de integración de vistas.

## Resultado y commits

| Punto | Commit | Cambio y motivo |
|---|---|---|
| 1 | `ceec292` | Proveedores con nombre Geist Mono 11 px y punto de token; `AgentAvatar` muestra proveedor e instancia. Eliminadas caras y formas de proveedor que no permitían identificarlo. Se convirtió a UTF-8/LF el test heredado en cp1252. |
| 2 | `8d48be8` | Prueba de unicidad por forma SVG renderizada. Fuentes del catálogo pasan a pastillas, evitando confundir Poly Haven, Kenney, Quaternius o Freesound con áreas. |
| 3 | `be0b17f` | PersonStanding, Package, Box, Shapes, Image, Lock, Bot, ListChecks y PackageCheck según el brief. Se elimina el módulo de geometría de iconos. |
| 4 | `55511fb` | Registro y leyenda reducidos a áreas, estados de tarea, estados del director, proveedores y artefactos. Roles como texto, eventos mediante su entidad y fuentes como pastillas, fuera de la leyenda. |
| 5 | `d0a9638` | Eliminados ViewHeader, ilustraciones abstractas y actividad fabricada de la galería. Vacíos con icono 48 px, frase y acción; Sparkline exige título/carriles etiquetados. Se conservan mapa, anillos, barras y el mismo icono ampliado por área. |
| 6 | Este commit: `test: documentar y verificar la correccion visual` | Tabla completa en `docs/diseno/glifos.md`, contrato de etiquetas/tonos/documentación y capturas reproducibles. La revisión añadió regresión para que eventos como decision.resolved/director.stopped no anuncien estados activos falsos. |

**Recuento final del registro: 37 entradas = 8 áreas + 10 estados de tarea + 5 estados del director + 7 proveedores en pastilla + 7 artefactos. Son 30 iconos y 7 pastillas, frente a las 68 entradas anteriores.** Los símbolos auxiliares Bot/ListChecks/Lock identifican sus entidades al resolver eventos; no crean un grupo ni entradas adicionales en la leyenda.

## Evidencia TDD ejecutada

| Punto | RED observado antes de implementar | Validación posterior |
|---|---|---|
| 1 | ProviderPill.test: 2 fallos; el proveedor era geometría sin texto y no existía Codex 2 como pastilla. | Suite completa 111/111; build correcto. |
| 2 | La prueba de fuentes detectó Poly Haven compartiendo la forma de Escenarios. Las dos comprobaciones de unicidad iniciales ya pasaban; no se afirma un RED para ellas. | Suite completa 114/114; build correcto. |
| 3 | recognition.test falló en Animación, que seguía usando GeometricIcon. | Suite completa 115/115; build correcto. |
| 4 | presentations.test: 3 fallos, por grupos sobrantes, roles aún con glifos y eventos con símbolos propios. | Suite completa 118/118; build correcto. |
| 5 | Vacíos/galería: 4 fallos y 1 acierto antes del cambio. Sparkline: 4 fallos y 14 aciertos contra la API anterior; prueba focal final 18/18. | Suite completa 119/119; build correcto. Tras corregir la acción circular de Chat, se volvió a ejecutar la suite completa junto con las nuevas pruebas del punto 6: 121/121 y build correcto. |
| 6 | Unicidad/documentación: ENOENT al faltar glifos.md. Regresión de eventos: decision.resolved anunciaba Espera decisión. | Suite completa final 121/121; build correcto. |

No se afirma un RED individual previo para cada aserción. Los checks de etiquetas y tonos ratifican contratos existentes; el nuevo fallo documental exigió añadir la guía completa.

Validación adicional del estado final:

- `npm test`: **213/213**, sin omisiones.
- `npx playwright test` desde panel: **37 correctas, 3 omitidas por las condiciones existentes de Firefox**, cero fallos, Chromium y Firefox.
- `node scripts/capturas-9b.ts` desde panel: correcto a 1366×768 y 1920×1080, servicio real sembrado en directorio temporal propio y puerto libre. Comprueba 37 entradas, ausencia de SVG de proveedor y patrones decorativos, ausencia de sparkline fabricada, ningún desbordamiento horizontal y ningún pageerror. La acción Nueva petición del vacío abre el compositor real en ambos tamaños.
- Pruebas existentes conservadas para colores de tokens, accesibilidad, determinismo, límite de SVG de 2 KB, mapa con 0/12/13/200 tareas y movimiento reducido. AreaPictogram se compara por forma contra Glyph.
- El build mantiene el aviso de chunks mayores de 500 KB, ya presente al empezar; no se cambiaron dependencias.

## Capturas y comparación visual

Se generaron y revisaron las capturas de viewport nuevas, comparándolas con glifos-9-1366.png y arte-9-1366.png. Las pastillas permiten leer el proveedor; Animación es una persona; Modelo son formas; desaparecen los tres grupos sobrantes, las caras, la serie de actividad inventada y los patrones bajo las cabeceras. Los vacíos tienen un concepto reconocible y una salida visible.

| Sección | 1366 | 1920 |
|---|---|---|
| Glifos | [Viewport](capturas-9/glifos-9b-1366.png) · [Sección completa](capturas-9/glifos-9b-1366-seccion.png) | [Viewport](capturas-9/glifos-9b-1920.png) · [Sección completa](capturas-9/glifos-9b-1920-seccion.png) |
| Arte | [Viewport](capturas-9/arte-9b-1366.png) · [Sección completa](capturas-9/arte-9b-1366-seccion.png) | [Viewport](capturas-9/arte-9b-1920.png) · [Sección completa](capturas-9/arte-9b-1920-seccion.png) |

La galería completa necesita desplazamiento vertical a 1366×768; la captura de sección muestra también su segunda fila de vacíos. No hay desbordamiento horizontal. La prueba de cinco segundos con una persona nueva queda descrita en la guía y **no se ha ejecutado**; no se sustituye por una afirmación de comprensión humana.

## Límites de entrega

Los cambios afectan únicamente a `panel/src/visual/**`, al script de capturas en panel y a esta documentación/evidencia. No se han modificado service/, skills/, tests/ de raíz ni otras vistas. El archivo local .nomos-brief.md queda fuera de los commits. No hay push ni merge.
