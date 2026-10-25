# Aceptación del hito 20: las pruebas no dejan basura y las Decisiones no se repiten

Rama `hito20-higiene` sobre `main@45bd516`. Commits: `6d66505` (procesos), `ca991e6` (intermitentes), `195601f`
(Decisiones).

## Tarea 1 · Las pruebas y aceptaciones no dejan procesos vivos

Causa encontrada: `cliFixture` solo paraba el servicio si `isAlive` contestaba, y `isAlive` daba 500 ms para
`/health` + `/status`; con el equipo cargado salía «no vivo», no se llamaba a `stop` y el `server.ts --serve` (lanzado
`detached`) quedaba vivo. Además, `cli stop` de las pruebas tenía 30 s: si el drenaje tardaba más, la orden moría y el
servidor seguía.

- `tests/run.ts` es ahora `npm test`: la suite corre con su propio temporal (`TEMP`/`TMP` = `nomos-suite-*`) y al
  terminar cuenta los `server.ts --serve` con `--data` dentro. Si queda alguno lo dice, lo cierra y sale con 1.
  Comprobado en rojo con una prueba que deja un servicio a propósito: «1 de esta suite después», salida 1.
- `cliFixture` llama siempre a `stop` y, si el pid sigue siendo un `server.ts --serve`, cierra su árbol.
- `nomos stop` espera a que salga el proceso del servicio de esa carpeta y, si algo lo retiene 10 s, cierra su árbol
  (`taskkill /pid N /T /F`). Si el servicio vive dentro de otro proceso (pruebas en proceso) no lo toca.
- Los e2e paran su servicio con `stopService` (`panel/e2e/own-service.ts`): `stop` y, si sigue vivo, el árbol.
- `nomos clean` (`service/src/orphans.ts`) barre servidores huérfanos: `--data` que ya no existe (10 min vivo) o en
  `%TEMP%` sin proyecto registrado en `projects.json` (30 min). Nunca un `--data` relativo, registrado o vivo fuera de
  Temp. Las edades salen de un caso real: durante la suite, el `--dry-run` vio el servicio de otra prueba con su carpeta
  ya borrada mientras cerraba; sin edad mínima, un `nomos clean` de un director lo habría matado.
- `tests/health-load.test.ts` arrancaba el servicio sin `--no-open` y abría el navegador con el token.

### Recuento de procesos `server.ts --serve` con datos en Temp

| Momento | Recuento |
| --- | --- |
| Antes de la suite completa (verificación final) | 1, el huérfano de la aceptación (pid 48252) |
| Después de `npm test` ×2 (700/700 cada una) | «0 de esta suite después» en las dos pasadas |
| Después de Playwright (143 + 3 omitidas) | 0 en Temp (el huérfano ya lo había cerrado `nomos clean`) |

En las seis pasadas completas de `npm test` de las tres tareas el recuento final fue 0. Los únicos `server.ts --serve`
que quedan en la máquina son los de producción: 8780 (KratosFabTest) y 8781 (Block Kings).

## Tarea 2 · Las pruebas intermitentes dejan de serlo

- `tests/cli-asset.test.ts`: espera a que `asset.index` termine (condición, plazo de 60 s) antes de buscar y migrar, en
  vez de competir con el indexador; comprueba que el servicio arrancó; aísla también el log del Launcher.
- `isAlive` da 2 s a cada petición (rojo: un servicio que tarda 1 s daba «no vivo»); `nomos start` espera 30 s.
- `tests/remove-dir.ts`: un solo borrado con reintentos (50 × 100 ms) ante `EPERM`/`EBUSY`/`ENOTEMPTY`. En este Node
  `rmSync` con `maxRetries` no reintenta `EPERM` (rojo: falló en 47 ms con una base SQLite abierta por otro proceso).
  Lo usan todas las pruebas (80 borrados en 54 archivos) y los e2e.

### `cli-asset` 10 veces seguidas con suites completas en paralelo

| Pasada | Resultado | Duración |
| --- | --- | --- |
| 1 | 5/5 | 16,1 s |
| 2 | 5/5 | 16,0 s |
| 3 | 5/5 | 13,9 s |
| 4 | 5/5 | 11,0 s |
| 5 | 5/5 | 9,0 s |
| 6 | 5/5 | 15,3 s |
| 7 | 5/5 | 21,6 s |
| 8 | 5/5 | 20,9 s |
| 9 | 5/5 | 17,8 s |
| 10 | 5/5 | 12,8 s |

Durante las 10 pasadas corrieron dos `npm test` completos seguidos, 696/696 cada uno. Antes del cambio la misma medida
también salió 10/10 (con pasadas de hasta 35 s): el fallo del hito 18 no se reprodujo a voluntad, así que lo que
hay es la causa más probable quitada, no un rojo reproducido.

## Tarea 3 · Una Decisión por problema

Lo que pasó en Block Kings (leído en solo lectura): las cuatro «Retarget manual: LeftLeg, RightLeg sin mapear»
existían una tras otra; cada una caducaba a la anterior y emitía `decision.opened`, así que el director recibía cuatro.

- `openDecision` (`service/src/repo/decisions.ts`): si la tarea tiene abierta una con el mismo tipo (primera evidencia)
  y la misma razón sin uuids, hashes, fechas ni horas, la actualiza (`seen_count`, última evidencia, hora y huella de
  contexto, para que siga resoluble) y emite `decision.updated` con `seenCount`.
- Resolverla resuelve las equivalentes caducadas o abiertas de antes.
- Migración `migrateDecisionRepeats`: columna `seen_count` y, al abrir la base, las abiertas repetidas se quedan en la
  más reciente con el contador sumado.
- Panel: «Visto 4 veces» junto a la tarea en la vista Decisiones y bajo la pregunta en la ficha, dentro del presupuesto
  de 20 palabras; Actividad dice «La decisión se repitió: … · 4 veces».
- Pruebas (`tests/service/decision-repeats.test.ts`): cuatro `character.setup` con la comprobación `animation` en
  «Retarget manual» dan una Decisión con contador 4, un `decision.opened` y tres `decision.updated`; un fallo distinto
  abre otra. `repo.test.ts` cambió: dos excesos de presupuesto iguales eran dos Decisiones y ahora son una con contador 2.

## Aceptación en KratosFabTest

Datos nuevos `--data .nomos-hito20`, puerto 18930, servicio de este worktree. El 8780 no se paró ni se tocó.
El huérfano de prueba se creó para la ocasión a las 07:25:30Z: un `server.ts --serve` real con datos en
`%TEMP%\nomos-h20-huerfano\.nomos`, puerto 18920 y un registro de proyectos aparte (como una prueba).

```
== 07:59:48Z nomos start --data .nomos-hito20 --port 18930 --no-open
ARRANCADO
== 07:59:49Z nomos clean --dry-run --data .nomos-hito20
servidor 48252  C:\Users\richa\AppData\Local\Temp\nomos-h20-huerfano\.nomos  (carpeta temporal sin proyecto registrado)
Se liberarían 0 KB (0 carpetas)
Se cerrarían 1 servidor huérfano
== 08:00:01Z nomos clean --data .nomos-hito20
servidor 48252  C:\Users\richa\AppData\Local\Temp\nomos-h20-huerfano\.nomos  (carpeta temporal sin proyecto registrado)
Cerrado el servidor 48252
Liberados 0 KB
pid 48252 vivo después: False
8780 vivo: True · 8781 vivo: True
== 08:00:05Z nomos clean --dry-run --data .nomos-hito20 (otra vez)
Se liberarían 0 KB (0 carpetas)
== 08:00:06Z nomos stop --data .nomos-hito20
DETENIDO
servidores de .nomos-hito20 vivos: 0
```

El `--dry-run` no listó el 8780 (datos fuera de Temp), el 8781 (`--data .nomos`, relativo) ni el propio 18930.
`Config/DefaultEngine.ini` de KratosFabTest no se tocó.

## Verificación final (antes del commit de la Tarea 3)

`npm test` ×2 700/700, `npm run test:panel` 335/335, `npm run build`, Playwright 143 passed + 3 skipped (chromium y
firefox), skillsmith 98 (S01/S03 de siempre).
