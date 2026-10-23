# Tarea 4 · mapa y gráficos reales

2026-10-23. El mapa sustituye los filtros de etapa repetidos; sus nodos filtran y alternan de nuevo a Todas, conservando URL y navegación con transición. Los nombres bajo los nodos permiten leer el flujo sin una leyenda externa.

Actividad agrega 24 intervalos horarios de los eventos recibidos, con rango visible, etiqueta completa de carril y cobertura explicada en tooltip. Hay **ocho carriles**, incluido OpenCode: cada Sparkline recibe un carril y conserva el contrato de uno a siete por componente. Proveedor del evento o de su ejecución consultada, nunca inferido del responsable de la tarea. Los estados conocidos del evento usan su glifo; los demás conservan la entidad neutral. Se corregió también la fuente `builds` de la semilla para atribuirla a Compilaciones.

La revisión visual detectó etiquetas de Mensaje/Respuesta superpuestas y carriles de sparkline truncados. Se corrigieron con tres niveles por carril, puntos compactos en grupos densos y 96 px para etiquetas. Cada evento conserva botón y detalle completo al enfocar/pasar/seleccionar. Las capturas posteriores comprueban automáticamente que los tres eventos de Chat no se superponen en ambos tamaños.

Presupuesto conserva `PUT /budget`, sus límites editables y sus cifras. Dibuja anillo únicamente si existe un límite; no inventa porcentaje sin límite. Límite cero se representa agotado. Un fallo al guardar conserva el borrador; guardar y cancelar devuelven el foco al disparador. Capacidades distingue conectores de agentes reales, muestra nombres cortos y grupos de 48 px con totales por proveedor; comprobar vuelve a detectar, sin prometer una validación que el servicio no realiza.

Cambios usa el agregado de todos los resúmenes numéricos de `git --stat`, incluidos binarios y bloques concatenados de archivos nuevos. No cuenta signos escalados ni líneas del patch. Sin resumen verificable no dibuja gráfico; conserva stat, filtro y alerta de alcance.

## Verificación ejecutada

- RED conductuales de mapa/anillos, capacidades, eventos/series/posicionamiento y parser/diff antes de sus implementaciones. La regresión de foco de presupuesto se añadió con la corrección; no se afirma RED individual para ella.
- `npm --prefix panel test`: **196/196**; build correcto, con aviso heredado del tamaño de chunks.
- Playwright completo tras corregir las capturas: **37 pasadas, tres omisiones existentes de Firefox**. Con 500 eventos: primera pintura registró frames largos de 68/118 ms; el evento nuevo no registró ninguno superior a 50 ms. La primera pintura sigue siendo un límite observado, no se declara resuelta.
- `node scripts/capturas-9.ts tarea4`: diez capturas, sin pageerror ni desbordamiento horizontal; revisión visual a ambos tamaños. [Mapa](capturas-9/produccion-mapa-9-1366.png), [Actividad](capturas-9/actividad-9-1366.png), [Presupuesto](capturas-9/presupuesto-9-1366.png), [Capacidades](capturas-9/capacidades-9-1366.png), [Cambios](capturas-9/cambios-9-1366.png).

Los límites de descubrimiento de ejecuciones siguen descritos en la auditoría de la Tarea 3. No hay push, merge ni cambios del servicio.
