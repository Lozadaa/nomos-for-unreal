# x10 · siguiente: dónde se va el tiempo ahora que Unreal ya no arranca en frío

Fecha: 2026-11-07, tras fusionar `nomos-x10`, `caliente2`, `fastvfx`, `umg-bucles` y `acelera` en `main` (0035760).
Datos: `Herbalist/.nomos/nomos.db` en solo lectura (30 oct – 5 nov, 45 tareas cerradas, 1 366 runs, 506 876 eventos,
53 493 órdenes). Ninguna de las cinco ramas x10 se ha visto aún en una producción real: estas cifras son las de **antes**.

## Reloj de una tarea: 45 tareas cerradas suman 311 h; la mediana son 4 h y el p90, 21 h

| Dónde está la tarea | Horas (sumadas sobre las 45) | Qué pasa |
|---|---|---|
| **`preparada`** (lista, sin worker) | **219 h** (78 esperas, mediana 31 min, p90 6,4 h) | Espera hueco de `claude` (2), RAM, dependencias o una decisión |
| `implementando` | 133 h | El worker trabaja o espera al director |
| `revisando` | 91 h | Comprobaciones + revisor + correcciones |
| `cerrando` / `integrando` | 21 h | |

Dentro de esas horas, tiempo muerto medido entre un paso y el siguiente:

| Hueco | n | Mediana | p90 | Suma |
|---|---|---|---|---|
| El worker entrega (`revisando`) → arranca la 1.ª comprobación o revisión (solo las entregas que acabaron en una; las que volvieron a `implementando` por una corrección del director no cuentan) | 175 | 1,5 min | **18,8 min** | **35 h** |
| Decisión abierta → resuelta (47 de 51 las resolvió el propio director con la opción obvia) | 51 | 1 min | — | **44 h**; dos de ellas 14 h («Reconciliar worker existente» → `leave`) y 12,4 h («Comprobación no disponible: build» → `retry`) |
| Worker pregunta (`NOMOS_ASK`/espera) → respuesta del director | 104 | 1,7 min | 34 min | 18,6 h |
| Revisión rechazada → corrección enviada | 57 | 0,1 min | 1,5 min | 22,3 h (una sola espera larga) |
| Revisión en sí (revisor leyendo) | 127 | 2,8 min | 7 min | 7,6 h |
| Comprobación `umg` | 48 | 2,9 min | 19 min | 12,9 h |
| Comprobaciones `cpp`+`blueprint`+`asset`+`map`+`build` | 197 | < 3,2 min | — | 3,6 h |

Por qué se difieren las órdenes del servicio (`command.deferred`, una cada 5 s):

| Motivo | Difericiones | ≈ horas paradas |
|---|---|---|
| «Esperando decisión: Comprobación no disponible: build» | 8 802 | 12,2 |
| «Esperando decisión: Reconciliar worker existente antes de continuar» | 6 927 | 9,6 |
| «N GB libres, hacen falta 6» (RAM; libre entre 1,7 y 5 GB en un PC de 32) | 3 316 | 4,6 |
| «Esperando decisión: Cambios sin registrar: …» | 2 692 | 3,7 |
| «Editor de Herbalist: ocupado por implementacion» | 1 642 | 2,3 |
| «Sin hueco en claude» (el revisor compite con los dos implementadores) | 1 022 | 1,4 |

Y el bucle de corrección: 127 revisiones, **59 rechazadas (46 %)**; 262 correcciones enviadas a los workers; las tareas
de UI llegan a 8-15 revisiones (UI Kit v1: 14 correcciones, 20 ciclos de UI, 11,5 h). Los hallazgos que más se repiten
no son de código: falta la carpeta de evidencia o el vídeo, el criterio se afirma sin medida, un archivo fuera del
alcance, un puntero LFS en vez de la imagen, las pruebas corridas sobre otro commit, capturas de estados que el ciclo
no produce.

Lo que ya atacó la ronda anterior (arranque en frío de Unreal: 21 h; contexto fijo; compactación) está en
[analisis.md](analisis.md) y [resultados.md](resultados.md). Lo de arriba es lo que queda y pesa más que aquello.

## Qué cambió (rama `tiempo-muerto`, 2026-11-07)

- **Decisiones obvias resueltas solas** (`service/src/decisiones-auto.ts`): a los `decisiones.autoMinutos` (5) el servicio elige la opción con la que el director las resolvió 47 de 51 veces: reconciliar → dejar preparada, cambios sin registrar → commitear, comprobación no disponible → reintentar y a la segunda continuar sin ella, falta pedir integración/revisión → pedirla. Evento `decision.auto_resolved`; las preguntas de alcance o diseño siguen abiertas. Con las cifras de Herbalist habrían devuelto 44 h de Decisiones y 25 000 difericiones.
- **Cupo propio para el revisor** (`concurrency.revisor`, 1): la revisión ya no espera detrás de los dos implementadores («Sin hueco en claude», 1 022 difericiones). Un proveedor apagado sigue sin lanzar revisores.
- **`nomos metricas [--desde FECHA] [--json]`** (`service/src/metricas.ts`): las medidas de esta nota leídas de `nomos.db` en 1,7 s (Herbalist, 670 MB). Con ella salió una corrección: el hueco entrega → comprobación son 35 h (175 entregas, p90 18,8 min), no 96: la cifra anterior contaba entregas que volvieron a `implementando` por una corrección del director sin que nadie las comprobara.
- Sin probar en un juego real; `npm test` en verde (ver commit).

## Qué propongo, por horas que devuelve

1. **Que nada espere a una persona cuando la respuesta es obvia** (≈ 70 h de 311). Hecho en esta rama, sin medir en un juego.
   - Las decisiones «Comprobación no disponible: build», «Reconciliar worker existente», «Cambios sin registrar» y
     «Tarea parada sin ningún paso en marcha» se resolvieron 47 veces de 51 con la misma opción (`retry`, `leave`,
     `commit`, `retomar`). Que el servicio las aplique solo tras un plazo corto (p. ej. 5 min) y deje la Decisión
     como aviso, no como bloqueo. Las 8 que siguen abiertas sí eran para el usuario (alcance, diseño, conflicto en main).
   - El revisor no debe competir con los implementadores por el cupo de `claude`: una revisión dura 2,8 min y pesa
     86 k; cupo propio para `revisor`/`qa` (o lanzarlo con `claude -p`, sin terminal de Orca ni sondeo).
   - Medir el hueco «entrega → primera comprobación» (35 h): hoy nadie lo ve.
2. **Cortar correcciones mecánicas antes de la revisión** (≈ la mitad de los 59 rechazos).
   `nomos entrega --verificar` (o dentro del `NOMOS_DONE`): carpeta de evidencia del criterio existe y no es un puntero
   LFS; ningún archivo del diff fuera de `scope`; los tests declarados corrieron sobre el HEAD entregado; cada criterio
   numerado aparece citado en el README de evidencia. Lo que falle vuelve al worker en el acto, sin revisor, sin
   turno de director, sin añadir 300 k de contexto a otra vuelta.
3. **Paralelismo real: la RAM es el tope, no el cupo.** El PC de 32 GB tenía entre 1,7 y 5 GB libres durante toda la
   producción con `minFreeRamGb: 6`: dos sesiones de Claude, dos editores (ahora el caliente son 4 GB con
   `-RenderOffscreen`), ShaderCompileWorkers, más Chrome (3,6 GB hoy), ChatGPT, Discord, WhatsApp y Edge (≈ 6 GB de
   escritorio). Opciones, de menor a mayor: cerrar el caliente de un worker en cuanto alguien espera RAM (hoy solo si
   espera el editor); medir RAM por proceso en `machine.ts` y enseñarlo en `status` para ver quién la gasta; 64 GB de
   RAM, que es lo único que permite dos editores y dos workers a la vez.
4. **Correcciones en sesión nueva a partir de la 2.ª**: el contexto medio por turno eran 299 k porque cada corrección
   vuelve a la misma sesión. La compactación a 200 k ya está en `main` sin probar; la alternativa segura es relanzar
   con brief + diff + corrección (85 k) desde la 2.ª vuelta. Hay que medir una u otra en Herbalist antes de elegir.

## Calidad del propio desarrollo de Nomos

- **Nada de x10 está probado en un juego.** Cinco ramas fusionadas con el Unreal falso y un proyecto de banco. Lo
  primero es una tarea canario en Herbalist con las métricas de arriba antes y después. Los scripts de esta nota
  (Python sobre `nomos.db`) deberían ser `nomos metricas`: reloj por estado, huecos entre pasos, decisiones abiertas,
  tasa de rechazo, difericiones por motivo, tokens por turno. Sin eso cada mejora se mide a mano o no se mide.
- **`npm test`: 831 pruebas, 3 min 5 s, 1 fallo** (en `main`) en esta pasada (`orca-final` «readiness propaga aborto local…»,
  plazo de 100 ms con el Orca falso colgado; no saltó). Con los intermitentes conocidos (`graph`, `worker-recovery`,
  `editor-caliente`, `orca-create`) son cinco pruebas que fallan según la carga del PC: todas miden tiempo real con
  plazos de 0,1-15 s. Que los falsos avisen por archivo o señal en vez de dormir.
- **Sin comprobación de tipos**: no hay `tsconfig.json` en la raíz, Node ejecuta el `.ts` quitando tipos y
  `typescript` no está instalado en el repo (el panel usa `tsc -b` para lo suyo). 13 385 líneas de servicio sin que
  nadie compruebe un tipo. `npm run check` = `tsc --noEmit` sobre `service/` y `tests/`, y correrlo con la suite.
- **Sin puerta antes de fusionar**: ni CI ni hook; cada rama x10 se fusionó con «npm test N/N» escrito a mano en el
  commit. Un `pre-push` con `npm test` (3 min) y `tsc` basta.
- **Cambios del usuario sin commit** en `main` desde el 7 nov (`codex -c model_reasoning_effort=medium` en
  `worker-launch.ts`, su test y el Orca falso). La suite pasa con ellos.
