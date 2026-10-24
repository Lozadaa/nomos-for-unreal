# Auditoría de diseño · hito 1a

Superficies auditadas: la maqueta elegida `design/maquetas/a/index.html` y `design/estilo.html` (más `design/componentes.css`, compartido). Capturas finales en [`capturas-1a/`](capturas-1a/): `a-1366.png`, `a-1920.png`, `a-1366-sin-panel.png`, `a-peticion-1366.png`, `estilo-1366.png`, `estilo-1920.png`, `estilo-1366-completa.png`.

## Resumen de puertas

| Puerta | Herramienta | Resultado | Hallazgos | Corregidos | Pendientes |
|---|---|---|---|---|---|
| 1. Accesibilidad / UX / UI | `web-design-guidelines` (reglas descargadas de GitHub con WebFetch) | Ejecutada con salvedad (ver nota) | 22 (más 1 que no aplica) | 18 | 3 |
| 2. Crítica de diseño | `impeccable` (`critique`, solo Assessment A) | **Parcial**: sin detector | 5 prioritarios + 9 observaciones menores | 4 prioritarios (3 de ellos en parte) + 4 menores | 1 prioritario + 3 menores (1 se mantiene, 1 son preguntas abiertas) |
| 2b. Pulido | `impeccable` (`polish`, manual) | Hecho a mano siguiendo `polish.md` | — | Lista abajo | — |
| 3. Heurísticas | `ux-heuristics` Quick Diagnostic | Hecha por quien implementa | 4 filas fallidas | 1 | 3 |
| 4. Teclado | Revisión estática + DOM | **Parcial**: sin pulsaciones reales | 2 | 2 | 1 (verificación manual) |
| 5. Contraste AA | `tests/tokens.test.ts` | Verde (7 pruebas en total) | 1 (`textTertiary`) | 1 | 0 |
| 6. 1366×768 | DOM en el navegador integrado | Cumple | 0 | — | 0 |

### Lo que NO se pudo ejecutar

- **El detector de Impeccable** (`impeccable detect`, y el overlay del navegador): su lanzador descarga un binario de GitHub y el entorno bloqueó ejecutar código externo descargado (ver `docs/diseno/skills-instaladas.md`). Por eso la crítica se hizo solo con la evaluación de diseño (Assessment A, en un sub-agente aislado). Es una crítica degradada: banner `⚠️ DEGRADED: sin detector determinista`. No se guardó snapshot de crítica.
- **Pulsaciones reales de teclado**: el navegador integrado no estaba visible y rechazó eventos de teclado. El recorrido es estático (reglas CSS y orden del DOM) y por consulta de estilos calculados; falta pasar Tab de verdad una vez.
- **Reglas de Vercel**: `web-design-guidelines` pide traer `command.md` con WebFetch; esa herramienta devuelve un resumen hecho por un modelo pequeño, no el texto literal. Las reglas aplicadas son ese resumen. Conviene repasar `command.md` en bruto en el hito 1b.
- No se probó con zoom al 200 %, ni con `prefers-reduced-motion` emulado, ni en Firefox/Safari, ni con un lector de pantalla.

## 1. `web-design-guidelines` (Vercel)

Formato `archivo:línea`. Líneas del HTML generado tras las correcciones.

| Hallazgo | Dónde | Estado |
|---|---|---|
| Dos `<h1>` (barra del índice y contenido) | `design/estilo.html:79` | Corregido: el título del índice es un `<p>` |
| Salto de encabezados (`h1` → `h3` en las columnas) | `design/maquetas/a/index.html:105` | Corregido: columnas `h2` |
| Sin enlace «Saltar al contenido» | `design/maquetas/a/index.html:61`, `design/estilo.html:77` | Corregido (`.skip`, `componentes.css`) |
| `role="status"` sobre toda la franja (relojes que cambian saturan al lector) | `design/maquetas/a/index.html:85` | Corregido: solo el título del estado |
| `aria-controls` repetido en las seis pestañas; pestañas con `tabindex="-1"` imposibles de alcanzar sin JS | `design/maquetas/a/index.html:263` | Corregido: solo la seleccionada controla el panel (`role="tabpanel"`), todas alcanzables |
| Tarjetas `<article tabindex=0>` sin rol ni acción | `design/maquetas/a/index.html:133` | Corregido: son enlaces (`<a class="tcard" href="#t-…">`) |
| Placeholders sin «…» y sin ejemplo | `design/maquetas/a/index.html:312` | Corregido |
| Campos sin `name` ni `autocomplete` | formulario «Nueva petición», campos de `estilo.html` | Corregido (`autocomplete="off"`, `type="search"`) |
| Estado de carga sin «…» | `design/estilo.html:142` | Corregido: «Enviando a Nomos…» |
| Unidades sin espacio duro («89,9 MB», «4 s», «3 min», «720 px») | copy de las dos páginas | Corregido en los textos visibles |
| Sin `:active` en botones | `design/componentes.css` | Corregido |
| Sin `prefers-reduced-motion` global | `design/componentes.css:208` | Corregido (solo había uno para el spinner) |
| Sin `touch-action: manipulation` | `design/componentes.css:202` | Corregido |
| Sin `overscroll-behavior: contain` en el panel | `design/componentes.css:205` | Corregido |
| Sin `text-wrap: balance` en títulos | `design/componentes.css:201` | Corregido |
| Sin `color-scheme: light` | `design/componentes.css:200` | Corregido |
| Casilla de plegar sin indicador de foco (maqueta B) | `design/maquetas/b/index.html:40` | Corregido |
| `translate="no"` en valores de tokens | `design/estilo.html:99` | Corregido; falta en los IDs mono de la maqueta |
| Etiquetas «ayuda» y estado vacío ya correctos | — | `✓ pass` |
| `<meta name="theme-color">` | — | **Pendiente (1b)**: pide un color literal fuera de `tokens.css`; lo generará el build |
| Estado del panel solo en el `#hash` | `design/maquetas/a/index.html` | **Pendiente (1b)**: filtros, pestañas y panel abierto irán a parámetros de URL |
| Enlaces `href="#"` de relleno en la maqueta | barra lateral | **Pendiente (1b)**: rutas reales |
| «Title Case en títulos y botones» | — | No aplica: el copy en español usa mayúscula inicial (`ux-writing`) |

## 2. `impeccable`

### Crítica (Assessment A, sub-agente aislado)

Método: `⚠️ DEGRADED: sin detector (Assessment B no ejecutado)`.

- **Especificidad**: la estructura es de este producto (latido de la franja, decisión con su coste, «Prohibido para IA»); la piel (Plex, azul, tarjetas blancas) es intercambiable con otros paneles. Aceptable para un panel de operación.
- **Heurísticas de Nielsen (antes de corregir): 25/40**, «aceptable». Más bajas (2): control y libertad, consistencia, flexibilidad, recuperación de errores, ayuda.
- Fortalezas: franja y estados con icono y texto; formulario y decisión con consecuencias visibles; profundidad con disciplina (sin degradados, sin rayas laterales, sin tarjetas dentro de tarjetas).

| # | Problema prioritario (severidad) | Estado |
|---|---|---|
| P1 | El panel de detalle tapa el contenido (3) | **Corregido en parte**: desde 1600 px reserva su ancho (a 1920 se ve el catálogo entero junto al panel). A 1366 sigue superponiéndose; la regla lo documenta y quedan dos columnas legibles |
| P2 | La atención está dispersa y los contadores no se pueden pulsar (3) | **Corregido**: contadores = enlaces a la tarjeta; la tarjeta marcada lleva la antigüedad («Bloqueada · 9 min») y la causa al pasar el cursor |
| P3 | Iconos repetidos con significados distintos (2) | **Corregido en parte**: en el catálogo, texto plano en lo habitual y etiqueta solo en excepciones; el matraz de las pruebas desaparece de la tarjeta. Se mantienen familias de significado (ban = bloqueado o prohibido; help = por decidir o por saber). La miniatura con inicial es un marcador hasta tener imágenes reales |
| P4 | Jerga en primer plano (2) | **Corregido en parte**: ejecución, espacio de trabajo y habilidades pasan a «Detalles técnicos» plegado. No se cambia «Nomos atendiendo N mensajes», «Última recepción confirmada» ni «Indexar ahora»: el copy lo fija el plan y el hito 0 |
| P5 | Escala sin adaptar a 1920: tablero pequeño y espacio vacío (2) | **Pendiente (1b)**: escala responsive del tablero y tamaños de letra |

Menores y señales por persona:

| Observación | Estado |
|---|---|
| Las dos opciones de decisión llevaban un botón primario (parecía recomendación) | Corregido: ambas secundarias |
| «Elegir» sin confirmación ni deshacer | Corregido en copy y `/estilo` (aviso «Elegiste … Deshacer» y frase de consecuencia) |
| `role="status"` ruidoso, `aria-controls` repetido, tarjetas sin rol | Corregido (ver puerta 1) |
| La línea meta recortaba la antigüedad | Corregido: la meta muestra responsable y pruebas; la antigüedad va al pasar el cursor |
| Foco que puede entrar en tarjetas tapadas por el panel a < 1600 px | **Pendiente (1b)**: mover el foco al panel al abrirlo y marcar el fondo `inert` si lo cubre |
| Sin filtro «lo que me toca», sin atajo a la siguiente decisión | **Pendiente**: filtro en 1b, atajos en el hito 7 (`Ctrl+K`) |
| Sin leyenda de estados (Preparada frente a Pendiente) | **Pendiente (1b)** |
| «Decisiones 1» repite el contador de la franja | Se mantiene: son dos caminos al mismo sitio |
| Preguntas abiertas para 1b: ¿identidad visual por agente?, ¿una vista inicial «Te toca a ti»?, ¿plegar «Hecha» y ensanchar lo atascado? | Sin decidir |

### Pulido (`polish`, hecho a mano)

Orden de la guía: cuestiones funcionales primero, luego jerarquía y sistema, luego detalles.

1. Estados que faltaban: `:active`, carga con texto, decisión elegida con Deshacer, panel de detalle vacío (Pruebas sin datos).
2. Jerarquía: un solo botón primario por zona; opciones de decisión al mismo nivel; IDs técnicos plegados.
3. Sistema: `.skip`, `.tech`, tarjetas como enlaces y el patrón de tarjeta con sombra 2 en curso viven en `componentes.css` o en la maqueta A, sin valores a mano (la prueba lo comprueba).
4. Contenido: espacios duros en unidades, puntos suspensivos en cargas y placeholders.
5. Limpieza: sin `tabindex` sueltos, sin `aria-controls` huérfanos.

## 3. `ux-heuristics` · Quick Diagnostic (tablero, panel de detalle, catálogo)

| Pregunta | Resultado | Nota |
|---|---|---|
| ¿Se sabe qué página es? | Sí | Título, ítem activo de la barra y nombre del espacio de trabajo |
| ¿La acción principal es obvia? | Sí | «Nueva petición» es el único primario; con el panel abierto aparece otra primaria («Enviar a Nomos» solo en el formulario) |
| ¿La navegación es clara? | Sí | Indicador «estás aquí»; nueve destinos |
| ¿Se encuentra la búsqueda? | **No del todo** | Hay búsqueda en el catálogo; la global llega con `Ctrl+K` (hito 7). Severidad 2, pendiente |
| ¿El sistema muestra lo que pasa? | Sí | Franja, estados con texto, cargas con motivo |
| ¿Los errores ayudan? | Sí | Qué falló y qué hacer; el motivo de un bloqueo está en el panel y al pasar el cursor |
| ¿Se puede deshacer o volver? | **Corregido** | Decisión con Deshacer; cierre del panel; Cancelar en el formulario |
| ¿Funciona sin hover? | **Parcial** | La causa del bloqueo y la antigüedad se leen al pasar el cursor; también están en el panel y en el nombre accesible. Severidad 2, pendiente |
| ¿Todo lo interactivo tiene nombre? | Sí | Botones con icono llevan texto oculto; contadores con título |
| ¿Algo hace pensar «¿eh?»? | **Sí** | «Cuarentena», «Indexar» y «habilidades» necesitan una frase de ayuda. Severidad 2, pendiente |

Puntuación: **7/10** (sin fallos de severidad 3 o más; cuatro filas con fallo menor, una corregida).

## 4. Recorrido con teclado (`estilo.html` y maqueta A)

Hecho por inspección y consulta al DOM; no con pulsaciones reales.

- 84 elementos alcanzables en `estilo.html`, todos con orden de tabulación igual al visual (sin `tabindex` positivo). El orden: enlace para saltar, índice (9), y luego las secciones de arriba abajo.
- Foco visible: regla global `:focus-visible` con contorno azul de 2 px y separación de 2 px (`componentes.css:26`); campos con contorno propio; ningún `outline: none` en todo `design/`. En la maqueta B, la casilla de plegar muestra el foco sobre su botón.
- Etiquetas: ningún campo sin etiqueta; ningún botón sin nombre.
- Encabezados: un `h1`, sin saltos.
- Pestañas: todas alcanzables con Tab (en el producto, el componente de Ant Design añadirá las flechas).
- **Pendiente**: pasar Tab de verdad en un navegador visible y anotar cualquier salto raro.

## 5. Contraste AA

Calculado en `tests/tokens.test.ts` (7 pruebas del archivo en verde): texto, secundario y terciario sobre blanco, sobre el gris de fondo (`bgLayout`) y sobre el gris suave (`bgSubtle`); blanco sobre el azul y sobre el azul al pasar el cursor; azul de enlaces sobre blanco; colores semánticos a 3:1 sobre blanco; y el texto y los iconos sobre los fondos suaves de estado (12 %) y los 10 % y 5 % de azul y rojo. Un valor del plan cambió: `textTertiary` pasa de `#6B7280` a `#69707E` (ver `docs/diseno-visual.md`). `warning` (3,64:1) y `success` (4,21:1) solo se usan en iconos, bordes y fondos suaves, nunca como texto pequeño.

## 6. 1366×768 con barra lateral (medido en el DOM, maqueta A)

- Sin desbordamiento horizontal de la página.
- Franja del director: borde inferior a 64 px; el panel de detalle empieza en 64 px (no la tapa).
- Formulario «Nueva petición» (panel): título, primer campo y botón «Enviar a Nomos» visibles sin desplazar (el botón termina a 756 px de 768); el cuerpo no desplaza; cada campo reserva 18 px de ayuda o error.
- Tablero y catálogo caben sin desplazar la página; el tablero se desplaza en horizontal dentro de su región.
- Nombre con emoji (`Raqueta Nude_Tennis_Racket_🎾`): elipsis, sin romper la columna.

## 7. Revisión final de la rama y correcciones posteriores

Un revisor con contexto fresco leyó la rama completa. Sin hallazgos críticos. Lo que se corrigió después, cada cosa con una prueba que fallaba antes:

| Hallazgo | Corrección |
|---|---|
| La prueba de `tokens.css` regeneraba el archivo antes de compararlo, así que nunca fallaba por un CSS desfasado | Ahora compara primero el archivo versionado con el generado (comprobado a mano: cambiar `--k-size-md` en `tokens.css` hace fallar la prueba) |
| El escáner de «sin valores a mano» tenía huecos (nombres de color, `hwb(`, `font:`, `border-radius` en px o %, sombras compuestas, `text-shadow`, degradados, px dentro de `style=""`) | Escáner ampliado y probado con 20 casos sintéticos; limpiados los 6 sitios que ya incumplían (`width:240px` ×3, `max-width:720px` ×2, el degradado de «hueco por desconexión») |
| `/estilo` usaba `--col-w` de 192 px y la maqueta 176 px | Igualados a 176 px |
| `role="status"` en las seis franjas de ejemplo de `/estilo` | Quitado (se mantiene en los avisos) |
| La sección 5 decía comprobar el terciario sobre el gris suave y la prueba no lo hacía | Prueba añadida |
| `docs/diseno-visual.md` decía «8 columnas a 1920» sin aclarar que es sin panel | Corregido |
| `live-browser.js` y `modern-screenshot.umd.js` de Impeccable sin documentar | Anotados en `skills-instaladas.md` |
| La captura completa de `/estilo` se cortaba antes de los estados vacíos | Recapturada más alta |

Observaciones menores que se dejan anotadas (no bloquean el hito):

- El emoji de `Raqueta Nude_Tennis_Racket_🎾` solo se ve en el catálogo; en las tarjetas la elipsis corta antes (a 1366 la columna «Cerrando» queda fuera de vista).
- Con el panel abierto a 1366 asoma una tira roja de la tarjeta bloqueada junto al borde del panel y el catálogo pierde las columnas Licencia y Estado.
- El tablero a 1366 no da ninguna pista de que «Cerrando» y «Hecha» existen más a la derecha.
- La franja «En pausa» de `/estilo` usa la clase de «escuchando» (verde).
- `.help` no admite errores largos (una línea con elipsis).
- La ayuda de los campos no está enlazada con `aria-describedby`; el `aria-label` de las tarjetas oculta «responsable · pruebas» al lector; «Enviar a Nomos» está fuera de un `<form>`.
- En `/estilo`: enlaces `href="#cerrar"` y `href="#"` sin destino; el panel vacío muestra `r-0151 · ws/…` en primer plano; todos los botones en carga dicen «Enviando a Nomos…».
- «Nomos atendiendo N mensajes» dará «1 mensajes» (copy fijado por el hito 0; resolver el plural en 1b).
- `contrast()` y `mix()` no admiten hex de 3 dígitos ni con alfa.
- `opacity` y `gap` en px siguen sueltos en `componentes.css` (el escáner no los vigila).
