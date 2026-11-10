# Checkpoint jam-web (2026-11-10, parado a petición del usuario)

## Parte 1 · Build web: HECHA y verificada (commit b821e27 en `jam-web`)

- Funciona con el **motor del Launcher** (no hace falta compilar el motor). Requisitos: proyecto C++ y emscripten
  6.0.10 (`Engine/Platforms/Wasm/Config/Wasm_SDK.json`). El «requires a source build» del anuncio vale para Mac/Linux.
- TrompoLab Development: 6 min 4 s, 282 MB en disco, 72,8 MB de descarga, READY 3,4 s, tier mobile deferred,
  ~170 fps (10 317 fotogramas en 60 s, VSync off), 0 errores WebGPU. Shipping: 15 min 20 s (wasm-opt), 203 MB en
  disco, 55,4 MB de descarga, READY 5,2 s, `check_stage.py` pasa.
- Funciona: materiales, sombras, física, HUD UMG con fuentes TTF propias, audio WebAudio. Modo demo con
  `?args=-TrompoAuto` (Development): «victoria a los 42,4 s». Se rompe: el cielo (SkyAtmosphere sin malla `IsSky`
  en el renderer móvil; aviso rojo en Development). El Chrome del usuario no da adaptador WebGPU («Trompo can't run
  on this GPU»); el Chromium de Playwright y el navegador integrado sí.
- Cambios en Nomos: `plantillas/semilla/Scripts/empaquetar-web.ps1`, flag `-SemillaAuto` en
  `SemillaPlayerController.cpp`, `EmpaquetadoWeb/` en `.gitignore` de la semilla, `skills/ue-oficio/references/web.md`,
  fila en `camino-corto.md`, índice en `SKILL.md`, corrección en `ue59-preview.md`. Capturas:
  `docs/investigacion/web-trompo-1080.png`.
- `npm test` en `jam-web` tras la Parte 1: 925/925. **Sin merge a `main`** (pendiente).
- Error visto y ya corregido en el script: `-archive` no borra el `.wasm` de otra configuración y `webrun` falla con
  «the stage holds binaries of Development, Shipping». El script ahora borra `EmpaquetadoWeb/Wasm` antes.

## Parte 2 · MCP 5.9 con el editor abierto: probado, SIN escribir `mcp-59.md`

Observado con `UnrealEditor.exe` con ventana, TrompoLab con
`{ "Name": "AllToolsets", "Enabled": true, "TargetAllowList": ["Editor"], "PlatformDenyList": ["Wasm"] }`:

- Arranca solo con el editor (29 s hasta responder). Streamable HTTP en `http://127.0.0.1:8000/mcp`, sesión por
  cabecera `mcp-session-id`. Log: `LogModelContextProtocol: Tool search enabled: registered 4 meta-tools (25 toolsets…)`.
- `tools/list` da 4 meta-herramientas (`list_toolsets`, `describe_toolsets`, `describe_tools`, `call_tool`).
  `list_toolsets`: ~100 toolsets, respuesta de 35,7 KB. `describe_toolsets` de 9 toolsets: 41,8 KB.
- Probado y funciona: `LevelToolset.FindActors` (16 actores, 27,5 KB), `AddToSceneFromClass` (PointLight),
  `ActorToolset.SetActorTransform` / `GetActorTransform`, `ObjectToolset.GetProperties` (Intensity 8),
  **`PythonScriptingTools.execute_python`** (Python completo con `unreal`, sin sandbox; devuelve la última expresión,
  `print` va al log), `SceneCaptureToolset.CaptureActiveEditorView` (PNG 640×360, 307 KB de respuesta, 1,4 s),
  `CaptureGameViewport` en PIE (PNG 960 px, 467 KB; no salió el HUD), `StartPIE` (2-6 s), `StopPIE`,
  `ConsoleToolset.RunConsoleCommand` (13 ms), `LiveCodingToolset.IsLiveCodingReady` / `CompileLiveCoding`
  («NoChanges», 2,4 s), `RemoveFromScene`, `ExitEditor` (se niega con cambios sin guardar salvo
  `bDiscardUnsavedChanges`).
- Latencia: casi todas las llamadas tardan **~330 ms** fijos (también `describe_tools`), salvo `RunConsoleCommand`
  13 ms. Hipótesis sin confirmar: el editor en segundo plano va a ~3 fps. No pude apagarlo: `EditorPerformanceSettings`
  no expone `throttle_cpu_when_not_foreground` a Python ni a `SetProperties`.
- Errores vistos: `ListModes` y `CaptureGameViewport` exigen todos los parámetros («input params are required…»);
  `SetProperties` usa `values`, no `properties`.
- Comparación Nomos: `nomos ue py` (editor caliente `-RenderOffscreen`): arranque 61 s, luego 2,3 s / 0,95 s / 0,71 s
  por script (script en sí 2-3 ms). El MCP: 0,33 s por llamada con el editor ya abierto.
- Comprobado de paso: `.mcp.json` que genera el editor (según la doc):
  `{"mcpServers":{"unreal-mcp":{"type":"http","url":"http://127.0.0.1:8000/mcp"}}}`; equivalente
  `claude mcp add --transport http unreal-mcp http://127.0.0.1:8000/mcp`. No se tocó la config de Claude Code.

### A medias (punto exacto)

1. **Sin probar:** si el MCP escucha en el editor caliente `-RenderOffscreen` (el editor estaba abierto por
   `nomos ue py` y se cerró al parar, antes de sondear el puerto 8000).
2. **Sin escribir:** `docs/investigacion/mcp-59.md` (conclusión y recomendación) ni la sección [observado] de
   `ue59-preview.md`. Nota a corregir: `python-ue58.md` dice que el MCP no tiene el módulo `unreal`; en 5.9
   `execute_python` sí lo tiene.
3. **Sin hacer:** merge a `main` y `npm test` final tras el wip.
4. **Sin comprobar:** que el cook Wasm aguante `AllToolsets` con `PlatformDenyList: ["Wasm"]` (la skill del motor dice
   que los toolsets rompen un cook web).

### Retomar

```powershell
# MCP en el editor caliente (sin ventana)
cd "C:\Users\richa\Documents\Unreal Projects\TrompoLab"
node C:\Users\richa\Documents\nomos-wt\jam-web\service\src\cli.ts ue py <script.py> --proyecto Trompo.uproject --data <tmp>
node <scratchpad>\mcp.mjs <calls.json>      # cliente JSON-RPC; MCP_URL=http://127.0.0.1:8000/mcp
node C:\Users\richa\Documents\nomos-wt\jam-web\service\src\cli.ts ue parar --proyecto Trompo.uproject --data <tmp>
# Editor con ventana
& "C:\Program Files\Epic Games\UE_5.9\Engine\Binaries\Win64\UnrealEditor.exe" "C:\Users\richa\Documents\Unreal Projects\TrompoLab\Trompo.uproject" -log=McpLab.log
# Web
pwsh -File "C:\Users\richa\Documents\Unreal Projects\TrompoLab\Scripts\empaquetar-web.ps1" -Config Development -Servir
# Cerrar: merge
cd C:\Users\richa\Documents\nomos-wt\jam-web; npm test
cd C:\Users\richa\Documents\nomos; git merge --no-ff jam-web
```

El cliente `mcp.mjs` vive en el scratchpad de la sesión (no en el repo); son 35 líneas: POST JSON-RPC con
`accept: application/json, text/event-stream`, guarda `mcp-session-id`, `initialize` + `notifications/initialized`.

## Disco y cosas fuera del proyecto

- `TrompoLab`: 4,12 GB (Binaries/Intermediate/DDC de Win64 y Wasm + `EmpaquetadoWeb` Shipping de 203 MB).
- **Fuera del proyecto:** emsdk 6.0.10 en `C:\Users\richa\emsdk` (2,0 GB; clonado de github.com/emscripten-core/emsdk,
  `emsdk activate` sin `--permanent`, sin variables de entorno del sistema). Se borra con quitar esa carpeta.
- Libres en C: 29,3 GB (antes 37).
- Nada abierto: ni editores, ni `serve.py`, ni `webrun`, ni sesiones MCP.
