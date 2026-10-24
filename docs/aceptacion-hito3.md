# Aceptación real del hito 3

Fecha: 2026-10-23. Juego: `KratosFabTest` (Git `master`, HEAD `328d360`).
Producto: rama `hito3-workers` de Nomos. Director: CLI de Nomos ejecutada a mano
por Claude Opus (sin panel ni Monitor). Orca 1.4.207, Node 25.9.0.

Hubo dos ejecuciones. La primera lanzó workers Codex. A mitad, el usuario pidió
no usar más Codex, repetir la prueba con el worker Claude Code de la Tarea 4 y dejar
Claude como proveedor por defecto. La segunda ejecución es esa repetición, completa.

## Fixture común

Dos peticiones declaran la misma reserva `Content/UI/WBP_HUD.uasset`, sin dependencia
entre ellas. La reserva es declarativa: nadie crea ni toca el `.uasset` (eso es del hito 5).
Cada worker escribe solo dos archivos de texto en su rama:

- Munición: `Scripts/kratos-hito3/ammo.mjs` + `ammo.test.mjs`, con `formatAmmo(current, capacity)`.
  Antes de implementar, emite `NOMOS_ASK` y espera una palabra clave: es la barrera
  que permite observar a la segunda tarea esperando.
- Vida: `Scripts/kratos-hito3/health.mjs` + `health.test.mjs`, con `formatHealth(current, maximum)`.

Las tareas se crearon con `nomos task create --spec-file … --leases Content/UI/WBP_HUD.uasset`
(la bandera nueva de esta tarea), así la reserva existe antes de que la tarea quede preparada.
Ningún worker se arrancó a mano: los arrancó siempre el planificador.

## Ejecución 1 · Codex (interrumpida a petición del usuario)

Datos en `<juego>/.nomos-hito3`, config `{"concurrency":{"codex":2,"claude":1,"opencode":0}}`.

| Tarea | ID | Run | Resultado |
|---|---|---|---|
| A munición | `c46ac819` | `3b7ed031` codex | done, commit `c3ce62c`, 52/52 pruebas propias |
| B vida | `653957cf` | `89aab1e2` codex | cancelado por `worker stop`; ya había hecho el commit `3caa2ff` |

Observado (seq del registro de eventos):

1. A arranca (5 `run.started`, 6 `lease.acquired`). B se crea con un cupo Codex libre y
   queda `preparada`, sin run ni worktree: 39 `task.waiting` «Esperando reserva:
   WBP_HUD.uasset (tarea c46ac819-…)». `GET /leases` mostraba un solo titular: el run de A.
2. A cargó sus skills de rol y confirmó `NOMOS_SKILLS` con las cuatro.
   **Fallo encontrado:** Codex imprimió `NOMOS_ASK` en la línea de continuación (sangrada)
   del mismo mensaje. El parser de pantalla no lo reconocía y el run quedó en espera genérica
   («codex espera instrucciones»). Si eso le pasa a `NOMOS_DONE`, la reserva no se libera nunca.
   Se corrigió con TDD (ver Correcciones) y se reinició el servicio. La reserva sobrevivió al reinicio.
3. `worker send` con clave estable `acceptance-hito3-release-a-v1` al mismo run (216).
   **Segundo fallo:** al cambiar la pantalla, el ASK ya contestado volvió a poner el run
   en espera (224). También se corrigió (ver Correcciones).
4. DONE real de A: 405 `lease.released` → 406 `run.finished` → 409 B deja de esperar →
   412 `run.started` B → 413 `lease.acquired` B. B arrancó sola.
5. Aquí llegó la instrucción del usuario. Se puso el cupo Codex a 0 **antes** del stop,
   para que el planificador no relanzara B con Codex. Después, `worker stop` de B:
   483 `lease.released`, 484 `run.finished` cancelado, 485 B vuelve a `preparada`.
   Esto también comprueba de paso el Review Focus 5 (cancelar libera reservas).
   No se hizo revisión de A en esta ejecución.

## Ejecución 2 · Claude Code (completa)

Datos en `<juego>/.nomos-hito3-claude`, config
`{"defaultProvider":"claude","concurrency":{"codex":0,"claude":2,"opencode":0}}`.
Las tareas se crearon **sin** `--provider`: Claude salió del proveedor por defecto.
Hay dos cupos Claude, así que la espera de la segunda tarea solo puede deberse a la reserva.

| Tarea | ID | Run | Worktree / terminal | Resultado |
|---|---|---|---|---|
| C munición | `58fff203` | `558d44c6` implementacion claude | `kratos-58fff203` / `term_5d56c3f7…` | done, commit `62602af` |
| D vida | `847ec7c9` | `fb79463a` implementacion claude | `kratos-847ec7c9` / `term_07dc0aa6…` | done, commit `2ef63f0` |
| Revisión de C | `58fff203` | `c4d5b0cd` revisor claude | `kratos-58fff203-review-c4d5b0cd` / `term_1ea4c490…` | aprobada |

Secuencia observada (seq, hora UTC):

| seq | hora | evento |
|---|---|---|
| 5–6 | 17:11:58 | `run.started` C, `lease.acquired` C |
| 18 | 17:12:08 | C `implementando`: brief entregado tras la readiness `bypass permissions` |
| 43 | 17:12:30 | `worker.waiting` C con la pregunta real «¿Puedo empezar? Responde CONTINUAR_HITO3_C» |
| 53 | 17:12:37 | D `preparada`, `task.waiting` «Esperando reserva: WBP_HUD.uasset (tarea 58fff203-…)», sin run ni árbol |
| 79 | 17:13:03 | `worker.message_sent` C (`acceptance-hito3-release-c-v1`); sin nueva espera falsa |
| 99–101 | 17:13:20 | `lease.released` C, `run.finished` C done, C `revisando` |
| 103–107 | 17:13:22 | D deja de esperar, `run.started` D, `lease.acquired` D (sin arranque manual) |
| 128 | 17:13:35 | `review.started` C: revisor `c4d5b0cd`, `same_provider: true`, commit `62602af` |
| 180–182 | 17:14:03 | `lease.released` D, `run.finished` D done, D `revisando` |
| 191 | 17:14:08 | `review.finished` C: `approved: true`, `stale: false`, dos hallazgos `low` |

Mientras se revisaba C, D implementaba: dos workers Claude en paralelo, en árboles y
terminales distintos. El revisor es otro run, con otro worktree y otro terminal.
`task.worktreeId` siguió apuntando al árbol del implementador. Como solo Claude estaba
habilitado, el evento lleva `same_provider: true`, como pide el plan.

Tras aprobar: C tiene `reviewApproved=1` y sigue `revisando`. No pasa a `done`, porque sus
criterios no llevan `check:`. Hallazgos del revisor, ambos reales:
`formatAmmo(1.5,'30')` lanza `RangeError` antes de comprobar que el segundo argumento sea
un número; y ninguna prueba combina tipo inválido con rango inválido. No se pidió corrección.

Skills: los tres runs cargaron sus skills con la herramienta Skill de Claude («Successfully
loaded skill») y las confirmaron con `NOMOS_SKILLS`. Las de implementación fueron
`ue-project-context`, `ue-cpp-foundations`, `ue-gameplay-framework` y `ue-module-build-system`.
El revisor cargó `code-review` y `superpowers:requesting-code-review`.
No hubo `worker.skills_missing`. `run.model` es `null`: el modelo `sonnet` sale del comando
de lanzamiento, no de un dato que el servicio registre.

## Validación independiente

Se ejecutó desde una carpeta temporal fuera del juego:

| Árbol | `node --test` propio | Asserts externos (9 por módulo) | Archivos del commit |
|---|---|---|---|
| `kratos-c46ac819` (Codex A) | 52/52 | 9/9 | solo los dos del alcance |
| `kratos-58fff203` (Claude C) | 5/5 | 9/9 | solo los dos del alcance |
| `kratos-847ec7c9` (Claude D) | 4/4 | 9/9 | solo los dos del alcance |

Los asserts externos cubren valores normales y bordes (`0/1`, `30/30`, `33%`, `66%`, `0%`,
`100%`), negativos, fracciones, NaN, máximo 0, valor por encima del máximo y `TypeError`.
Ningún árbol quedó con cambios sin commit, salvo los archivos internos `.nomos-brief.md` e inbox.

Integridad del juego: `Content/` y `Config/DefaultEngine.ini` coinciden con la línea base
(198 archivos, 0 cambiados, 0 perdidos, 0 añadidos, por SHA-256; no se leyó el contenido
de la config). `master` sigue en `328d360`. Las carpetas `.nomos-hito3*` quedan sin registrar
en el Git del juego: no se tocó su `.gitignore`.

## Correcciones hechas por la aceptación

Commit `50aa1dc`, con prueba RED/GREEN para cada cambio:

- `screenMarkers` acepta un marcador sangrado con dos espacios solo si continúa un mensaje
  con viñeta (`•`, `●`, `⏺`). La salida de herramienta (`└`, `│`, `⎿`), el prompt (`›`)
  y una línea suelta siguen rechazados. La prueba usa el frame real de Codex.
- En modo pantalla, un `NOMOS_ASK` ya visto no vuelve a poner el run en espera.
  Una pregunta nueva sí.
- `defaultProvider` en `.nomos/config.json` (por defecto `claude`) ordena la elección del
  planificador; `worker start` usa `claude` si no se indica proveedor. La concurrencia por
  defecto pasa a `{codex:2, claude:2}`: Codex solo cubre un cupo cuando Claude está lleno,
  y con `"codex":0` no se lanza nunca.

## Límites

- Director por CLI, no con `/nomos` + Monitor + panel. La skill (sección Repartir, eval 06)
  describe ese flujo, pero aquí no se ejecutó con Monitor.
- No se revisó A (Codex) con Claude: la instrucción del usuario llegó antes. Lo que sí se
  comprobó es una revisión Claude de trabajo Claude, con `same_provider: true`.
- No hubo edición de widgets, compilación, PIE ni capturas de Unreal (hito 5).
- Recursos conservados: bases `.nomos-hito3` y `.nomos-hito3-claude` y cinco worktrees nuevos
  (`kratos-c46ac819`, `kratos-653957cf`, `kratos-58fff203`, `kratos-58fff203-review-c4d5b0cd`,
  `kratos-847ec7c9`) con sus ramas y terminales; los de hitos anteriores no se tocaron. Los dos servicios
  están detenidos. Las sesiones de los workers en Orca no se cerraron.
