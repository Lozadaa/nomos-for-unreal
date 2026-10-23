---
name: ue-umg-ui
description: 'Construye o corrige HUD y menús UMG de Unreal 5 desde un worker sin GUI: elige la vía que funciona (C++ o diseñador), conecta el HUD al estado del juego, define foco y mando y deja la pantalla lista para las capturas de Kratos a 1280×720 y 1920×1080. Triggers: "HUD", "widget", "UMG", "menú", "barra de vida", tarea ui en Kratos. No usar para decidir el estilo (game-ui-art-director) ni para aprobar capturas (ue-visual-qa).'
license: MIT
metadata:
  version: 0.1.0
---

# HUD y menús UMG

Eres el worker de UI. Construyes la pantalla, la conectas al juego y la dejas comprobable.
La aprobación visual no es tuya: Kratos captura la pantalla y un run de QA con `ue-visual-qa`
la revisa. Termina con `KRATOS_DONE` cuando el código compila y el widget aparece al jugar.

## 1. Antes de tocar nada

1. Lee `ui-direction.md` en la carpeta `docs` del juego (tipografía, paleta, estados, foco).
   Si no existe, pídelo con `KRATOS_ASK`: la primera pantalla espera a `game-ui-art-director`.
2. Identifica la versión del motor (`.uproject` → `EngineAssociation`), si el proyecto tiene
   `Source/` (C++) o es solo Blueprint, los widgets existentes (`Content/UI`, `WBP_*`) y cómo
   entra el input (Enhanced Input o teclas directas).
3. Elige la vía con la tabla de abajo y dilo en la primera línea de tu respuesta.

| Vía | Cuándo | Comprobado en UE 5.8.3 |
|---|---|---|
| C++: `UUserWidget` que construye su árbol en código | Worker sin GUI, proyecto con `Source/` o que puede tenerlo | Vía prevista; se comprueba en la aceptación del hito 5 |
| C++ base con `meta=(BindWidget)` + `WBP_` hijo | Un humano diseña el WBP en el editor | Compila; el diseño lo hace el humano |
| Python del editor | Crear o compilar un `WBP_` vacío | Crea y compila, **no** puede añadir widgets: `WidgetBlueprint.widget_tree` no está expuesto |
| MCP del editor (AllToolsets) | Solo si Kratos lo activa (`editorMcp.enabled`) | Experimental; apagado por defecto |

Plantilla de la vía C++ (widget, controlador, `Build.cs`): [references/hud-cpp.md](references/hud-cpp.md).

## 2. Construir

- Un widget por pantalla; nombres `WBP_<Pantalla>` para assets y `U<Juego><Pantalla>Widget` en C++.
- Aplica los tokens de `ui-direction.md`: tamaños a 1080p, márgenes seguros, anclajes a
  esquinas para el HUD y centro para menús. Nada de colores sueltos fuera de la dirección.
- Conecta los datos al estado real (vida del pawn, munición del arma), no a valores fijos. El
  HUD se crea una sola vez por jugador (`BeginPlay` del controlador) y se destruye al salir.
- Menús: foco inicial explícito (`SetUserFocus`/`SetKeyboardFocus`), volver con B/Esc,
  `SetInputMode` correcto al abrir y cerrar, cursor solo donde hace falta.
- Escalado: deja la curva DPI del proyecto por defecto salvo que la dirección diga otra cosa;
  comprueba que nada se sale a 1280×720.

## 3. Comprobar antes de KRATOS_DONE

1. Compila: `Build.bat <Juego>Editor Win64 Development -Project=<uproject> -WaitMutex`.
2. El widget está en el viewport al jugar: Kratos lo detecta listando `UserWidget` con
   `IsInViewport()`; un widget que se crea tarde o fuera del viewport hace fallar la captura.
3. Valores extremos: vida 0, máxima y negativa; texto largo en botones; las dos resoluciones.
4. Recorre el menú con teclado y, si el juego lo declara, con mando.

Cómo captura Kratos y qué necesita de tu widget: [references/capturas.md](references/capturas.md).

## 4. Entregar

`KRATOS_DONE {"summary": "...", "commits": [...], "tests": "passed|failed|none"}` con: widgets
y clases tocados, vía usada, cómo se prueba (tecla, mapa), resoluciones y entradas recorridas y
límites conocidos. No declares aprobada la UI: eso lo decide el run de QA visual.

## Problemas frecuentes

- `LNK2019` con widgets: falta `UMG` en `Build.cs`.
- La captura sale sin UI: el widget no está en el viewport al arrancar o el GameMode no es el tuyo.
- Python no añade widgets a un `WBP_`: es una limitación del motor, usa la vía C++.

## Recursos

- [references/hud-cpp.md](references/hud-cpp.md): widget, controlador y `Build.cs` en C++.
- [references/capturas.md](references/capturas.md): cómo captura Kratos y qué necesita tu widget.
- [evals/evals.json](evals/evals.json): casos de evaluación.
