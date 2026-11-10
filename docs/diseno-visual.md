# Dirección visual del panel de Nomos: papel y arcilla (vigente desde el 2026-11-10)

Esta dirección **sustituye** a la oscura «tipo Vercel» del hito 8. El usuario la pidió el 2026-11-10: «ese mismo estilo que le
diste al logo, ahora que el sitio se vea así». El logo (`nomos-media/logo/`, NOTAS.md) es cálido, humano, artesanal y sereno;
el panel habla igual. Inspiración de sensibilidad, no imitación: ni símbolo de destello, ni marca ni nombre de terceros.
Implementación: `panel/src/styles/theme.css` (fuente de verdad) y `design/tokens.json` (`color` claro, `colorDark` oscuro).

## Principios

1. **Papel claro por defecto, tinta cálida como alternativa.** Sigue a `prefers-color-scheme`; el botón luna/sol de la
   cabecera fija la elección (`localStorage nomos.tema`, `panel/src/lib/theme.ts`) y pone o quita `.dark` en `<html>`.
2. **Colores exactos del logo.** Papel `#F5F0E8`, tinta `#1F1E1D`, terracota `#C96442`, arcilla clara `#E49A7B` (oscuro).
   La terracota exacta pinta marcas (símbolo, barras, la cifra de «Por configurar»); con texto encima se usa una arcilla
   más honda, `#A9502F` (texto blanco 5,3:1). En oscuro el acento es `#E49A7B` con tinta encima (7,3:1).
3. **Un solo acento por pantalla**, para lo importante (en Inicio: lo que falta por configurar; en móvil, «Habla con Nomos»).
   El resto es tinta con alfa: bordes `border-subtle|default|strong` (11 / 14 / 48 % de tinta), barras al 70 %.
4. **Estados desaturados de la misma familia cálida** (salvia, ocre, ladrillo, pizarra) y **siempre con forma**: icono,
   texto o patrón además del color. AA medido (≥ 4,5:1 sobre papel y sobre tinta; la prueba es `tests/tokens.test.ts`).
5. **Superficies de papel.** Fondo crema; tarjetas en papel más claro (`--card`); bordes finos de tinta con alfa; radios de
   12 px (8 px en controles). Sin sombras ni degradados; la única excepción sigue siendo el brillo de «Jugar» (hito 14).
6. **Tipografía con carácter.** Newsreader (serif humanista, ejes de tamaño óptico) en `h1`/`h2`, el nombre de la marca y las
   cifras grandes; Instrument Sans para todo lo demás; Geist Mono solo para comandos, rutas e ids. Las tres autoalojadas con
   `@fontsource-variable` (OFL-1.1). Cifras tabulares en todo el panel (`font-variant-numeric: tabular-nums` en `body`).
7. **Lo que el navegador pinta también lleva la paleta**: selección, caret y barras de desplazamiento salen de los tokens.
8. **Copy en español**, de `docs/diseno/estados.md`, con errores que dicen qué pasó y qué hacer.

| Par (claro) | Contraste | Par (oscuro) | Contraste |
|---|---|---|---|
| tinta / papel | 14,7:1 | papel / tinta | 14,7:1 |
| texto secundario / papel | 5,8:1 | texto secundario / tinta | 7,5:1 |
| blanco / `#A9502F` | 5,3:1 | tinta / `#E49A7B` | 7,3:1 |
| `#C96442` (marcas) / papel | 3,4:1 | estados / tinta | ≥ 6,1:1 |
| estados / papel | ≥ 5,1:1 | | |

## Tarjeta de estado (Inicio)

Una franja arriba de Inicio (≈ 100 px en escritorio, dos columnas en móvil) responde «¿qué tengo, cuánto me queda y qué
falta?»; al pulsarla se abre en el sitio. Datos de `GET /resumen` (`service/src/resumen.ts`), solo los que existen: una fuente
sin configurar no da cifra, sale en «Falta por configurar» con su comando y botón de copiar. Cifra grande en serif, barra fina
de 4 px en tinta (ámbar o ladrillo solo si hay que mirar), icono lucide de 14 px. Ninguna clave sale del servicio.
## Regla de sensación (la verifica `panel/src/feel/` y sus pruebas)

- Todo control que dispara una acción pasa por `useAction`: estado **pendiente visible antes de 100 ms y mantenido al menos 300 ms** aunque el servidor responda antes.
- La fila o cifra afectada **cambia en el acto** (optimista) y **vuelve atrás** si el servidor rechaza; el error se escribe **junto al control** y, si el resultado no está a la vista, sale un toast con «Ver», «Reintentar» o «Recargar decisión».
- Nada recarga la página; esperar más de 300 ms muestra **esqueleto**, no spinner de pantalla completa.
- Un evento del servicio que llega durante una transición espera a que termine (`queueWhileTransitioning`): no se anima dos veces ni salta.

## Regla de movimiento

| Qué | Cómo | Duración |
|---|---|---|
| Cambio de vista | `startViewTransition`, fundido del documento | 180 ms |
| Abrir detalle | La fila **se convierte** en el encabezado del Sheet (`view-transition-name` compartido, clase `k-title`); el Sheet entra 40 px desde la derecha | 220 ms |
| Reordenar listas, filtrar | View Transitions por fila (`k-row`) | 260 ms |
| Cifras que cambian | «Tick»: la nueva sube desde abajo (`k-tick`) | 300 ms |
| Barras de progreso | `transform: scaleX` | 300 ms |
| Puntos de actividad que se recolocan | `transform` con unidades de contenedor (`cqw`) | 260 ms |
| Hover y color | `transition` de propiedades explícitas | 120 ms |
| Pulsar un botón | `scale(0.97)` | 120 ms |

Curva única `cubic-bezier(.2,.8,.2,1)` (`--k-ease`); duraciones `micro 120 · estándar 180 · panel 220 · reordenar 260`. Todo vive en tokens (`--k-dur-*`, `--k-ease`).

**No se anima** lo que se hace decenas de veces al día o con teclado: el menú ⌘K se abre y se cierra sin animación, `j`/`k` en Decisiones salta sin animación, las pestañas del detalle cambian de contenido sin animación, y la carga inicial de una lista no hace entrar 500 elementos a la vez (solo los recién llegados entran con fundido).

**Movimiento reducido** (`prefers-reduced-motion`): los grupos de View Transitions duran 0,01 ms (no hay desplazamiento), los fundidos duran 80 ms, el Sheet solo se funde, el tick y el pulso se reducen a fundido o desaparecen. Se comprueba en un e2e de Chromium (`panel/e2e/produccion.spec.ts`).

**Sin View Transitions** (la API puede faltar): las listas se actualizan sin animar y la navegación usa la clase `.fallback-fade` (fundido CSS de 180 ms / 80 ms con movimiento reducido). Se prueba en Chromium y Firefox forzando `startViewTransition = undefined`. Firefox reciente ya trae la API.

## Estructura de la interfaz

- **Cabecera de 56 px**: símbolo de la N en arcilla y «Nomos» en serif (la firma completa solo se lee desde 320 px), conmutador claro/oscuro, nombre del proyecto (del `.uproject`, vía `GET /status`), punto vivo del director (verde latiendo 2 s si escucha; ámbar «vigilante caído»; rojo «desconectado»; gris «esperando») y ⌘K.
- **Pestañas de 40 px** con indicador deslizante (transform): Producción · Actividad · Entregas · Catálogo · Chat · Decisiones (con el número de pendientes) · Presupuesto · Capacidades · Estilo. Sin barra lateral.
- **Contenido** a 1400 px como máximo. 1366×768 y 1920×1080; mínimo 1280. Toda pantalla con formulario cabe a 1366×768 sin desplazar.
- Los filtros viven en la URL (`?etapa=`, `?modo=`, `?origen=`, `?tarea=`), igual que el detalle abierto (`?tarea=`) y el compositor (`?nueva=1`).

## Vistas

Producción (mapa + lista + detalle + compositor), Actividad (siete carriles y actividad por hora etiquetada), Entregas (rejilla con visor GLB `<model-viewer>`), Catálogo (miniatura o pictograma, fuente en pastilla y filtros; «Prohibido para IA» visible, licencia desconocida con acción «Revisar licencia»), Chat (emisor identificado y recepción con marca), Decisiones (bandeja `j`/`k`, tarjetas de opción y evidencia en «Detalle»), Presupuesto (cifras con tick, anillos y límites editables), Capacidades (grupos de agentes y estado), y **Estilo**, la guía con el conmutador «Peor caso».

Capturas de cada vista a ambas resoluciones: `docs/capturas-8/`.

## Lenguaje visual

Integración del hito 9 en `hito9-vistas`: [tabla de glifos, nombres y ubicaciones](diseno/glifos.md) y [auditoría con evidencia](auditoria-9-cierre.md). Las dos correcciones del brief mandan sobre las ilustraciones y avatares del plan original.

- El registro `panel/src/visual/glyphs.ts` tiene 38 entradas: 8 áreas, 10 estados de tarea, 5 del director, 8 proveedores en pastilla y 7 artefactos. Son 30 iconos únicos y 8 pastillas; OpenCode es el único proveedor añadido. Roles y eventos sin símbolo claro usan texto corto; las fuentes usan pastilla. Los glifos tienen `role="img"` y nombre accesible; desconocidos conservan su etiqueta.
- Un agente usa monograma circular del implementador, nombre `{Área} {Rol}` y anillo de estado. Ejemplos: UI Worker, UI Master; tabla completa en la guía. Solo los duplicados vivos llevan ordinal. Grupo apilado desde Capacidades y Estilo; el proveedor sin agente conserva `ProviderPill`.
- Arte únicamente en código, con tokens. `AreaPictogram` amplía el icono de área. Cada vacío usa un icono de 48 px, exactamente una frase y una acción funcional. No hay cabeceras decorativas ni series de datos inventadas.
- Producción muestra mapa de ocho etapas y cantidades reales: hasta doce tareas dibuja puntos; después solo contadores. Pulsar o activar un nodo con teclado filtra. Las filas reservan el texto para título, id, nombre y antigüedad. Etapa, proveedor y estado completo siguen en tooltip y Sheet.
- `Sparkline` usa eventos recibidos por hora y carriles con nombre visible. `Ring` muestra porcentaje solo cuando existe límite o progreso real; `DiffBars` usa el stat real del diff. Los presupuestos conservan «Definir límite» y `PUT /budget`.
- Catálogo usa la miniatura servible del mismo origen o el pictograma de categoría. Entregas usa visor 3D sin giro automático, imagen para captura y FileText para informe. Las opciones de decisión mantienen su etiqueta completa y descripción accesibles aunque abrevien el texto superficial.
- `visibleWords` cuenta tokens Unicode del DOM renderizado, también fuera del viewport. Ignora atributos, ayudas ocultas, tooltips cerrados y valores de campos; en select cerrado cuenta solo la opción seleccionada. Presupuestos: fila de Producción ≤7 sin título/id, tarjeta de Catálogo ≤5, tarjeta de Decisión ≤20, franja del director ≤4 más hora, cabecera ≤4. Son límites de componentes, no un límite total de palabras por vista.
- La guía inicial tiene tres pasos anclados al director, compositor y mapa; Esc o «Cerrar guía» la descarta. Se recuerda en `nomos.tour.v1` al presentarse. «Ver guía» en la paleta permite repetirla. El primer paso conserva la ruta del enlace directo; «Siguiente» lleva a Producción si hace falta. `?` abre la leyenda en un Sheet y Esc devuelve el foco; no intercepta campos de texto, select, contenido editable ni diálogos abiertos.
- Navegación por `withViewTransition`, acciones por `useAction`, sin bucles decorativos. Con movimiento reducido, el mapa y los anillos quedan estáticos; el resto conserva las reglas del hito 8.

Evidencia actual a 1366×768 y 1920×1080 en `docs/capturas-9/`. La prueba humana de comprensión en cinco segundos sigue pendiente.

## Qué queda descartado

La dirección oscura «tipo Vercel» del hito 8 (negro puro, Geist Sans, acento azul, radios de 8 px), el tema claro del hito 1a, Ant Design, tablero de columnas y arrastrar, sombras, chips rellenos y barra lateral. Las maquetas `design/maquetas/{a,b,c}` siguen en el repositorio como historia. El prefijo `--vbg-*` de los tokens se conserva por compatibilidad; sus valores ya son los de papel y arcilla.
