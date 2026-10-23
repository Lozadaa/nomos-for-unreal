# Dirección visual del panel de Kratos

Elegida en el hito 1a tras comparar tres maquetas (`design/maquetas/{a,b,c}/index.html`) a 1366×768 con la barra lateral abierta y a 1920×1080. Las capturas están en [`docs/diseno/capturas-1a/`](diseno/capturas-1a/). Los tokens viven en `design/tokens.json` y se generan a `design/tokens.css`; la galería de componentes es `design/estilo.html`.

## Elegida: A · Sala de control densa

El tablero de producción manda: ocho columnas, tarjetas compactas de 56 px con una línea de meta, sombra de nivel 1 en superficies y barra lateral siempre abierta. Todo lo demás (catálogo, detalle, nueva petición) se organiza alrededor del tablero.

### Comparación

| Criterio | A · Densa | B · Con aire | C · Actividad primero |
|---|---|---|---|
| Columnas visibles a 1920 sin panel (barra lateral abierta) | 8 de 8 | 7 de 8 (hay que desplazar; 8 si se pliega la barra lateral) | 8 de 8 |
| Columnas visibles a 1366 con barra lateral, sin panel | unas 6 | unas 5 | unas 7 (tarjetas muy estrechas) |
| Con el panel de detalle abierto a 1366 | 2 columnas legibles, la franja libre | 2 columnas, tarjetas más legibles | 2 columnas, títulos a dos líneas |
| Catálogo con sus 6 filas a 1366 | Todas, sin desplazar la página | Todas, ajustadas | Solo 3-4; el resto exige desplazar |
| Formulario de nueva petición a 1366 | Título, primera fila y acción visibles | Igual | Igual |
| Nombre largo o con emoji | Elipsis en una línea | Dos líneas, luego elipsis | Dos líneas, luego elipsis |
| Estado distinguible sin color | Icono propio por estado; texto en las tarjetas marcadas | Icono + nombre del estado | Solo icono (el texto va al pasar el cursor) |
| Coste previsto en Ant Design | Bajo (`Card` pequeña + `Table`) | Medio (avatar, dos líneas) | Alto (carriles con eje de tiempo en la vista principal) |

### Por qué A

1. **Es la que cabe.** A 1366×768 el tablero y el catálogo entran sin desplazar la página, y a 1920 se ven las ocho columnas a la vez cuando no hay panel abierto (con el panel de 720 px abierto quedan cinco, y el catálogo entero). B pierde una columna a 1920 incluso sin panel (podría ganar espacio plegando su barra lateral a 64 px) y C obliga a desplazar el catálogo a 1366.
2. **Se mira más de lo que se teclea.** Doce tarjetas se leen de un vistazo: icono de estado, título y una línea con responsable, pruebas y antigüedad. El detalle completo (ejecución, espacio de trabajo, habilidades, dependencias) está un clic más allá, en el panel lateral.
3. **Resiste datos reales.** Con `Nude_Tennis_Racket_🎾` o un título de cuarenta caracteres la tarjeta no cambia de altura, así que ninguna columna se descuadra. Es también la más barata de implementar y mantener con Ant Design.

### Lo que se toma de las otras dos

- **De B:** las tarjetas de tareas en curso (implementando, revisando, probando, integrando, cerrando) llevan sombra de nivel 2, así que se separan de las que esperan; y la barra lateral se puede plegar a 64 px (útil a 1366 con el panel abierto). Los datos de B que A no muestra en la tarjeta (ejecución, dependencias, responsable) aparecen al pasar el cursor y en el panel.
- **De C:** el diseño de los carriles (24 px de alto, trozos con icono de color, eje de tiempo) se usa tal cual en la vista Actividad, que no necesita ocupar la pantalla de Producción.

## Reglas de aquí en adelante

**Capas y sombras.** Fondo gris (`bgLayout`), superficies blancas. Sombra 1 en tarjetas, paneles, barra lateral y franja del director. Sombra 2 en el panel de detalle, las tarjetas en curso, las tarjetas bajo el cursor, avisos y desplegables. Nunca una superficie blanca sin sombra sobre el gris, y nunca tarjetas dentro de tarjetas.

**Franja del director.** Arriba de la zona principal, 64 px de alto, siempre visible y nunca tapada por el panel de detalle (el panel empieza justo debajo). Lleva, de izquierda a derecha: icono y texto del estado, contadores de atención (bloqueadas, decisiones, cierres fallidos), última recepción confirmada y Pausar/Reanudar. El estado se distingue por icono y texto además del color.

**Anchos.** Barra lateral 248 px (64 plegada). Panel de detalle 720 px. A 1366 con barra lateral el panel se superpone al tablero: quedan libres la franja del director y unos 398 px de tablero, dos columnas legibles. A partir de 1600 px el panel reserva su ancho (la zona principal se estrecha en vez de quedar tapada), de modo que a 1920 se ven cinco columnas y el catálogo entero junto al panel. Columnas del tablero de 176 px como mínimo; el tablero se desplaza en horizontal dentro de su región (enfocable por teclado) y nunca la página entera.

**Atención.** Lo que necesita al usuario (bloqueadas, decisiones, cierres fallidos) sale en la franja como enlaces que saltan a la tarjeta; la tarjeta marcada muestra el estado y cuánto lleva así («Bloqueada · 9 min») y la causa al pasar el cursor y en el panel. Una decisión elegida avisa de lo que pasa y ofrece Deshacer.

**IDs y rutas.** Ejecución, espacio de trabajo y habilidades cargadas (datos técnicos, en JetBrains Mono) van plegados bajo «Detalles técnicos» en el panel; no aparecen en primer plano.

**Densidades.** Control de 32 px y radio de 8. Tarjeta de 56 px. Fila de tabla de 36 px. Carril de actividad de 24 px. Paso de espaciado de 4/8 px (`--k-space-*`).

**Formularios.** Toda pantalla con formulario cabe en 1366×768 con la barra lateral: título, primera fila y acción principal sin desplazar. Los formularios viven en el panel lateral, no en una página aparte. Cada campo reserva una línea de ayuda o error (`.help`, 18 px) para que no haya saltos al aparecer un error. Los párrafos explicativos van bajo el título del panel, fuera del formulario.

**Color y texto.** El color de un estado va en un icono (o borde), y el texto de la etiqueta usa el color de texto normal. Motivo: `warning` (3,64:1) y `success` (4,21:1) no llegan a 4,5:1 sobre blanco, así que no se usan como color de texto pequeño. Se admiten como icono, borde o fondo suave (12 % mezclado con blanco).

**Desplegables y capas.** Ninguna capa se corta por la ventana ni queda tapada por la franja: el panel de detalle va debajo de la franja y el cuerpo del panel se desplaza dentro, con el pie de acciones siempre visible.

**Sin.** Rayas de color en el borde de tarjetas, degradados decorativos, iconos de relleno, logs técnicos en primer plano, «cargando» sin decir qué se espera.

**Tipografía.** IBM Plex Sans para texto, JetBrains Mono solo para logs, IDs y rutas. En las maquetas y en `/estilo` se cargan desde Google Fonts con una etiqueta `<link>`; el hito 1b decide si las empaqueta. Si no cargan, el fallback (Segoe UI, sistema) se ve correcto.

**Geometría con nombre.** Los tamaños de letra, radios, sombras, colores y espaciado salen de `tokens.css`. La geometría propia de una pantalla (alto de tarjeta, ancho mínimo de columna, ancho de etiqueta de carril) se declara como variable con nombre al inicio de la página (`--card-h`, `--col-w`), nunca suelta dentro de una regla. Una prueba comprueba que no hay colores, sombras, tamaños de letra ni radios escritos a mano.

## Ajustes respecto a los valores del plan

- **`textTertiary`: `#6B7280` → `#69707E`.** Sobre el gris de fondo (`bgLayout`) el valor original daba 4,43:1; con el mínimo oscurecimiento que pasa AA da 4,56:1 (sobre blanco, 4,98:1). `neutral` sigue en `#6B7280` (se usa en iconos, donde basta 3:1).
- Contrastes medidos sobre blanco: texto 17,74 · secundario 7,56 · terciario 4,98 · primario 5,70 · éxito 4,21 · aviso 3,64 · error 5,62 · morado 5,15 · neutro 4,83. Blanco sobre primario 5,70, sobre primario al pasar el cursor 7,31.

## Cambios respecto al plan de implementación

- Se añade `design/componentes.css` (botones, campos, etiquetas, tarjetas, tabla, panel de detalle) compartido por las maquetas y `/estilo`, para que la galería enseñe exactamente lo que usan las pantallas. Solo usa `var(--k-*)`.
- Las maquetas llevan un segundo panel, «Nueva petición», que se abre con `#nueva-peticion` (y `#cerrar` oculta el panel), solo con CSS. Sirve para comprobar la regla del formulario en 1366×768, porque con el panel de detalle abierto el formulario no cabe bajo el tablero.
- La prueba de «sin valores a mano» revisa también los `.css` (menos `tokens.css`) y comprueba tamaños de letra y radios, no solo colores y sombras.
- Tras la crítica de diseño (ver `docs/diseno/auditoria-1a.md`), la maqueta A pasa a: tarjetas como enlaces con `id`, chips de atención como enlaces, detalles técnicos plegados, opciones de decisión sin primaria falsa, texto plano en lo habitual del catálogo (etiqueta solo en excepciones). B y C se regeneran con los mismos datos.
- Capturas extra por maqueta: `-sin-panel` (tablero y catálogo completos) y `-peticion` (formulario).
