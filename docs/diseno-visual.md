# Dirección visual del panel de Nomos (vigente desde el hito 8)

Esta dirección **sustituye** a la «A · Sala de control densa» del hito 1a (tema claro, Ant Design, tablero de ocho columnas, sombras). El usuario la cambió el 2026-10-23: panel **oscuro con la apariencia de Vercel**, sin Next.js, sin tablero tipo Jira, y «cada acción tiene que tener una respuesta en la misma pantalla y si es una redirección se tiene que sentir». La fuente de verdad de la implementación es `panel/src/styles/theme.css` y `design/tokens.json`; el plan es `docs/superpowers/plans/2026-10-23-hito8-interfaz-viva.md`.

## Principios

1. **Oscura y plana.** Superficies `surface-primary` (negro) y `surface-secondary`; separación con bordes de alfa blanco (`border-subtle|default|strong`). **Sin sombras**: la elevación es borde más fondo. Radio de 8 px (6 px en controles pequeños).
2. **Geist.** Geist Sans para todo; Geist Mono para ids, rutas, comandos y cifras. Autoalojadas (`@fontsource-variable`).
3. **El estado se dice con forma y color.** `success`, `warning`, `error`, `info`, `neutral`. El glifo tiene nombre accesible y tooltip; el detalle conserva el texto. Nunca solo color. Azul para foco, enlaces, acción primaria y datos de actividad.
4. **Producción es una lista viva**, no un tablero: filas de 48 px agrupadas por etapa; el detalle abre en un panel lateral de 720 px con un stepper horizontal de la etapa. Sin arrastrar y soltar.
5. **Sin modales para pedir cosas.** El compositor de peticiones se expande en el sitio.
6. **Copy en español**, de `docs/diseno/estados.md`, con errores que dicen qué pasó y qué hacer (`panel/src/lib/errors.ts` traduce los códigos del servicio).

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

- **Cabecera de 56 px**: marca, nombre del proyecto (del `.uproject`, vía `GET /status`), punto vivo del director (verde latiendo 2 s si escucha; ámbar «vigilante caído»; rojo «desconectado»; gris «esperando») y ⌘K.
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

Tema claro, Ant Design, tablero de columnas y arrastrar, sombras, chips rellenos, barra lateral, los tokens del hito 1a y las tres maquetas `design/maquetas/{a,b,c}` (siguen en el repositorio como historia; su comparación ya no manda).
