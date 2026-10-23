# Tarea 3 · filas, Chat y detalle

2026-10-23, después del commit de CORRECCIÓN 2 `2ddec62`.

La fila muestra área, estado con punto, título, id, avatar del implementador con nombre corto y tiempo abreviado. El anillo pertenece al avatar (sólido en curso, discontinuo esperando), según el addendum, sin porcentaje inventado ni anillo adicional. Tooltip, nombre accesible del botón y Sheet explican área, estado, proveedor y etapa. El stepper nombra únicamente la etapa activa; el compositor conserva un select nativo enfocable sobre el pictograma del área. Chat identifica a Kratos con avatar de 32 px y nombre; Tú permanece texto sin proveedor ficticio. El acuse se representa con CheckCircle2 y tooltip.

`useRuns` consulta una vez por id observado en eventos y vuelve a leer ante cambios de ciclo o espera; comparte esas consultas entre las filas y descarta respuestas atrasadas. No hay endpoint agregado de ejecuciones: si un id histórico no aparece en los eventos recibidos, la fila conserva la identidad asignada sin inventar un estado de ejecución. El detalle sí obtiene todas sus ejecuciones desde `/tasks/:id`. Nombres y ordinales vivos se calculan globalmente y el Sheet reutiliza el mismo mapa, con fallback local para ejecuciones no observadas.

## Verificación ejecutada

- RED conductual previo de fila, tooltip, identidad/espera, compositor, stepper, Chat y Sheet. `text-budget` tuvo además un primer RED de importación ausente; no se atribuye un fallo individual previo a cada aserción.
- `npm --prefix panel test`: **161/161**; build correcto.
- Playwright completo: **37 pasadas, tres omisiones existentes de Firefox**, cero fallos.
- `node scripts/capturas-9.ts tarea3`: seis capturas a 1366/1920, sin desbordamiento horizontal ni pageerror. [Producción](capturas-9/produccion-9-1366.png), [detalle](capturas-9/produccion-sheet-9-1366.png), [Chat](capturas-9/chat-9-1366.png), [detalle 1920](capturas-9/produccion-sheet-9-1920.png).
- Mismo recuento de texto en DOM renderizado de main a ambos anchos: Producción **156 → 118**, Chat **55 → 48**. Primera fila completa **9 → 7**; el contrato de siete palabras excluye título/id y también se verifica en Vitest. Baseline en `capturas-9/palabras-antes.json`; el recuento posterior se actualizará al terminar las demás tareas.

Pendientes de las siguientes tareas: mapa, gráficos de las vistas, vacíos y miniaturas, tour/leyenda y auditoría final. No se han modificado servicio, skills, pruebas de raíz ni design; sin push ni merge.
