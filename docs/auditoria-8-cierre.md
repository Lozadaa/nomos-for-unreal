# Auditoría de cierre · Hito 8 «Interfaz viva» (Tareas 4-6)

Fecha: 2026-10-23 · Rama `hito8-vistas` · Navegador de medición: Google Chrome 155 (headless) y Firefox de Playwright, 1366×768 · Datos: la semilla real (`nomos seed`) sobre el servicio real.

Lo que sigue distingue lo **ejecutado y observado** de lo que **no se pudo comprobar**. Las cifras salen de `docs/medicion-8.json` (script `panel/scripts/medir.ts`).

## Puertas

| Puerta | Resultado | Cómo se ejecutó |
|---|---|---|
| `npm test` (node:test, servicio) | **68/68** (66 previos + 2 de `/status` con proyecto) | `npm test`, repetido 4 veces durante la sesión: siempre 68/68 |
| `npm run test:panel` (Vitest) | **77/77** en 11 archivos | incluye una prueba por comportamiento de sensación de cada vista |
| `npm run build` | verde (`tsc -b` + Vite) | JS inicial **204,5 KB gzip** (límite del plan: 250 KB); CSS 13,9 KB gzip |
| e2e Playwright (`panel/e2e`) | **Chromium y Firefox: 37 pasadas, 3 omitidas con motivo** | requiere `npm run build` antes; arranca su propio servicio sembrado |
| Pruebas escritas después del código | Las de Tarea 4 y 5 se escribieron **tras** los componentes, no RED primero. Se verificó con mutaciones (quitar `key` del tick, quitar `content-visibility`, no filtrar el temporal, no marcar `data-blocked`): cada una hizo fallar su prueba (la de `content-visibility` solo miraba la clase CSS y se sustituyó, ver la revisión final). La carrera SSE/POST del Chat y todos los arreglos de la revisión final sí se hicieron RED→GREEN |

Omitidas: prueba de movimiento reducido en Firefox (usa `KeyframeEffect.pseudoElement`, solo verificado en Chromium), GLB en Firefox (WebGL del visor, solo Chromium) y el rendimiento de 500 eventos en Firefox (`long-animation-frame` es de Chromium).

## Medición (cifras reales)

**INP de las cinco acciones principales** (duración del evento hasta el siguiente pintado; interacciones repetidas 5-16 veces):

| Acción | Sin limitar CPU: mediana / p75 / máx | CPU ×4 (estrés): mediana / p75 / máx |
|---|---|---|
| Abrir y cerrar el detalle (16) | 24 / 32 / 48 ms | 104 / 120 / 144 ms |
| Cambiar de vista (8) | 0 / 0 / 0 ms | 16 / 16 / 24 ms |
| Filtrar por etapa (8) | 16 / 32 / 32 ms | 56 / 56 / 56 ms |
| Enviar una petición (8, POST real) | 24 / 32 / 32 ms | 64 / 72 / 96 ms |
| Elegir una decisión (5, semilla restaurada entre pruebas) | 0 / 0 / 16 ms | 24 / 24 / 48 ms |

Objetivo del plan: INP < 200 ms. **Cumplido en las cinco acciones, incluso con la CPU ×4 más lenta** (peor caso 144 ms).

**Frames largos (`long-animation-frame` > 50 ms) durante las transiciones** (Chromium):

- Sin limitar CPU: **0 en todas las acciones** en la medición final. En una medición anterior, previa a las correcciones de la Tarea 6, hubo **1 frame de 53 ms** al abrir un detalle en frío: es intermitente y no se repitió en las dos corridas siguientes; se anota por honestidad, no se ha aislado su causa.
- **Con CPU ×4: el criterio del plan NO se cumple.** Frames > 50 ms durante las transiciones: abrir y cerrar el detalle en 16 de 16 repeticiones (peor 109 ms); cambiar de vista 5 frames (peor 85 ms); filtrar 6 (peor 58 ms); enviar una petición 43 frames (peor 141 ms); decidir 0. El criterio del plan no dice con qué CPU; en un portátil normal se cumple, en un equipo cuatro veces más lento no. Queda en pendientes.
- **Actividad con 500 eventos** (`panel/e2e/rendimiento.spec.ts`, 480 eventos creados por la API): un evento nuevo producía un frame de **51 ms**; tras memoizar los puntos, mover la animación a `transform` y fijar el inicio del eje en múltiplos de diez minutos, **no produce ninguno** (dos corridas). La primera pintura de los ~500 puntos sigue costando **59-66 ms** (uno o dos frames largos): pendiente.

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
| Filtros fuera de la URL | arreglado para etapa, modo, origen y tarea (y abrir/cerrar un detalle ya no los borra); la **búsqueda por texto** sigue local a propósito (un input controlado por el router pierde caracteres) |
| `<meta name="theme-color">` | se crea en `main.tsx` desde el token (sin colores a mano) |
| «Title Case en títulos y botones» | **no aplicado a propósito**: el copy es español con mayúscula solo inicial (`docs/diseno/estados.md`) |
| Listas > 50 sin virtualizar | no virtualizado: Actividad limita el coste con un `memo` por punto y un eje estable (medido arriba; se probó `content-visibility` por carril y se quitó porque recortaba las etiquetas y no limitaba nada: los 7 carriles siempre están en pantalla); el resto de listas tiene ≤ 30 elementos |

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

## Revisión final (agente independiente, modelo más capaz)

Un revisor sin contexto previo leyó el diff completo. Encontró 1 crítico, 7 importantes y 9 menores. **Críticos e importantes: arreglados, cada uno con una prueba que falló antes** (`panel/src/views/revision.test.tsx`; el del foco con un e2e en navegador real):

| Hallazgo | Arreglo |
|---|---|
| **C1** Fila «enviando» fantasma: con View Transitions el callback llega un frame después y la lista calculada antes pisaba la respuesta del POST | `store.ts`: cola en serie y cada mutación se evalúa al aplicarse |
| I1 Decisiones saltaba a otra decisión al elegir y marcaba su opción | la vista se queda en la decisión elegida; la opción elegida va ligada a su decisión |
| I2 `useResource` miraba solo el último evento del bloque | busca el último evento que encaje |
| I2b El foco no volvía al botón tras una acción (seguía deshabilitado en el DOM). **No reproducible en jsdom**; reproducido en Chromium y Firefox con e2e | `flushSync` antes de devolver el foco; el Composer ya no inerta el botón que enviaba |
| I3 Abrir/cerrar un detalle borraba `?etapa=` | solo se toca `?tarea` |
| I4 `content-visibility` recortaba las etiquetas de Actividad y no limitaba nada; el eje se movía al descartar el evento más antiguo | quitado; el inicio del eje sube de diez en diez minutos |
| I5 «Revisar licencia» enviaba la orden de preparar el asset | ahora solo despliega la nota de licencia |
| I6 Las transiciones de pestañas (router) y del ⌘K podían cortarse por un evento | `animateUpdate` espera a `document.activeViewTransition`; el ⌘K pasa por `withViewTransition` |

**Menores no arreglados** (diferidos): M1 error de red de «Preparar» sin «Reintentar» y botón que queda deshabilitado tras éxito; M2 acciones de `estados.md` sin implementar (Indexar ahora, Definir límite, Reenviar, Ver motivo, Ver detalle del hueco; «Comprobado hace X min»); M3 si `/tasks` falla, Producción muestra el vacío en vez de un error; M5 las pestañas del detalle vuelven a pedir con cada evento, sin agrupar; M7 el service worker sin `ready` deja las imágenes sin cargar y una recarga forzada las pide sin token; M8 cada carga repite los eventos desde 0; M9 quedan `shadow-*` heredados en `dropdown-menu.tsx` y `tabs.tsx` (anteriores a este diff). M4 (deshacer pisaba cambios del servidor) quedó resuelto de paso: deshacer restaura solo los campos tocados. M6 (⌘K listaba filas temporales) también.

Cifras de pruebas actualizadas arriba. Tras la revisión: `npm test` 68/68, Vitest 77/77, e2e 37 pasadas / 3 omitidas.

## Integración con el hito 2 (rama `hito8-integracion`, 2026-10-23)

Lo que el cierre dejaba pendiente y ya está resuelto:

| Pendiente | Estado |
|---|---|
| Pestañas **Cambios** y **Chat** (hallazgo 6) | hechas contra las rutas reales: `stat`, `patch` con filtro por archivo y aviso de archivos fuera de `task.scope`; salida agrupada por sondeo con hora, pregunta de `worker.waiting` destacada, «Pedir cambios al responsable» (`POST /runs/:id/message`) y «Detener worker» con confirmación en línea (`POST /runs/:id/stop`). La fila de Producción muestra «Esperando respuesta». `store.ts` reduce `worker.waiting|output|message_sent` y `run.finished` |
| ⌘K **Pausar** (hallazgo 7) | `POST /director/pause` y `/resume`; botón en la franja, acción en ⌘K y aviso «En pausa · Nomos no recibirá mensajes». El estado se refresca al llegar `director.*` |
| **Límites de presupuesto** (hallazgo 7) | `PUT /budget`; editor en línea por métrica («Definir/Cambiar/Subir límite»). `GET /budget` devuelve además `scope` y `scopeId` |
| `'wasm-unsafe-eval'` (hallazgo 1) | en la política de seguridad del servicio (commit `d464bed`) |
| `project.ts` / `project-root.ts` | unificados en `project-root.ts` (commit `19c2bf6`) |
| **Deshacer decisión** | retirado de `estados.md`: el modelo no lo contempla, una decisión caducada se regenera |

**Distinto de lo planeado:** «Indexar» sigue deshabilitado con «Disponible en el hito 4». «Pedir cambios» del Resumen sigue usando `POST /messages`; el compositor del Chat usa `/runs/:id/message`. La pestaña Cambios depende de que la ejecución tenga worktree con `baseCommit` y `sessionRef`; si no, responde 404 y se ve «Disponible cuando haya workers».

**Sigue dependiendo de otros hitos:** que el planificador del hito 3 respete `director.paused`; «Preparar para Unreal» y listar mensajes (hito 4+).

**Comprobado en esta rama:** `npm test` 217/217, `npm run test:panel` 117/117, `npm run build` verde, e2e Playwright 37 pasadas / 3 omitidas. Las capturas `drawer-*` y `presupuesto-limites-*` se hicieron con un worker de ejemplo montado a mano sobre la semilla, no con un worker real de Codex. El e2e del visor GLB (Chromium) ahora exige cero errores de consola y pasa con `'wasm-unsafe-eval'`; se quitó el filtro que toleraba ese error en el e2e de Entregas. No se ejecutaron `review-animations` ni `/impeccable polish`: solo una revisión visual de las capturas.

