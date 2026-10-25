# Aceptación del hito 17 · La build sabe de dónde sale y el planificador cuenta bien

Fecha: 2026-10-25 00:08 hora local. Proyecto de cuarentena `C:\Users\richa\Documents\Unreal Projects\KratosFabTest`
(rama principal `master`, HEAD `9a1c3c7`), datos nuevos `--data .nomos-hito17`, puerto 18870, CLI de la rama
`hito17-origen`. Script: `node panel/scripts/aceptacion-17.ts "<carpeta del juego>" 18870`. El servicio del 8780 siguió
vivo (`/health` 200 antes y después); el de Block Kings (8781) no se tocó. Ningún commit en KratosFabTest y
`Config/DefaultEngine.ini` sin tocar. El token no sale en ninguna salida.

El paquete de prueba es un ejecutable falso en `.nomos-hito17/artifacts/tests/aceptacion-17/build/Windows/` (donde deja
sus paquetes la comprobación `build`): así solo lo ve este servicio, nunca el «Jugar» del 8780. No se lanzó el juego.

## Origen de la build

| Paso | Resultado |
|---|---|
| `nomos start --port 18870 --no-open` | `ARRANCADO` |
| `nomos build stamp <paquete>` desde la carpeta del juego | `Build estampada: 9a1c3c7 (master)` |
| `GET /play` | `commit 9a1c3c7…`, `stale: false` |
| `nomos play --status` (`text`) | «Build de 9a1c3c7, 0 min, al día con main» |
| `build-info.json` con el primer commit del repo (`328d360`) | `stale: true` |
| `nomos play --status` (`text`) | «Build de 328d360, 0 min, anterior a main» |
| Panel a 1920 | «Esta build no incluye los últimos cambios de main» con el color de aviso junto a «Última build», el tooltip de Jugar lo repite con un punto de aviso, Jugar sigue activo; ni el commit ni rutas en pantalla |
| `nomos stop --data .nomos-hito17` | `DETENIDO` |

Captura: [`capturas-17/produccion-build-anterior-a-main-1920.png`](capturas-17/produccion-build-anterior-a-main-1920.png).

## Cupo con workers vivos

No se reprodujo con workers reales en KratosFabTest (habría que tener dos Claude trabajando en un juego en cuarentena).
Cubierto con el fake de Orca en `tests/service/scheduler-busy.test.ts`: una run viva + una terminada con el terminal
ocupado y `concurrency.claude 2` → la tercera espera con «Cupo lleno: J1.10 corrigiendo» y no se encola
`worker.start`; al cerrar el terminal, arranca. El mismo caso con el runner real (`startRunner` + fake de Orca por
proceso) y `GET /status` → `capacity: "cupo lleno: J1.10 corrigiendo"`.
