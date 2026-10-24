# Auditoría del hito 10 · Panel para revisar sin leer

Fecha: 2026-10-24. Rama `Lozadaa/hito10-panel-revisar` sobre `main@2768cec`. Sin push ni merge.
Datos: la semilla de capturas (`panel/scripts/capturas-10.ts`, con las vistas reales de KratosFabTest) y una **copia de solo
lectura** de `.nomos/nomos.db` de Block Kings (24 tareas, 137 artefactos, 200 mensajes), con los comandos pendientes
marcados como hechos, el director en pausa y Orca fuera del PATH para que el servicio de la copia no tocara nada real.
El original y la carpeta del juego no se modificaron.

## Medido

Palabras visibles en `main` (método del hito 9: `panel/scripts/palabras.ts`), ancho útil y tarjetas por fila.
Las cifras son iguales a 1366 y 1920 salvo el ancho.

| Vista | Semilla antes → después | Block Kings antes (`main`) → después |
|---|---|---|
| Producción | 129/131 → 129/131 palabras; ancho 1352 → 1872 px a 1920 | 390 → 390; ahora con miniatura de la última entrega en la fila |
| Entregas | 69 → 37 palabras; 4 → 6 columnas a 1920 | **no cargaba** en 9,5 s (esqueletos a 1366 y 1920) → 293 palabras, cargada |
| Chat | 11 → 11 (la semilla no tiene mensajes) | 11 (solo los mensajes de los últimos 500 eventos) → 1628: la conversación entera |
| Presupuesto | 58 → 58 | 0 a 1366 (esqueletos) / 5 → 5 a ambas |
| Actividad, Catálogo, Decisiones, Capacidades, Estilo | sin cambio de texto; a todo el ancho salvo Chat, Decisiones y Estilo (72ch) | sin cambio |

| Pregunta | Antes | Después |
|---|---|---|
| Clics para ver la última captura de una tarea | 2 (pestaña Entregas y tarjeta) | 0 desde Producción (miniatura en la fila); 1 para verla grande |
| Clics para ver el mapa desde otro ángulo | imposible: 1 captura por comprobación | 0: la hoja de contactos es la portada de la tarjeta; galería con flechas y miniaturas al abrirla |
| Capturas por comprobación de mapa o build | 1 (jugador) | 4 vistas + hoja 2×2 (KratosFabTest real: 28 s, `docs/capturas-10/fabtest/`) |
| Informes y registros a la vista | una tarjeta 4:3 por informe, JSON y texto enteros en el visor | plegados al final de cada tarea, una línea de veredicto por elemento |
| Peticiones `GET /runs/:id` al abrir Producción (Block Kings, 5 s) | 170 | 85 |
| `GET /messages` con 200 mensajes | 0,64 s | 0,003 s |
| Scroll horizontal en Chat (1024, 1366 y 1920; 600 caracteres sin espacios, tabla ancha, código largo) | — | ninguno (`scrollWidth == clientWidth`, e2e) |

## Lo que obligaba a leer en vez de mirar, y qué se hizo

Arreglado en este hito (pequeño):

1. **Entregas y Presupuesto se quedaban en esqueletos con datos reales.** `useResource` aplazaba su petición con cada
   evento relevante (rebote sin espera máxima); con la reproducción del SSE de Block Kings la petición no salía nunca en
   9,5 s. Ahora es un límite de frecuencia: sale a los 100 ms aunque sigan llegando eventos (`useResource.test.tsx`).
2. **170 lecturas de runs al abrir Producción.** `useRuns` releía cada run por cada trozo de la reproducción; ahora agrupa
   las lecturas cada 120 ms (85). Queda una petición por run: ver propuestas.
3. **El Chat no enseñaba la conversación de Block Kings** (se reconstruía con los últimos 500 eventos). `GET /messages`
   la da entera, con índice `events(message_id)`.
4. **Producción sin nada que mirar**: la fila lleva la miniatura 16:9 de la última captura o fotograma de vídeo de la tarea.
5. **Cursiva espuria en el Markdown**: `Columna_0_ancha` o `SM_Raqueta_01` salían en cursiva; el guion bajo dentro de una
   palabra ya no la abre (prueba con el ejemplo).
6. Adenda 4 del chat: sin scroll horizontal (bloques de código y tablas con scroll propio dentro de la burbuja, cadena
   flex con `min-w-0`), tarjetas en vivo también cuando el director crea antes de responder, entrada suave de cada
   mensaje y de cada cambio de estado, puntos y avatar con pulso al escribir, botón Enviar que reacciona, scroll al final
   solo si el usuario ya estaba abajo; todo con tokens y `motion-reduce`. Capturas `chat-sin-scroll-1024.png` y
   `chat-tarjetas-1920.png`.

Propuesto (grande), con su coste:

| Propuesta | Por qué | Coste |
|---|---|---|
| `GET /runs?ids=` por lotes | Producción hace aún una petición por run (85 con Block Kings) | servicio + `useRuns`, ~½ día |
| Motivo de la fila con glifo («Depende de…» se repite en 11 de 12 filas preparadas de Block Kings y se trunca) | hay que leer y pasar el ratón para saber de qué depende | glifo de dependencia + miniatura de la tarea bloqueante, ~½ día |
| Vídeo corto de la comprobación (como `hoja-video.jpg` de J1.5) junto a la hoja | la hoja es fija; un recorrido de 5 s enseña movimiento | ffmpeg ya está; ~1 día con el rig de cámara |
| Comparación lado a lado con la línea base en la galería | hoy la diferencia es otra imagen del conjunto | visor con dos paneles, ~½ día |
| `/status` se pide 2-3 veces por segundo | ruido de red y de CPU | sondeo por SSE, ~½ día |
| Barrido de `npm test` bajo carga | 7 fallos de plazo del Orca falso en una pasada con el equipo cargado (no en las siguientes) | ya listado en el hito 7 |

## Capturas

`docs/capturas-10/`: las nueve vistas antes (`*-antes-*`, `main`) y después del ancho completo (`*-despues-*`) a 1366 y
1920; estado final (`*-final-*`); Block Kings antes (`*-blockkings-antes-*`, panel de `main`) y después
(`*-blockkings-*`); Entregas (`entregas-tarea2-*`, `entregas-informes-*`), galería de ángulos (`galeria-angulos-*`),
hoja de contactos real (`fabtest/map-hoja.jpg` y sus cuatro PNG), chat (`chat-en-vivo-1920`, `chat-markdown-1920`,
`chat-tarjetas-1920`, `chat-sin-scroll-1024`) y proyectos (`portada-proyectos-1920`, `selector-proyectos-1920`).
Medidas en `medidas-*.json`.
