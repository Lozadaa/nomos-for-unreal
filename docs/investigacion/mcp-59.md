# MCP de Unreal 5.9 con el editor abierto (TrompoLab, 2026-11-10)

Probado en el UE 5.9 MegaJam Preview del Launcher (5.9.0-60351404), Windows 11, RTX 5060, con un cliente JSON-RPC
propio (Node, `fetch`). Todo lo de aquí es **[observado]** salvo lo marcado.

## Cómo se conecta

- El plugin `ModelContextProtocol` viene activo y **arranca solo con el editor**. No hace falta
  `ModelContextProtocol.StartServer`. Responde a los 29 s con ventana y a los 39 s con `-RenderOffscreen`.
- Escucha en **`http://127.0.0.1:8000/mcp`** (Streamable HTTP; SSE también según la doc; sin stdio). Solo loopback,
  sin autenticación. La sesión va en la cabecera `mcp-session-id` que devuelve `initialize`.
- Otro editor a la vez: `-ModelContextProtocolPort=<puerto>` [fuente: doc de Epic; no probado].
- Apaño UE-412135 (sin él `list_toolsets` no ofrece actores, nivel ni Python). En el `.uproject`:
  `{ "Name": "AllToolsets", "Enabled": true, "TargetAllowList": [ "Editor" ] }`. Requiere recompilar el editor del
  proyecto (6 s con `Scripts/compilar.ps1`). Con eso el log dice
  `LogModelContextProtocol: Tool search enabled: registered 4 meta-tools (25 toolsets discoverable…)`.

Para usarlo desde Claude Code (no he tocado tu configuración), con el editor de ese proyecto abierto:

```
claude mcp add --transport http unreal-mcp http://127.0.0.1:8000/mcp
```

O, solo para un proyecto, un `.mcp.json` en su raíz (es lo que escribe `ModelContextProtocol.GenerateClientConfig
ClaudeCode` en un motor instalado [fuente]):

```json
{ "mcpServers": { "unreal-mcp": { "type": "http", "url": "http://127.0.0.1:8000/mcp" } } }
```

## Qué hay

`tools/list` devuelve solo 4 meta-herramientas: `list_toolsets`, `describe_toolsets`, `describe_tools` y
`call_tool`. Ocupan 3 KB. Detrás hay unos 100 toolsets. Los útiles para Nomos:

| Toolset | Herramientas probadas | Resultado |
|---|---|---|
| `EditorToolset.LevelToolset` | `FindActors`, `GetCurrentLevel`, `AddToSceneFromClass`, `RemoveFromScene` | funcionan |
| `EditorToolset.ActorToolset` | `SetActorTransform`, `GetActorTransform` | funcionan |
| `EditorToolset.ObjectToolset` | `GetProperties` (Intensity de una luz) | funciona. `SetProperties` usa `values`, no `properties`, y no edita CDOs nativos |
| `editor_toolset…PythonScriptingTools` | `execute_python` | funciona. **Python completo con `unreal`, sin sandbox**. Devuelve la última expresión; `print` va al log |
| `SceneCaptureToolset` | `CaptureActiveEditorView`, `ListWorlds`, `ListViews`, `CaptureGameViewport` | funcionan. PNG en base64 dentro de la respuesta |
| `EditorToolset.EditorAppToolset` | `StartPIE`, `StopPIE`, `ExitEditor` | funcionan. `ExitEditor` se niega si hay cambios sin guardar, salvo con `bDiscardUnsavedChanges` |
| `ConsoleToolset` | `RunConsoleCommand` | funciona. Rechaza `py …` |
| `LiveCodingToolset` | `IsLiveCodingReady`, `CompileLiveCoding` | funcionan («NoChanges», 2,4 s) |

También hay toolsets de Blueprint (incluido un DSL), UMG, materiales, Niagara, PCG, MetaSound, Sequencer, StateTree,
GAS, NavMesh, Perf, Slate Inspector y AutomationTest. Esos no los he probado.

Trampas: `ListModes` y `CaptureGameViewport` exigen todos sus parámetros (`bIncludeUnavailable`; `world` y
`maxResolution`). Si faltan, la respuesta trae el esquema entero.

## Latencias (milisegundos, una llamada tras otra)

| Llamada | Editor con ventana, en segundo plano | Editor `-RenderOffscreen` |
|---|---|---|
| `list_toolsets` | 335 | 8 |
| `FindActors` (16 actores) | 346 | 16 |
| `GetCurrentLevel` | 332 | 4 |
| `execute_python` (contar actores) | 333 | 26 |
| `RunConsoleCommand` | 13 | 16 |
| `CaptureActiveEditorView` 640×360 | 1 409 | 126 |
| `StartPIE` | 2 100-6 400 | 2 529 |
| `CaptureGameViewport` en PIE, 960 px | 407 | 76 |

- **Con ventana**, casi todo tarda unos 330 ms fijos: el editor fuera de foco va a unos 3 fps y la respuesta espera a
  su tick. `RunConsoleCommand`, que responde sin esperar, tarda 13 ms. Python no puede apagar ese freno:
  `EditorPerformanceSettings` no expone la propiedad.
- **Sin ventana (`-RenderOffscreen`)** no hay ese freno: de 4 a 26 ms. La captura de PIE incluye el **HUD de UMG**
  (`docs/investigacion/mcp-pie-offscreen.png`); en la captura con ventana no salió.
- **Nomos hoy** (`nomos ue py`, editor caliente `UnrealEditor-Cmd -RenderOffscreen` con cola por archivos): 61 s de
  arranque y luego 2,3 s, 0,95 s y 0,71 s por script. El script en sí tarda 2-3 ms; el resto es la cola por archivos.
  El MCP sin ventana hace lo mismo (`execute_python`) **entre 30 y 90 veces más rápido**.

## Contexto que gasta

| Respuesta | Bytes | Tokens aprox. |
|---|---|---|
| `tools/list` | 3 107 | ~0,8 k |
| `list_toolsets` | 35 676 | ~9 k |
| `describe_toolsets` de 9 toolsets | 41 831 | ~10 k |
| `describe_tools` de 8 herramientas | ~12 000 | ~3 k |
| `FindActors` sin filtro, 16 actores | 27 515 | ~7 k (unos 1,7 KB por actor) |
| `execute_python` con un número | 206 | ~0,05 k |
| Captura 640×360 / 960×485 | 307 KB / 452 KB de JSON | imagen (Claude Code la ve como imagen, no como texto) |

El descubrimiento cuesta de 10 a 20 k tokens por sesión. `FindActors` en un nivel grande se dispara. Para leer el
mundo sale mucho más barato un `execute_python` que devuelve solo lo que pides.

## Mejor y peor que el camino de Nomos

**Mejor**
- Latencia: de 4 a 26 ms por llamada sin ventana, frente a 0,7-2,3 s de la cola por archivos.
- Python completo con `unreal`. En 5.9 ya no hay sandbox: la nota de `python-ue58.md` sobre el MCP era de 5.8.
- Capturas de PIE con UMG en 80 ms, sin el `-game` aparte ni el `Shot showui`.
- PIE, Live Coding y logs como herramientas.
- Sirve igual con el editor abierto por el usuario, con ventana.

**Peor**
- Un puerto por editor. Con varios worktrees hay que dar a cada uno `-ModelContextProtocolPort` (no probado). Si
  alguien se equivoca de puerto, escribe en el worktree equivocado: es el mismo riesgo que hizo descartar el Python
  remoto.
- Sin autenticación. Cualquier proceso local puede ejecutar Python en el editor.
- Con ventana y sin foco, 330 ms por llamada.
- Hay que recompilar el editor del proyecto tras activar `AllToolsets`.
- El descubrimiento gasta contexto.
- Es Experimental: Epic avisa de que la API y los formatos pueden cambiar.

## Recomendación: (b) usarlo solo para el trabajo interactivo con el editor del usuario; (c) proponer que el editor caliente de Nomos lo use como transporte

- **(b) Ya:** cuando el usuario tenga el editor abierto y quiera que un Claude Code mire o toque el nivel, que use el
  MCP con el comando de arriba. Que prefiera `execute_python` y `CaptureGameViewport` a recorrer toolsets.
- **(c) Propuesta para que decidas tú (no implementada):** el editor caliente de `nomos ue py` se lanzaría con
  `-ModelContextProtocolPort=<puerto propio por worktree>`, y `ue py` enviaría el script con
  `call_tool execute_python` en lugar de la cola de `Saved/NomosCaliente`, que queda como plan B si el puerto no
  responde. Las capturas de `ue` pasarían a `CaptureGameViewport`. Antes hay que probar que `UnrealEditor-Cmd` (el
  binario del editor caliente) también levanta el servidor; aquí solo lo probé con `UnrealEditor.exe`.

## No probado

- Si `UnrealEditor-Cmd` levanta el servidor, si funciona `-ModelContextProtocolPort` y si van dos editores a la vez.
- Si basta con `-nullrhi`: no hizo falta, `-RenderOffscreen` levantó el servidor. Sin RHI las capturas no deberían
  funcionar [sin confirmar].
- Los toolsets de Blueprint, UMG, materiales, Niagara y PCG.
- Live Coding con cambios reales.
