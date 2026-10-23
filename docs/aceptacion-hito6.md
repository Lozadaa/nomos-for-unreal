# Aceptación del hito 6 · integración y cierre

Fecha: 2026-10-23. Equipo: Windows 11, Orca 1.4.207, Claude Code 2.1.309, Git, Node 25.9. Proyecto real
`C:\Users\richa\Documents\Unreal Projects\KratosFabTest` (rama objetivo `master`). Servicio de este worktree con
`--data .kratos-hito6` (excluido en `.git/info/exclude`) y `config.json`
`{"concurrency":{"claude":2,"codex":0},"defaultProvider":"claude","targetBranch":"master"}`: **ningún worker Codex**.
Director: esta sesión, por la CLI (`kratos task …`), sin Monitor. Unreal no se lanzó: las tareas de la aceptación
no tocan Unreal y `checks.run` las registra como «el diff no toca Unreal».

## Resumen

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Tarea completa hasta `done` con worker Claude | **Sí**, dos veces (A y su ajuste) | A `dc79d2e4`: implementación → revisión Claude → pruebas → `master@9a9aad9` → `done` |
| Archivo preservado y verificado | **Sí** | `.kratos-hito6/archive/dc79d2e4…/`: 6 archivos, SHA-256 verificado; pestaña Archivo |
| Worktree temporal retirado sin forzar | **Sí** (tras una corrección) | `git worktree list` sin `kratos-dc79d2e4`; el de revisión quedaba: corregido y comprobado con la hija |
| Continuación con terminal muerto | **Sí** | hija `646171b0`, intento 2, brief con «Continuación» (resumen + diff) → `done` |
| Continuación con terminal vivo | **Sí** (estado preparado a mano, ver abajo) | hija `3721f617`: `task.continued.reused: true`, mismo `term_d3b38769`, intento 2 |
| Conflicto binario → Decisión | **Sí** | B `2a8e55ea`: «Conflicto binario al integrar en master: Marcador.uasset», shas de cada lado |
| Recomprobación con la base cambiada | **Sí** | hija `646171b0`: `checks.run` sobre el workspace antes de publicar `master@ab97d81` |
| Integraciones serializadas | **Sí** (y corrección) | «Esperando reserva: KratosFabTest (tarea 2a8e55ea…)»; ver hallazgo 3 |
| `/kratos pausar` detiene un arranque | **Sí** | E `94f25052`: «Director en pausa», 0 `worker.start`; arranca al reanudar |

## Recorrido

1. **Tarea A** «Notas de producción del hito 6» (`Docs/Hito6.md`, criterio `check:` para pasar por pruebas).
   El planificador arrancó un worker Claude (`term_7aae9923`); `KRATOS_DONE` → `revisando`. El director leyó el diff
   (`kratos run diff`) y pidió `kratos task review`: revisor Claude aprobado → `probando` → `test.skipped` («el diff no
   toca Unreal») → `integrando`.
2. `kratos task integrate dc79d2e4…`: workspace `.kratos-hito6/integration/KratosFabTest` (HEAD separada), reserva
   `integration/KratosFabTest`, `merge --no-ff` → `9a9aad9 Integrar Notas de producción del hito 6 (kratos/dc79d2e4)`;
   publicado con `merge --ff-only` en el checkout del usuario (aparece `Docs/Hito6.md`); `task.moved` → `cerrando`
   «Integrado en master@9a9aad9».
3. `kratos task finalize dc79d2e4…` → `done` «Cierre verificado»: archivo con `conversacion.jsonl` (13,8 KB),
   `eventos.jsonl` (37,1 KB), `diff-final.patch`, `sesiones.json`, `resumen.md` y `informes/…review….json`,
   `manifest.json` releído; terminales cerrados (Orca responde `status: "exited"`); `orca worktree rm` sin `--force`.
   Atribución: implementó Builds Worker (Claude), revisó Builds Master (Claude), integró y verificó Builds Builder (Kratos).
4. **Continuación con terminal muerto**: `kratos task continue dc79d2e4… --file …/a.md` («Cambia el tercer punto…»)
   → hija «Ajuste: Notas de producción del hito 6» (`646171b0`), `reused: false`, atribución heredada. El planificador
   arrancó un run con **intento 2** y el brief incluyó «## Continuación» con `resumen.md` y el diff final archivados.
   El worker lo hizo; revisión aprobada; al integrar, `master` ya había avanzado (paso 6): `checks.run` sobre el
   workspace (seq 504) y luego `integration.completed` (seq 509) → `master@ab97d81`; `finalize` → `done`, y esta vez
   **sin worktrees** de la tarea (ni el del responsable ni el del revisor).
5. **Continuación con terminal vivo**: tarea D «Terminal vivo» (`c14fb638`); tras su `KRATOS_DONE` se marcó `done`
   **a mano en la base** para reproducir una tarea cerrada antes del hito 6 (worktree y terminal vivos: con el
   finalizador del hito 6 el terminal siempre se cierra). `kratos task continue c14fb638… --file …/d.md` →
   `task.continued {reused: true}`: run nuevo de la hija `3721f617` con el **mismo terminal** `term_d3b38769`,
   intento 2, `worker.message_sent` con el texto; el worker hizo el ajuste en esa sesión y volvió a `revisando`.
6. **Conflicto binario**: tarea B «Marcador binario» (`Content/Kratos/Marcador.uasset` = `00 01 02 03`). Con su worktree
   ya creado, commit en `master` del mismo archivo con `00 09 09 09` (`8e942e0`, autor «Aceptación hito 6»).
   `kratos task integrate 2a8e55ea…` → `integration.conflict {binary: ["Content/Kratos/Marcador.uasset"]}`, `abortMerge`
   (workspace limpio, `master` intacto) y Decisión «Resolver en el worktree / Descartar la integración» con
   `Content/Kratos/Marcador.uasset: master 75218e8 · kratos/2a8e55ea eaf36c1` e informe «Integración · conflicto».
   **La Decisión queda abierta**: la elige el usuario.
7. **Pausa**: `kratos pausar` → tarea E creada queda `preparada` con «Director en pausa» y ningún `worker.start`; las
   integraciones siguieron. `kratos reanudar` → E arranca en el siguiente ciclo. La cabecera del panel dice «Pausado».

## Hallazgos de la aceptación (corregidos en esta rama)

1. **`terminal read` de un terminal cerrado responde `ok` con `status: "exited"`** (Orca 1.4.207); `terminalAlive`
   ahora mira `status` (el falso de pruebas también).
2. **El worktree del revisor quedaba vivo** tras `done`: el finalizador solo retiraba `task.worktreeId`. Ahora retira
   (y comprueba limpios) todos los worktrees de la tarea; el de revisión de A se retiró a mano con
   `orca worktree rm` sin `--force`. Comprobado en real con la hija de A.
3. **Una integración parada en su Decisión de conflicto retenía la reserva `integration/<proyecto>`** y bloqueaba al
   resto («Esperando reserva»). Tras `abortMerge` el workspace queda limpio: la reserva se suelta al abrir la Decisión
   y mientras siga abierta.
4. La continuación con terminal vivo leería el historial desde el cursor 0 y vería el `KRATOS_DONE` antiguo: el run
   nuevo hereda cursor y marcadores vistos del original.

## Distinto al plan

- **Workspace en HEAD separada**: `git worktree add <ruta> master` falla si `master` está activa en el checkout del
  usuario (lo está en KratosFabTest). El workspace usa `--detach` y la publicación es `merge --ff-only` en el
  checkout que tenga la rama (o `update-ref` con el valor esperado si nadie la tiene). Si el usuario tiene cambios que
  chocan, la integración espera y lo dice (`integration.retry`).
- `checks.run` acepta `dir` (solo desde el integrador; `POST /commands` lo rechaza) para recomprobar en el workspace.
- Orden del finalizador: la limpieza del worktree se comprueba **antes** de cerrar terminales, para que «Commitear al
  run» aún tenga a quién pedírselo. El resto sigue el orden del plan.
- Una tarea aprobada en `revisando` sin criterios `check:` pasa a `integrando` al pedir `integrate` (nada la movía).
- `orca worktree rm` borra también la rama `kratos/<tarea>`; los commits siguen en `master` (el merge los contiene).

## Fuera del alcance, anotado

- **Revisión de un cambio solo binario** (hito 3): el parche excluye binarios, `diff.patch` llega vacío y el árbol del
  revisor nace de `master`, así que el revisor no ve la implementación y rechaza; además escribió `KRATOS_REVIEW` y el
  JSON en líneas separadas y el run quedó «esperando». Para provocar el conflicto se detuvo ese revisor y B se aprobó
  **a mano** (`review_approved=1`). Pendiente para el hito de revisión.

## Comandos

```
cd "<juego>"; K="node <kratos>/skills/kratos/scripts/kratos.ts"
$K start --data .kratos-hito6 --port 8796 --no-open
$K task create --title '…' --area builds --spec-file .kratos-hito6/specs/a.md --role implementacion --provider claude --data .kratos-hito6
$K task review <id> --data .kratos-hito6
$K task integrate <id> --data .kratos-hito6
$K task finalize <id> --data .kratos-hito6
$K task continue <id> --file .kratos-hito6/continuaciones/a.md --data .kratos-hito6
$K pausar --data .kratos-hito6 ; $K reanudar --data .kratos-hito6
node panel/scripts/capturas-6.ts "<juego>/.kratos-hito6" <tareaHecha>   # → docs/capturas-6/
node panel/scripts/capturas-6-semilla.ts                                  # Entregas con la semilla
```

## Capturas (`docs/capturas-6/`, 1366 y 1920)

- `produccion-6-*`: tareas reales, «Pausado» en la cabecera, B «Espera decisión» en Integrando.
- `tarea-6-*`: ficha de A con «Quién hizo qué» (avatares del hito 9). `archivo-6-*`: pestaña Archivo.
- `entregas-6-*`: Entregas reales («Revisión · informe», «Integración · conflicto»).
- `entregas-6-semilla-*`: Entregas por tarea con la semilla: «Captura UMG 1280×720», «Captura de control 1280×720»,
  «Modelo · caja de munición» y «Compilación C++ · registro» con sus dos primeras líneas de error.

## Estado que queda

Servicio de aceptación vivo en el puerto 8796; B con su Decisión abierta; E arrancado tras reanudar; D y la hija de D
en `done`/`revisando`. `master` de KratosFabTest: integraciones `9a9aad9` y `ab97d81` y `8e942e0` (commit de prueba del
conflicto). Nada se publicó (sin push).
