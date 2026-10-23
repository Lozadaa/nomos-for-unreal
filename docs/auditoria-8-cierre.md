# Auditoría de cierre · Hito 8 «Interfaz viva» (Tareas 4-6)

Fecha: 2026-10-23 · Rama `hito8-vistas` · Navegador de medición: Google Chrome 155 (headless) y Firefox de Playwright, 1366×768 · Datos: la semilla real (`kratos seed`) sobre el servicio real.

Lo que sigue distingue lo **ejecutado y observado** de lo que **no se pudo comprobar**. Las cifras salen de `docs/medicion-8.json` (script `panel/scripts/medir.ts`).

## Puertas

| Puerta | Resultado | Cómo se ejecutó |
|---|---|---|
| `npm test` (node:test, servicio) | **68/68** (66 previos + 2 de `/status` con proyecto) | `npm test`, repetido 4 veces durante la sesión: siempre 68/68 |
| `npm run test:panel` (Vitest) | **69/69** en 10 archivos | incluye una prueba por comportamiento de sensación de cada vista |
| `npm run build` | verde (`tsc -b` + Vite) | JS inicial **204,5 KB gzip** (límite del plan: 250 KB); CSS 13,9 KB gzip |
| e2e Playwright (`panel/e2e`) | **Chromium y Firefox: 35 pasadas, 3 omitidas con motivo** | requiere `npm run build` antes; arranca su propio servicio sembrado |
| Pruebas escritas después del código | Las de Tarea 4 y 5 se escribieron **tras** los componentes, no RED primero. Se verificó con mutaciones (quitar `key` del tick, quitar `content-visibility`, no filtrar el temporal, no marcar `data-blocked`): cada una hizo fallar su prueba. La carrera SSE/POST del Chat sí se hizo RED→GREEN |

Omitidas: prueba de movimiento reducido en Firefox (usa `KeyframeEffect.pseudoElement`, solo verificado en Chromium), GLB en Firefox (WebGL del visor, solo Chromium) y el rendimiento de 500 eventos en Firefox (`long-animation-frame` es de Chromium).

## Medición (cifras reales)

**INP de las cinco acciones principales** (duración del evento hasta el siguiente pintado; interacciones repetidas 5-16 veces):

| Acción | Sin limitar CPU: mediana / p75 / máx | CPU ×4 (estrés): mediana / p75 / máx |
|---|---|---|
| Abrir y cerrar el detalle (16) | 24 / 32 / 32 ms | 104 / 112 / 128 ms |
| Cambiar de vista (8) | 0 / 16 / 16 ms | 16 / 16 / 32 ms |
| Filtrar por etapa (8) | 24 / 24 / 24 ms | 48 / 48 / 56 ms |
| Enviar una petición (8, POST real) | 24 / 32 / 32 ms | 80 / 80 / 80 ms |
| Elegir una decisión (5, semilla restaurada entre pruebas) | 0 / 0 / 24 ms | 24 / 24 / 40 ms |

Objetivo del plan: INP < 200 ms. **Cumplido en las cinco acciones, incluso con la CPU ×4 más lenta** (peor caso 128 ms).

**Frames largos (`long-animation-frame` > 50 ms) durante las transiciones** (Chromium):

- Sin limitar CPU: **0 en todas las acciones** en la medición final. En una medición anterior, previa a las correcciones de la Tarea 6, hubo **1 frame de 53 ms** al abrir un detalle en frío: es intermitente y no se repitió en las dos corridas siguientes; se anota por honestidad, no se ha aislado su causa.
- **Con CPU ×4: el criterio del plan NO se cumple.** Abrir y cerrar el detalle: 16 de 16 repeticiones con un frame > 50 ms (peor 106 ms); cambiar de vista: 7 de 8 (peor 109 ms); enviar una petición: 8 de 8 (hasta 200 ms); filtrar y decidir: 0. El criterio estaba pensado como «sin entradas > 50 ms durante una transición» sin decir con qué CPU; en un portátil normal se cumple, en un equipo cuatro veces más lento no. Queda en pendientes.
- **Actividad con 500 eventos** (`panel/e2e/rendimiento.spec.ts`): un evento nuevo producía un frame de **51 ms**; tras memoizar los puntos y mover la animación a `transform` ya **no produce ninguno**. La primera pintura de los 500 puntos sigue costando **55-66 ms** (un frame largo): pendiente.

**Bundle**: `index` 661 KB sin comprimir / 204,5 KB gzip. El visor 3D (`model-viewer`, 1 MB / 288 KB gzip) es un fragmento aparte que solo se pide al ver un modelo.

## Pases de las skills

**Emil (`emil-design-eng`, `find-animation-opportunities`, `animate`, `review-animations`, `break-ui`).**

| Antes | Después | Por qué |
|---|---|---|
| `transition-all` en Button y Toggle | propiedades explícitas, 120 ms `ease-out` | `all` anima lo que no toca |
| Botón sin feedback de pulsación (`translate-y-px`) | `scale(0.97)` | confirma que la interfaz oyó |
| Puntos de Actividad animaban `left` | `transform` con `cqw` (unidades de contenedor) | propiedad de layout → compositor |
| Barra de Presupuesto animaba `width` | `scaleX` con origen izquierdo | ídem |
| Indicador de pestañas animaba `width` | `scaleX` + `translateX` | ídem |
| 500 puntos y todas las burbujas entraban con fundido al cargar | solo entran los que llegan después del primer render (`useFresh`) | 500 animaciones simultáneas sin propósito |
| Menú ⌘K con zoom y fundido | sin animación | se abre con teclado, decenas de veces al día |
| `backdrop-blur` en el fondo del Sheet y del diálogo | quitado | coste de pintado y rompe las View Transitions |
| Punto de estado cambiaba de color de golpe | `transition-colors` 180 ms | indicación de estado (una tarea cambia de etapa) |

Rechazado a propósito (`find-animation-opportunities`): animar el cambio de pestaña dentro del detalle (frecuente), el movimiento de `j`/`k`, el hover de las filas más allá del color, y un «pop» al aparecer un toast (sonner ya lo trae). **Excepciones aceptadas**: el compositor se expande animando `grid-template-rows` (cambia el alto; ocurre una vez por enfoque) y las listas se reordenan con View Transitions (lo que pide el plan).

**Impeccable (`animate`, `polish`, `harden`).** El lanzador `scripts/impeccable` no arranca con `node` (`SyntaxError`: es un script de shell); ejecutado directamente devolvió `NO_PRODUCT_MD` (el proyecto no tiene `PRODUCT.md`). Como son retoques sobre código existente y no una superficie nueva, se aplicaron sobre el código tal cual, modo *Operate* (herramienta de trabajo: precisión y contención). `polish`: botones secundarios sin relleno gris (el relleno venía de `dark:bg-input/30`, que la guía de Vercel no usa), inputs transparentes con borde, foco visible del compositor (`focus-within`), estados vacíos con `text-wrap: balance`. `harden`: errores traducidos y sin códigos internos (`humanError`), motivo de bloqueo de 240 caracteres con `break-words`, datos de «Peor caso» en `/estilo`. No se generó `PRODUCT.md` ni `DESIGN.md`.

**`web-design-guidelines`** (reglas descargadas de `vercel-labs/web-interface-guidelines` el 2026-10-23):

| Hallazgo | Estado |
|---|---|
| Sin enlace «Saltar al contenido» | arreglado (`Layout.tsx`, `#contenido`) |
| `transition: all` (Button, Toggle) | arreglado |
| Inputs sin `name`/`autocomplete`; placeholders sin «…» | arreglado (Composer, Chat, detalle, búsquedas) |
| Compositor sin foco visible | arreglado |
| Sheet sin `overscroll-behavior: contain` | arreglado |
| `touch-action: manipulation` ausente | arreglado en `body` |
| Imágenes sin `width`/`height` | arreglado |
| Dos `<h1>` en `/estilo` | arreglado |
| Filtros fuera de la URL | arreglado para etapa, modo, origen y tarea; la **búsqueda por texto** sigue local a propósito (un input controlado por el router pierde caracteres) |
| `<meta name="theme-color">` | se crea en `main.tsx` desde el token (sin colores a mano) |
| «Title Case en títulos y botones» | **no aplicado a propósito**: el copy es español con mayúscula solo inicial (`docs/diseno/estados.md`) |
| Listas > 50 sin virtualizar | no virtualizado: Actividad usa `content-visibility: auto` por carril (medido arriba); el resto de listas tiene ≤ 30 elementos |

**`ux-heuristics`** (Nielsen + diagnóstico rápido). Puntuación: **8/10**.

| Hallazgo | Severidad | Estado |
|---|---|---|
| Errores mostraban códigos internos (`invalid_task`, `http_500`) | 2 | arreglado: mensajes en español con qué hacer |
| Descripción de las opciones de una decisión solo en `title` (hover) | 2 | arreglado: visible bajo cada botón |
| **No se puede deshacer una decisión** (el servicio no tiene la ruta; el copy de `estados.md` lo promete) | 3 | **pendiente** (ruta del hito 2+) |
| «Estilo» en la navegación principal es una guía de desarrollo | 1 | pendiente (decidir si se oculta en producción) |
| Etiqueta de los puntos de Actividad solo por hover/foco, no por toque | 1 | aceptado: el panel es de escritorio |

Para llegar a 10/10 falta el deshacer de decisiones y decidir qué hacer con «Estilo».

## Hallazgos y desviaciones

1. **Política de seguridad del servicio** (`service/src/server.ts`, de Codex): `default-src 'self'` bloquea `blob:`/`data:` y `<img>` no puede enviar `Authorization`. Se resolvió **sin tocar el servicio** con un service worker (`panel/public/sw.js`) que convierte `?token=` en cabecera. Además, falta `'wasm-unsafe-eval'` en `script-src`: el visor 3D instancia WebAssembly y Chromium deja un **error de consola** (el modelo se carga igualmente). **Pendiente para el hito 2**: añadir `'wasm-unsafe-eval'` (un token) y, si se prefiere, aceptar `?token=` en `/artifacts/:id/file` para poder retirar el service worker.
2. **`EventSource` perdía eventos**: lista cerrada de tipos; la semilla usa `task.activity`. Se sustituyó por `fetch` con cabecera que recibe todos los tipos (y los que añada el hito 2).
3. **Carrera SSE/POST en Chat** (encontrada por el e2e de Firefox): el evento llegaba antes que la respuesta del POST y el mensaje se veía dos veces. Corregida y con prueba.
4. **«Intermitencia 65/66» del agente anterior**: no se reprodujo en ninguna de las cuatro ejecuciones de `npm test` de esta sesión (68/68 siempre). No se pudo identificar la causa.
5. **«Prueba de sin colores a mano nació en verde»**: se comprobó que detecta añadiendo `'#fff'` en un archivo de `panel/src` y viendo fallar la prueba (solo se probó `#fff`; los otros patrones del regex no se ejercitaron uno a uno); vive en `panel/src/styles/theme.test.ts` y en `tests/tokens.test.ts`. `meta theme-color` se construye desde el token por esa regla.
6. **Rutas del hito 2 sin existir** (`/runs/:id/diff|output|message`): las pestañas Cambios y Chat del detalle están programadas contra el contrato del plan del hito 2 y dicen «Disponible cuando haya workers» ante 404.
7. **Rutas que el panel necesita y el servicio no tiene**: crear comandos (`POST /commands`, para «Preparar para Unreal» y los de ⌘K Indexar/Pausar), fijar límites de presupuesto, deshacer una decisión y listar mensajes (el chat se reconstruye de los eventos, máximo 500).
8. **`server.ts` recibió 2 líneas** (importación + uso) en lugar de 1 para `project` en `/status`; el resto del código nuevo está en `service/src/project.ts`.
9. **Datos de la semilla**: títulos como «Retirar worktree» usan una palabra que `estados.md` prohíbe en la interfaz; es dato de ejemplo del servicio, no copy del panel.

## Pendientes

- Frames largos con CPU ×4 al abrir el detalle (106 ms), cambiar de vista (109 ms) y enviar una petición (200 ms): candidatos a diferir el montaje de pestañas del Sheet y a medir qué hace el montaje de `TaskSheet`.
- Primera pintura de 500 puntos de Actividad (55-66 ms).
- Pestañas que esperan al hito 2: **Cambios** y **Chat** del detalle (`/runs/:id/diff`, `/runs/:id/output?since=`, `/runs/:id/message`); «Pedir cambios» usa mientras tanto `POST /messages`.
- ⌘K sigue con **Indexar** y **Pausar** desactivados hasta que existan sus rutas.
- Deshacer decisión, límites de presupuesto, preparar asset: ver el punto 7 de arriba.
- `'wasm-unsafe-eval'` en la política de seguridad del servicio.
- No se ha ejecutado una revisión de seguridad ni una prueba con lector de pantalla real; la accesibilidad se verificó con roles y nombres accesibles en Testing Library y con los e2e, no con tecnología de apoyo.
