# x10 · punto 5: bucles de UI que no pasan el QA visual

Fecha: 2026-11-07. Rama `umg-bucles`. Datos de `Herbalist/.nomos/nomos.db` leídos en solo lectura.

## Qué fallaba según los datos

35 eventos `test.failed` de `umg` en Herbalist (30 oct–5 nov):

| Tipo de fallo | Veces | Cómo se repetía |
|---|---|---|
| Rechazo del QA visual (hallazgos `[bloqueante]`/`[mayor]`) | 25 | El QA pide capturas de estados que el ciclo no produce: «solo se ve la ficha de inspección», «faltan Explorar, MirarPlanta, GuardiaCerca», «falta la hoja de las cinco piezas». La misma petición vuelve en `e5b57194` (5 veces), `50564e9c` (dos veces casi literal a 8 min), `6f02c62c`, `760a69c8` y `b642e942`. El worker no puede arreglarlo tocando la UI. |
| Regresión contra la línea base | 9 | Medidas casi idénticas en vueltas seguidas: `078f930a` 94,74 % → 94,73 % en 3 min; `e5b57194` 46,07 % → 46,11 % → 43,92 % en 5 min (tolerancia 35 %). Era un rediseño a propósito (UI Kit v1): la línea base vieja no iba a pasar nunca. |
| Captura sin UI | 1 | 0,01 % de diferencia con la captura de control. |

La tarea de los 20 intentos es `e5b57194` («UI Kit v1»): 17 `ui.cycle`, 10 umg fallidas, 14 correcciones a un solo worker. El tope general de correcciones estaba subido a 12 («Máximo de 12 correcciones alcanzado», resuelta con «Revisar») y no distingue una vuelta que mejora de una que repite. El director acabó abriendo a mano dos Decisiones «El QA visual vuelve a pedir la hoja de las cinco piezas…», que quedaron sin resolver.

Además, el worker recibía el resumen en bruto: en las regresiones venía también «Capturas listas: esperando el QA visual», que contradice el fallo, y nada le decía si su cambio había movido algo.

## Qué cambia

1. **Diagnóstico corto** (`checks/umg.ts`: `umgFindings`, `compareUmg`, `umgAttempt`). Cada fallo umg, de captura o del QA, se convierte en hallazgos con regla, zona, valor medido y valor esperado:
   `- línea base · umg-ui-1280x720: mide 46,07 % · se espera ≤ 35 %`,
   `- UI visible · 1280×720 · widgets ninguno: mide 0,00 % · se espera ≥ 0,5 %`,
   `- QA mayor · ui-1920x1080.png:1: <nota del QA>`.
   Debajo va la comparación con el intento anterior: «Resuelto», «Mejora», «Sigue igual», «Empeora», «Sigue» o «Nuevo». Con una regresión de línea base se añade una línea: si el cambio es a propósito, que avise al director en vez de tocar la UI. Todo queda en el evento `umg.attempt`, sin imágenes ni logs, y el worker lo recibe como corrección (máximo 12 hallazgos y 12 líneas de comparación).
2. **Tope de reintentos** (`handlers/ui-cycle.ts`: `umgStuck`). Se cuentan los fallos seguidos sin mejora medible. Hay mejora cuando baja el peso de los fallos (bloqueante 3, mayor 2, menor 1, captura o UI ausente 3, línea base 2) o cuando, con el mismo peso, una medida recorre al menos el 25 % de lo que le faltaba hasta su umbral sin que otra empeore lo mismo. Los ±2 puntos de ruido de la captura no cuentan como mejora. Al llegar a `limits.umgRetries` (3 por defecto, en `.nomos/config.json`) no se reenvía al worker. Se abre la Decisión «QA de UI sin mejora medible», con un renglón por intento (`intento N · regla · zona: medido`) y dos opciones: «Devolver al responsable» (reenvía el diagnóstico) y «Reintentar el QA» (vuelve a capturar). La espera una orden `ui.cycle` aplazada, como ya hace `checks.run`. Las dos opciones, un QA aprobado o una mejora reinician el contador (evento `umg.reset`).
3. **Caché por contenido** (`umgInputHash`). Cada ciclo guarda en su run de pruebas (`metadata.umgInput`) un hash de varias cosas: el contenido de los archivos del diff, las líneas base `docs/baseline/umg-*.png`, `docs/ui-direction.md`, la spec con sus criterios y las opciones de captura. Si un intento fallido anterior tiene el mismo hash, no se abre Unreal ni se lanza el QA. Se registra un `test_run` fallido que apunta al mismo log (`cachedFrom` en el evento), el worker lee «Mismos archivos que el intento N: no se relanzó Unreal» y el intento cuenta como sin mejora. Se excluyen de la caché los fallos que pueden ser pasajeros: el juego no dejó capturas o se agotó el tiempo. «Reintentar el QA» se salta la caché.

Pruebas en `tests/service/ui-cycle.test.ts`: análisis de los resúmenes reales, comparación (incluido el caso 94,74 → 94,73), diagnóstico en las dos vueltas, tope en la captura y en el QA, reinicio tras «Devolver», caché y `limits.umgRetries`.

## Qué no se probó en real

Todo se probó con el Unreal falso de `tests/fakes` (`NOMOS_FAKE=noui|fail`) y el revisor falso. Falta comprobar:
- Que los resúmenes que deja el Unreal real (y las notas reales del QA) siguen los formatos que reconoce `umgFindings`. Un formato desconocido cuenta como un único fallo «comprobación», que no se cachea.
- Que el umbral del 25 % separa bien en un juego real las mejoras del ruido de captura. Con los datos de Herbalist sí: 46,07 → 43,92 % con tolerancia 35 % no es mejora.
- El coste de leer uassets grandes para el hash. Hoy se lee cada archivo entero del diff.
- La Decisión en el panel: se pinta como cualquier Decisión de comprobaciones (evidencia `command` en primer lugar).

## Pendiente (fuera de este cambio)

- **Línea base y rediseños**: `newBaseAllowed` (hito 22) solo propone la nueva línea base con la revisión de código aprobada, y en las tareas `ui` esa revisión llega después del QA. Un rediseño declarado (`visual: cambia`) falla la línea base en `ui.cycle` hasta toparse con el tope. Así se explican las 9 regresiones de Herbalist. Arreglarlo cambia la regla de aprobación, así que lo decides tú.
- **Capturas por estado**: el QA pide estados (Explorar, GuardiaCerca, pausa…) que el ciclo no captura, porque solo captura el mapa por defecto y los widgets. Ahora el tope lo saca a la Decisión, pero la solución de fondo es que la tarea declare los estados que hay que capturar.
