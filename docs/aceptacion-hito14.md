# Aceptación del hito 14 · Jugar desde el panel

Fecha: 2026-10-25 00:40-00:50 UTC. Proyecto de cuarentena `C:\Users\richa\Documents\Unreal Projects\KratosFabTest`,
datos nuevos `--data .nomos-hito14`, puerto 18850 (el servicio del 8780 siguió vivo: `/health` 200 al terminar).
Rama `Lozadaa/hito14-jugar`. `Config/DefaultEngine.ini` no se tocó y no hubo ningún commit en KratosFabTest.

**Veda del usuario (2026-10-24 23:27-23:28 UTC):** hasta nuevo aviso no se lanza el juego empaquetado en este
equipo. Toda la aceptación del botón se hizo con un ejecutable falso; el lanzamiento real queda pendiente (abajo).

## 1. Un paquete real resuelve

Con `.nomos-hito14` vacío ningún candidato resolvía: `Build/Windows/` solo tiene `FileOpenOrder` y los paquetes de
`.kratos-hito5b-lfs/artifacts/tests/` son de otra carpeta de datos. Se copió el único paquete con ejecutable
(`.kratos-hito5b-lfs/artifacts/tests/ccd4cbea…/build/Windows/`, 1,9 GB) a `Build/Windows-actual/` con robocopy
(conserva fechas). `nomos play --status --data .nomos-hito14`:

```text
build.path      …\KratosFabTest\Build\Windows-actual\KratosFabTest.exe
build.builtAt   2026-10-24T10:24:50.055Z   (el .exe es de 10:24:10; manda el .pak, 40 s más nuevo)
build.task      null, build.check null      (Windows-actual no trae procedencia: «paquete del director»)
running         null
```

## 2. El botón, contra un ejecutable falso

Se puso una copia de `node.exe` como `Build/Windows-falso/KratosFabTest.exe` (más reciente que la real) con
`espera.mjs` (espera 120 s) y `.nomos-hito14/config.json` `{"play":{"args":["espera.mjs"]}}`. El script de
aceptación comprobaba antes de pulsar que la build elegida era la falsa y, si no, abortaba sin pulsar.

| Paso | Resultado |
|---|---|
| `GET /play` antes de pulsar | `Build\Windows-falso\KratosFabTest.exe` |
| Pulsar «Jugar» en el panel (Chrome, 1920) | pasa a «Jugando · 00:02 · Detener», verde ([captura](capturas-14/aceptacion-jugando-1920.png); antes, [Jugar](capturas-14/aceptacion-jugar-1920.png)) |
| `tasklist /FI "PID eq 52632"` durante la partida | `"KratosFabTest.exe","52632","Console","1","46,808 K"` |
| Pulsar «Detener» | el botón vuelve a «Jugar»; `tasklist`: «No tasks are running»; `GET /play` `running: null` |
| Eventos | `play.started {pid 52632, builtAt 00:48:44Z, task null}` 00:48:57Z · `play.stopped {pid 52632, reason "stopped"}` 00:49:00Z |

Después se borraron `Build/Windows-falso/`, el `config.json` y el `play.json` de la prueba (para que la build real
vuelva a contar como nueva), y `nomos play --status` volvió a dar `Build\Windows-actual\KratosFabTest.exe` sin
partida. `nomos stop --data .nomos-hito14` → `DETENIDO`. `Build/Windows-actual/` (la copia real) se queda para el
lanzamiento pendiente.

## 3. Pendiente: lanzamiento real (cuando el usuario levante la veda)

Desde PowerShell. `<nomos>` es la carpeta del repositorio de Nomos con esta rama, o `main` cuando se haya fusionado:

```powershell
cd "C:\Users\richa\Documents\Unreal Projects\KratosFabTest"
node <nomos>\service\src\cli.ts start --data .nomos-hito14 --port 18850
node <nomos>\service\src\cli.ts play --status --data .nomos-hito14   # build.path = ...\Build\Windows-actual\KratosFabTest.exe
# pulsar «Jugar» en el panel que abre el start (o: node <nomos>\service\src\cli.ts play --data .nomos-hito14)
tasklist /FI "IMAGENAME eq KratosFabTest*"                              # el lanzador y el juego (Binaries\Win64)
# captura de la ventana del juego (1920x1080 en ventana) y de la cabecera en «Jugando»
# pulsar «Detener» (o: node <nomos>\service\src\cli.ts play --stop --data .nomos-hito14); tasklist vacío
node <nomos>\service\src\cli.ts stop --data .nomos-hito14
```

Lo que hay que comprobar en ese momento y no se ha podido aquí: que el paquete real arranca con
`-windowed -ResX=1920 -ResY=1080` desde la carpeta del ejecutable, y que «Detener» cierra también el proceso hijo
del juego (`taskkill /T` sobre el lanzador, el mismo mecanismo que ya usa la comprobación `build`).
