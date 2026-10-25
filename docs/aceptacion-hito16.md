# Aceptación del hito 16 · El servicio no miente al reiniciar ni al estar ocupado

Fecha: 2026-10-25 01:47 UTC. Proyecto de cuarentena `C:\Users\richa\Documents\Unreal Projects\KratosFabTest`, datos
nuevos `--data .nomos-hito16`, puerto 18860, CLI de la rama `Lozadaa/hito16-estable`. El servicio del 8780 siguió vivo
(`/health` 200 antes y después); el de Block Kings (8781) no se tocó. `Config/DefaultEngine.ini` no se tocó y no hubo
ningún commit en KratosFabTest. El token no aparece en ninguna salida: se compara por una huella de 8 caracteres.

## Reiniciar no invalida los accesos directos

Script con Chromium real (Playwright, 1366 px) como pestaña del panel abierta antes del reinicio:

| Paso | Resultado |
|---|---|
| `nomos start --port 18860 --no-open` | `ARRANCADO`, huella del token `8085831c` |
| Panel abierto con la URL de `nomos start` | `/events` 200, ningún 401 |
| `nomos stop` y `nomos start` | `DETENIDO`, `ARRANCADO`, otro pid, huella `8085831c`: **mismo token** |
| La pestaña, sin recargar | `/events` 200 de nuevo a los 1,6 s del `stop` (reconexión sola); 0 respuestas 401 |
| `fetch /status` desde la pestaña con su token guardado | 200; «Sesión caducada» no aparece |
| Acceso directo con el token de antes (`/status?token=…`) | 200 |
| `nomos stop --data .nomos-hito16` | `DETENIDO`; queda `.nomos-hito16/token` y no queda `service.json` |

La pasada se hizo dos veces seguidas y las dos dieron la misma huella: el token es de la carpeta, no del proceso.

## El vigilante solo avisa de caídas reales

Durante la misma pasada corría `nomos vigila --session aceptacion-h16`: imprimió exactamente dos
`{"error":"service_down"}`, uno en el hueco del reinicio (el servicio estuvo parado de verdad ~0,5 s) y otro tras el
`stop` final, y ninguno más en los ~9 s siguientes (antes salía uno cada 2 s). El caso «ocupado» (`/status` y
`/events` lentos con `/health` al día) está cubierto por `tests/watcher-busy.test.ts`; no se reprodujo con un diff real.

## Orca ausente

Cubierto con el fake de Orca (`tests/service/orca-grace.test.ts`), que reproduce el mensaje real del CLI del
2026-10-24 23:13 UTC («Could not read Orca runtime metadata … Start the Orca app first.»). No se cerró el Orca real:
lo están usando los directores en producción.

## Por qué un diff de 40 s dejaba al servicio sin contestar

No era `execSync`: todo git va por `spawn` asíncrono (`service/src/adapters/git.ts`, `run`). Lo síncrono era la huella
del contenido de `diff()`: `readFileSync` + sha256 de cada archivo sin seguir y de cada cambio solo en el árbol de
trabajo. Medido con tres `.uasset` binarios: 200 MB → el bucle de eventos se paraba 138 ms por archivo; 400 MB →
299 ms (y un archivo de más de 2 GiB ni se podía leer). Arreglado en `e390a0a` (hash por streaming, `fileHash`).

Pendiente, sin arreglo acotado en este hito:

- `diff()` sigue acumulando la salida de git en cadenas (`run`, `stdout+=chunk`) y luego parte el patch con una regex
  y filtra binarios con `binary.some(...)` por bloque (`git.ts`, `diff`, línea del `patch.split`): con miles de
  archivos es trabajo síncrono O(bloques × binarios). No se midió como causa de los 40 s.
- Un archivo de texto enorme sin seguir revienta el diff con `RangeError: Invalid string length` (visto al medir con
  un archivo sin bytes nulos de 200 MB ×3): `git diff --no-index` de ese archivo no cabe en una cadena.
- `node:sqlite` es síncrono: cualquier consulta lenta del runner bloquea las peticiones HTTP mientras dura.
