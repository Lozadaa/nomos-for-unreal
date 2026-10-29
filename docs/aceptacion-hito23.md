# Aceptación del hito 23 en KratosFabTest

Fecha: 2026-10-29, 05:23-05:25 UTC. Proyecto `C:\Users\richa\Documents\Unreal Projects\KratosFabTest`, datos nuevos
`--data .nomos-hito23`, puerto 57145, sin `config.json`. CLI del worktree `hito23-legible`. Los servicios de los puertos
8780 y 8781 no se tocaron.

## Tarea 3 · graphify y ponytail en el juego

| Paso | Resultado |
|---|---|
| `nomos doctor --data .nomos-hito23` | `graphify  OK  C:\Users\richa\.local\bin\graphify.exe` · `ponytail  OK  Plugin activo en ~/.claude/settings.json` |
| Primer `nomos start` (05:23:08) | `graph.update` encolado y `done` en 0,5 s **sin** `graphify-out/`: el CLI parte la ruta con espacios (`path not found: C:\Users\richa\Documents\Unreal`) y sale con 0 |
| Corrección | El servicio lanza `graphify . --no-viz --code-only` con el juego como carpeta de trabajo y falla si no aparece `graph.json`; la prueba usa ahora una carpeta con espacio |
| `nomos stop` + `nomos start` (05:24:01) | `graph.update` `done` en 1,6 s; `graphify-out/graph.json` con 80 nodos y 91 aristas, todo de `Source/` |
| `.gitignore` del juego | Añade `graphify-out/` y `.graphifyignore` junto a lo que ya había (`.kratos/`, `.nomos-*`) |
| `.graphifyignore` | Solo `Source/`, `Config/`, `docs/` y `Content/**/*.{json,ini,md}`; nunca `.uasset`/`.umap` |
| `graphify query "qué hace el personaje"` | Responde «No matching nodes found.»: el juego no tiene ninguna clase de personaje y el grafo casa por nombres del código |
| `graphify query "qué hace KratosPlayerController"` | 9 nodos (`KratosPlayerController.h/.cpp`, `UKratosVidaWidget`, `KratosGameMode.cpp`…) |
| `graphify query "Herir vida"` | 47 nodos (`AKratosPlayerController::Herir()`, `KratosVida::TrasHerir()`, `KratosVidaWidget`…) |
| `nomos stop --data .nomos-hito23` | `DETENIDO`; ningún proceso `node` con `hito23-legible` en la línea de órdenes |

## Pruebas automáticas

| Suite | Resultado |
|---|---|
| `npm test` | 751/751 |
| `npm run test:panel` | 346/346 |
| `npm run build` | OK |
| e2e `legible.spec.ts` (chromium y firefox) | 4/4; capturas `docs/capturas-23/ficha-1366.png` y `ficha-1920.png` |
| e2e completa | 137 pasan; las 6 de `chat-en-vivo` «sin scroll horizontal» se adaptaron (abren «Mostrar todo» y «Detalle técnico») y pasan 6/6 |

## Límites

| Qué | Por qué |
|---|---|
| `--code-only` | Sin clave de API de un LLM, graphify se niega a extraer documentos (`.md`, `.ini`): el grafo es solo el AST de `Source/` |
| `--update` tras integrar | Cubierto por la cola (`queueGraph` en `integrate.ts`, una sola `graph.update` en cola o en marcha); no se integró ninguna tarea real |
| `graphify: {"enabled": false}` | Probado en `tests/service/graph.test.ts`, no en el juego |
