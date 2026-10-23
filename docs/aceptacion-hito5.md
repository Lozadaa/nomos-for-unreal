# Aceptación del hito 5 · Unreal, UI del juego y QA

Fecha: 2026-10-23. Rama `hito5-unreal`. Equipo: Windows 11, Unreal 5.8.3 (`C:\Program Files\Epic Games\UE_5.8`),
Orca 1.4.207, Claude Code 2.1.309 (workers Sonnet 5.5). **Ningún worker Codex** (`config.json`:
`{"concurrency":{"codex":0,"claude":2},"defaultProvider":"claude","editorMcp":{"enabled":false}}`).
Proyecto: `C:\Users\richa\Documents\Unreal Projects\KratosFabTest` con datos en `.kratos-hito5/` (puerto 8795).
Todo lo de este documento se ejecutó; lo que no se pudo ejecutar está en «Lo que no se verificó».

## 1. Petición real: «Añade un HUD con barra de vida que baje al pulsar H»

El director (yo, por CLI) dividió la petición en dos tareas de área `ui`, como pide el ciclo UMG:

```sh
K="node <kratos>/skills/kratos/scripts/kratos.ts"
$K start --data .kratos-hito5 --port 8795 --no-open        # ARRANCADO
$K skills install --data .kratos-hito5                      # 3 × installed en .claude/skills
$K task create --title 'Dirección de arte de la UI' --area ui --role ui --provider claude \
   --spec-file .kratos-hito5/specs/ui-direction.md --data .kratos-hito5      # A = db26ad39
$K task create --title 'HUD con barra de vida' --area ui --role ui --provider claude \
   --depends db26ad39-… --spec-file .kratos-hito5/specs/hud-vida.md --data .kratos-hito5   # B = 2e3d41ae
```

Secuencia observada (seq de eventos de `.kratos-hito5/kratos.db`):

| seq | Hora | Evento |
|---|---|---|
| 8 | 19:16:54 | B espera: «Depende de Dirección de arte de la UI (preparada)» |
| 10 | 19:16:55 | `run.started` A (Claude); skills confirmadas: game-ui-art-director, ue-ui-umg-slate, game-ui-design, ue-umg-ui, ux-writing, ue-visual-qa (falta `game-ui-ux`: no existe en el equipo) |
| 700 | 19:28:04 | `run.finished` A: `docs/ui-direction.md` (103 líneas, 9 tokens, 16 pares con contraste medido, mínimo 5,0:1), commit `b242d51` |
| 706 | 19:28:05 | `ui.cycle` de A → `{"skipped":"el diff no toca Unreal"}` |
| 757 | 19:29:06 | `review.finished` A aprobado (revisor Claude) |
| 762 | 19:29:07 | `run.started` B: el planificador la arranca sola al aprobarse A |
| 1026 | 19:33:10 | `run.finished` B: vía C++ (`UKratosHealthWidget`, `AKratosPlayerController` con H −10 %, `AKratosGameMode` en `DefaultEngine.ini`), commits `ae37f1d`, `3902a74`; el worker compiló con Build.bat |
| 1031-1034 | 19:33:11 | `ui.cycle` automático: `editor.busy` (qa · unreal), `test.running umg` |
| 1038 | 19:34:37 | `test.running umg`: «1280×720: UI visible (1,1 % de píxeles), widgets KratosHealthWidget · 1920×1080: UI visible (1,1 %)» |
| 1040-1045 | 19:34:37 | `editor.free`; `review.start` con `qa` → run revisor de QA visual (Claude) |
| 1099-1100 | 19:35:21 | `review.finished` QA aprobado → `test.passed umg` «QA visual aprobado» |
| 1160-1161 | 19:36:24 | `kratos task review` B aprobado → `probando` |
| 1165-1170 | 19:36:25 | `checks.run` automático: `cpp` passed («Compilación correcta», 2 s; ya estaba compilado) |
| 1177 | 19:38:32 | `build` passed: BuildCookRun + arranque 30 s + HighResShot (2 min 7 s) |
| 1181 | 19:38:32 | `task.moved` B `probando → integrando` «Pruebas en verde» |

`TestRun` de B (todos con commit `3902a74` y motor 5.8.3): `umg` passed (mapa
`/Engine/Maps/Templates/OpenWorld`, config `1280x720, 1920x1080`), `cpp` passed
(`Development Editor Win64`), `build` passed (`Development Win64`, `KratosFabTest.exe` y su captura).
El QA visual (run `b0e94d4d`) abrió las cuatro capturas, comparó cada una con su control, midió
contraste y escala (la placa pasa de ~265 px a ~399 px, 1,5× como la resolución) y marcó
«navegación con mando: no comprobado» porque la captura no lo muestra.

Capturas: `docs/capturas-5/unreal/hud-1280x720.png`, `hud-1280x720-control.png`, `hud-1920x1080.png`.
Lo que la captura no prueba (lo dijo el propio QA): que la vida baje al pulsar H. Eso lo cubre la
prueba de automatización del worker (`Source/KratosFabTest/Tests/KratosHealthTest.cpp`, commit `ae37f1d`);
no la ejecuté aparte.

## 2. Prueba 7: fallo forzado que vuelve al responsable

Tarea C `4c443009` «Menú de pausa» (oculto al arrancar, se abre con P), worker Claude:

| seq | Evento |
|---|---|
| 1225 | `worker.waiting`: «Falta docs/ui-direction.md… ¿Puede Kratos generar antes esa dirección?» (la skill `ue-umg-ui` lo exige) → el director responde con la ruta de la dirección aprobada |
| 1715 | `run.finished` C |
| 1725 | `test.failed umg`: «1280×720: la captura no contiene la UI (difiere un 0,00 % de la captura sin widgets) · Widgets en el viewport: KratosPauseMenuWidget» |
| 1730 | `task.moved` C `revisando → implementando` «Falló umg» |
| 1736 | `worker.message_sent`: corrección `checks.correction:<run>` con la ruta del log y el resumen |

Es el caso del Review Focus 2: el widget está en el viewport pero oculto, y la comparación con la
captura de control lo detecta. Después detuve el worker C (`worker stop`): la prueba estaba cumplida.

Antes, sobre KratosFabTest sin HUD y desde `ui.cycle` real: «1280×720: la captura no contiene la
UI (0,00 %) · Widgets en el viewport: ninguno», con `editor.busy/free` (seq 6/11 de esa base).

## 3. Prueba 8: cada captura con su run y su revisión

`docs/capturas-5/entregas-5-{1366,1920}.png`: Entregas agrupada por tarea; cada captura muestra
«1280×720 · OpenWorld · run 66e1488» (run de pruebas que la tomó) y el informe de QA
(`review-b0e94d4d….json`) está junto a ellas. `docs/capturas-5/pruebas-5-{1366,1920}.png`: pestaña
Pruebas de B con UMG, C++ y Empaquetado en verde, commit `3902a74`, motor 5.8.3 y enlaces a log,
capturas y ejecutable. `capacidades-5-{1366,1920}.png`: editor de KratosFabTest «Libre».

## 4. Prueba 29: dos MCP de Unreal

Con `.mcp.json` temporal (`unreal-epic`, `UnrealMCP-community`, `figma`) en KratosFabTest,
`GET /capabilities` devolvió
`{"id":"unreal_mcp_conflict","state":"roto","detail":"2 servidores MCP de Unreal: unreal-epic, UnrealMCP-community. Deja uno solo"}`;
tras borrar el archivo, la capacidad desaparece. `GET /editors` → `[{"project":"KratosFabTest","busy":null}]`.

## 5. C++ real con éxito y con error

Proyecto C++ temporal `KratosCpp` (`.uproject` con módulo, Target.cs, Build.cs y un `.cpp`), por
`checks.run` real:

- Éxito: 42,5 s, `Result: Succeeded` (7 pasos, UBA 30,25 s), `TestRun cpp passed 5.8.3 Development Editor Win64`.
- Error (`return VariableQueNoExiste + OtraQueTampoco;`): 2,6 s, `cpp failed`; el evento `test.failed`
  lleva las dos líneas `error C2065` (máximo 30) y el log completo queda en
  `artifacts/tests/<id>/log.txt`; el implementador recibe `worker.send` con esa ruta.

## 6. Mapa, Data Validation y captura

`checks.run` real con `Content/AdvancedCelShader/Maps/Sample.umap`: `kratos_validate.py` (Data
Validation, `is_asset_valid` con `DataValidationUsecase.SCRIPT`) válido, juego 1280×720 con captura,
49,7 s, `TestRun map passed`, la tarea pasó a `integrando`. Eventos 6 `editor.busy`, 7 `test.running`,
10 `test.passed`, 12 `editor.free`. Captura: `docs/capturas-5/unreal/mapa-sample-1280x720.png`.
Con paquetes inexistentes, `kratos_validate.py` y `kratos_compile_bp.py` informan «no existe o no está guardado».

## 7. PIE frente a `-game` (las dos vías, como pide el encargo)

1. **PIE por Python en el editor por lotes** (`UnrealEditor-Cmd -ExecutePythonScript`): el editor se
   cierra solo al volver el script (`UUnrealEdEngine::CloseEditor()` en el fotograma 3); PIE arranca
   y se destruye antes de capturar.
2. **PIE con `-ExecCmds="py …"`** (el editor sigue vivo y el script cierra al terminar): PIE funciona,
   pero `Shot showui` captura la ventana entera del editor (2560×1392), no el viewport del juego; el
   intento de forzar PIE en ventana flotante con `-ini:EditorPerProjectUserSettings` no cambió nada.
   `unreal.LevelEditorPlaySettings` no está expuesto a Python en 5.8.3.
3. **Alternativa del plan, adoptada**: `UnrealEditor-Cmd <uproject> <mapa> -game -windowed -ResX -ResY
   -ForceRes -ExecCmds="py kratos_pie_capture.py"`. Python funciona en `-game`, `WidgetLibrary`
   lista los widgets del viewport y `Shot showui` captura a la resolución pedida (1280×720 y
   1920×1080 comprobados). Con el juego pausado se toma la captura con UI y, ocultando los widgets,
   la de control en el mismo fotograma.

`take_high_res_screenshot`/`HighResShot` no incluye la UI; por eso las capturas de UI usan `Shot showui`.

## 8. MCP vivo (una vez, no es puerta)

Proyecto temporal `KratosMcp` con los plugins `ModelContextProtocol` y `AllToolsets` activados:
`UnrealEditor.exe KratosMcp.uproject -ExecCmds="ModelContextProtocol.StartServer,ModelContextProtocol.GenerateClientConfig ClaudeCode"`.
A los 16 s, `POST http://127.0.0.1:8000/mcp initialize` → 200 (protocolo 2025-06-18);
`tools/list` → 200 con 3 herramientas: `list_toolsets`, `describe_toolset`, `call_tool`.
`GenerateClientConfig ClaudeCode` escribió `.mcp.json` con `unreal-mcp` → `http://127.0.0.1:8000/mcp`.
El primer intento falló por mi script (ruta del ejecutable sin comillas). Kratos lo deja apagado
(`editorMcp.enabled: false`) y el proyecto necesita los dos plugins activados para que funcione.

## 9. Problemas encontrados en la aceptación y corregidos

| Problema | Corrección (commit) |
|---|---|
| La tarea de dirección de arte (área `ui`, solo docs) habría fallado `umg` | `ui.cycle` omite diffs sin Unreal (`8c006b2`) |
| Las skills de UI se instalan en el juego, pero los árboles de los workers salen de Git y no las tenían | `worker.start` las copia y las excluye en `info/exclude` (`1964518`) |
| Claude imprimió `KRATOS_DONE` sangrado bajo una lista con continuaciones de 4 espacios y no se leyó | `bulletContinuation` acepta ≥ 2 espacios, con prueba de las líneas reales (`925bd78`); el director pidió repetir la línea porque la pantalla ya leída no se reprocesa |

## 10. Lo que no se verificó o queda pendiente

- **Dos editores a la vez (Review Focus 4)**: cubierto por pruebas; en la aceptación no ocurrió porque
  el runner procesa una orden cada vez. Consecuencia observada: mientras `checks.run` empaquetaba
  (2 min), el arranque del worker C esperó (19:36:45 → 19:38:34). Con builds de 40 min, el resto de
  órdenes (polls incluidos) espera: es un límite del runner secuencial.
- **Dependencias**: B y C nacen de `master` sin el commit de A, así que su brief y el del QA no
  incluyen `docs/ui-direction.md`; el director les pasó la ruta. La integración es del hito 6.
- **Blueprint real**: KratosFabTest no tiene Blueprints en sus árboles de trabajo (Content no está en Git);
  `kratos_compile_bp.py` solo se probó con paquetes inexistentes y con el editor falso.
- **Assets (`asset`)**: solo con el editor falso en esta aceptación (el hito 4 verificó `verifyPack` real).
- **Pulsar H**: la captura no lo prueba; no ejecuté la prueba de automatización del worker.
- **Corrección de C**: no se persiguió; el worker se detuvo tras recibirla.

## 11. Revisión final independiente

Un revisor sin contexto previo encontró 1 crítico y 6 importantes, corregidos en `d9e6857` con una
prueba que falló antes de cada arreglo (`tests/service/checks-review-fixes.test.ts`): la fila
pendiente de `umg` del lote podía dejar una tarea en `probando` para siempre; la puerta exigía
comprobaciones que el diff ya no pide; los archivos borrados se validaban; una Decisión caducada
relanzaba el lote; el resumen perdía el titular del tiempo agotado; la ruta del script de captura
con espacios o comas rompía `-ExecCmds` (ahora llega por `KRATOS_SCRIPT`; captura real repetida,
36,6 s); y tras un reinicio una fila en curso quedaba colgada. Suite final: `npm test` 408/408,
Vitest 256/256, build verde, Playwright 61 pasadas y 3 omitidas.

