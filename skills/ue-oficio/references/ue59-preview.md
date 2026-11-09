# UE 5.9 MegaJam Preview: qué cambia para Nomos

Estado a 2026-11-09. Nomos sigue **probado en UE 5.8.3** (`C:\Program Files\Epic Games\UE_5.8`): nada de lo marcado
**[probado]** en esta skill se ha vuelto a probar en 5.9. Marcas de este documento: **[fuente]** leído en el anuncio o
en las notas oficiales (URL al final); **[observado]** visto en este equipo; **[sin confirmar en 5.9]** no aparece en
ninguna fuente oficial, se supone igual que en 5.8 hasta que Epic lo diga.

## Qué es y cómo tratarlo

- Preview publicado el 2026-11-09 para el Epic AI MegaJam (12 a 15 de noviembre de 2026). Epic: «Preview releases are
  not fully quality-tested … and should be considered as unstable until the final release», y recomienda probar en
  **una copia del proyecto, no convertirlo**. La 5.9 final llega «next year». [fuente: anuncio]
- Es, según Epic, «the first Unreal Engine release built primarily with agentic workflows». [fuente: anuncio]
- Descarga: Epic Games Launcher, GitHub (tag `5.9.0-preview-1`, solo con cuenta de Epic enlazada; sin ella da 404) o
  Linux. [fuente: anuncio] En este equipo el Launcher instala en `C:\Program Files\Epic Games\UE_5.9` (carpeta creada
  el 2026-11-09 a las 12:28; descarga en curso: solo `.egstore`, aún sin `Engine/Build/Build.version`). [observado]

## Usarlo con Nomos

- La ruta por defecto de Nomos sigue siendo `UE_5.8` (`defaultUnrealCmd`); no se cambia a un preview. Para probar 5.9
  en una copia del juego: `.nomos/config.json` →
  `"unrealPath": "C:\\Program Files\\Epic Games\\UE_5.9\\Engine\\Binaries\\Win64\\UnrealEditor-Cmd.exe"` y en el
  `.uproject` de la copia `"EngineAssociation": "5.9"`. `nomos doctor` debe decir «Unreal Engine 5.9.0» (lo lee de
  `Engine/Build/Build.version`) y los `TestRun` saldrán con `engineVersion` 5.9.0: las evidencias de 5.8.3 no valen
  para afirmar nada de 5.9.
- La capacidad `unreal_mcp` busca `Engine/Plugins/Experimental/ModelContextProtocol/…` y
  `Experimental/Toolsets/AllToolsets/…`; si 5.9 mueve esas carpetas saldrá «ausente» aunque estén. [sin confirmar en 5.9:
  comprobar cuando termine la descarga]
- `editor.mcp_start` arranca `UnrealEditor.exe … -ExecCmds="ModelContextProtocol.StartServer"`. En 5.9 «Unreal MCP
  launches automatically with the editor» [fuente: anuncio]; si el comando sigue existiendo, [sin confirmar en 5.9].
- Las flags que usa Nomos (`-ExecutePythonScript`, `-NullRHI`, `-game -windowed -ResX -ResY -ForceRes`, `-stdout
  -FullStdOutLogOutput`, `Build.bat`) no aparecen en ninguna nota de cambios: [sin confirmar en 5.9].

## Python del editor

Todo lo de esta sección sale de las notas y del anuncio [fuente].

- APIs ampliadas: «audio, MetaSounds, modeling, physics, Niagara, materials, PCG, networking, and UI». Las limitaciones
  de [fastvfx](../../nomos/references/fastvfx.md) (`set_material_instance_*_parameter_value` devuelve False;
  `ExposedParameters` de Niagara no visible) son de 5.8: volver a probarlas en 5.9, [sin confirmar en 5.9].
- «The ability to manage extra Python search paths».
- Librerías nuevas de Blueprint y Python para editar Blueprints (grafos, nodos, variables), chooser tables, StateTrees
  y grafos de Dataflow. Lo que [ue-umg-ui](../../ue-umg-ui/SKILL.md) dice de que Python no puede añadir widgets
  (`WidgetBlueprint.widget_tree` no expuesto) es de 5.8.3: [sin confirmar en 5.9].
- «The old Python Foundation Packages plugin was removed». Nomos no lo usa (ningún script importa numpy ni PySide);
  un script de worker que dependa de él falla en 5.9.
- Slate Qt Bridge: widgets PySide6 dentro del editor. Sin uso en Nomos (workers sin GUI).
- Problema conocido UE-411502: «Python Blueprint root swaps can crash the editor». Apaño de Epic: una clase base C++
  que posea el root component en vez de cambiar roots añadidos en Blueprint.
- La referencia web de la API de Python con `?application_version=5.9` da 404 (2026-11-09); sigue valiendo lo de
  [python-ue58](python-ue58.md#documentación). [observado]

## Unreal MCP y Unreal Assistant (experimentales)

Todo lo de esta sección sale de las notas y del anuncio [fuente].

- El servidor arranca con el editor; toolsets ampliados a «rendering, source control, profiling, debugging, gameplay
  testing, geometry, audio, UI, and level creation»; integración con Lore (control de versiones) y toolset de Fab
  (buscar, ver la biblioteca e instalar assets en el proyecto).
- Editor Preferences nuevas: puerto, orígenes permitidos y versión máxima del protocolo; página de ajustes de proyecto
  «Model Context Protocol»; Toolset Registry decide qué toolsets puede usar un agente; toolset «MCP Client» para
  servidores externos; Knowledge Base (estado vivo del motor o markdown en disco).
- **Problema conocido UE-412135**: en proyectos nuevos el servidor MCP está encendido pero los plugins de toolsets
  (`AllToolsets`, `EditorToolset`, `BlueprintToolsets`, `ConsoleToolset`, `LiveCodingToolset`) están apagados, así que
  `list_toolsets` no ofrece herramientas de actores, nivel, assets, Blueprint ni Python «and nothing tells the agent
  why». Apaño de Epic, una vez por proyecto: activar All Toolsets en Edit > Plugins o añadir al `.uproject`
  `{ "Name": "AllToolsets", "Enabled": true, "TargetAllowList": [ "Editor" ] }` y reiniciar el editor.
- Unreal Assistant: panel en el editor para Claude Code, Codex, Cursor u OpenCode, con niveles de acceso Ask, Read,
  Edit, Auto y Full y traspaso a un agente externo por comando.
- Nomos sigue sin usar el MCP de Epic ([por qué](python-ue58.md#por-qué-nomos-no-usa-el-mcp-de-epic)); los motivos
  (sandbox sin `unreal`, un cliente por máquina) se observaron en 5.8 y en 5.9 quedan [sin confirmar].

## PCG

De las notas de la versión [fuente].

- Nodo nuevo Concave Hull; funciones para añadir y validar aristas de grafo desde script; Blueprints pueden leer y
  escribir el HLSL de nodos personalizados; Mesh Partition con simplificación y proxy de trazado de rayos.
- Voronoi: no se anuncia; sigue lo de [pcg](pcg.md). [sin confirmar en 5.9]

## Otros cambios que pueden tocar a un worker

De las notas de la versión [fuente].

- Animación: framework ampliado; los nodos antiguos de Control Rig quedan deprecados en favor de versiones por
  referencia de asset.
- StateTrees editables desde Blueprint o Python; plugin Mass Characters; navmesh progresivo (tiles por tick).
- Editor: subsistema Map Check (log en Blueprint, sustituir actores por asset o clase), Sequencer con «marks and mark
  ranges», Forge (herramientas web de diseño dentro del editor), Modular Test Framework para tests de plugins, GraphDsl
  (lenguaje de texto para grafos).
- Target WebAssembly/WebGPU experimental: exige build desde fuente y proyecto C++ [fuente: anuncio]; no afecta a Nomos.

## Sin confirmar en 5.9 (ninguna fuente oficial lo menciona)

| Tema | Qué hay |
|---|---|
| MetaHuman | Nada en el anuncio ni en las notas. [personajes](../../nomos/references/personajes.md) y `nomos_metahuman.py` siguen siendo de 5.8.3. |
| Visual Studio y toolchain | La tabla oficial no tiene fila 5.9. Fila 5.8: VS 2022 17.14 o posterior, VS 2026 18.0 o posterior; MSVC 14.38 mín. / 14.50 rec.; Windows SDK 10.0.22621.0 mín. / 10.0.26100 rec.; .NET 10 con VS 2026. Suponer lo de 5.8. [fuente: página de VS] |
| UBT, UAT, UnrealEditor-Cmd | Ningún cambio de flags publicado. |
| Formato de `.uproject` | Sin cambios anunciados; el anuncio solo pide ediciones puntuales (`AllToolsets`, quitar `Wasm` de `PlatformDenyList`). |
| Plugins renombrados o retirados | Retirado: Python Foundation Packages. Renombrados: ninguno anunciado. |
| Verse, UEFN, Scene Graph | Nada en las fuentes oficiales; lo que circula en redes sobre Verse + Scene Graph no está confirmado. |
| Ruta de crashes | `%LOCALAPPDATA%\UnrealEngine\5.9\Saved\Crashes` es la pauta de 5.8 con el número cambiado. |

## Pendiente

1. Al terminar la descarga: anotar aquí `Engine/Build/Build.version` real y la carpeta de los plugins MCP/Toolsets.
2. `nomos doctor` con `unrealPath` de 5.9 en una copia del juego de ejemplo; después, repetir las recetas del harness
   ([recetas](../../nomos/references/recetas.md)) y las limitaciones de Python marcadas arriba.
3. Cuando salga la 5.9 final: quitar los «sin confirmar» con las notas definitivas y decidir si `defaultUnrealCmd`
   pasa a `UE_5.9`.

## Fuentes

- Anuncio: https://forums.unrealengine.com/t/unreal-engine-5-9-megajam-preview/2852840
- Notas de la versión 5.9: https://dev.epicgames.com/documentation/unreal-engine/unreal-engine-5-9-release-notes
- Visual Studio por versión del motor: https://dev.epicgames.com/documentation/en-us/unreal-engine/setting-up-visual-studio-development-environment-for-cplusplus-projects-in-unreal-engine
- Requisitos de hardware y software: https://dev.epicgames.com/documentation/en-us/unreal-engine/hardware-and-software-specifications-for-unreal-engine
- Unreal MCP en el editor (documentación de 5.8, aún sin versión 5.9): https://dev.epicgames.com/documentation/unreal-engine/unreal-mcp-in-unreal-editor
- Release en GitHub (cuenta enlazada): https://github.com/EpicGames/UnrealEngine/releases/tag/5.9.0-preview-1
