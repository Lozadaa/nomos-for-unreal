# Cuando Unreal se cae, se cuelga o va lento

## Crash

- **Lee el informe antes de relanzar: `nomos ue crash`** (mensaje, pila y 60 líneas del log desde el fallo). Busca en dos sitios: `%LOCALAPPDATA%\UnrealEngine\5.8\Saved\Crashes` y
  `<proyecto>\Saved\Crashes` (también el del worktree). La carpeta más reciente tiene `CrashContext.runtime-xml` con
  `<ErrorMessage>` y, si hay `.log`, la pila. Busca `Fatal error`, `Assertion failed` o `Critical error` y lee ~60
  líneas desde ahí. Sin log en la carpeta, el último de `Saved/Logs`. [probado]
- **Que no quede ningún `CrashReportClient` vivo del worktree** antes de relanzar: puede retener puertos y archivos.
  Si al retirar el worktree sale «Archivos en uso» tras un crash, es el primer sospechoso. Mátalo por nombre y solo si
  su línea de órdenes apunta a tu worktree. [probado el puerto; los archivos, sin probar]
- Para descartar carreras de hilos de render, relanza con `-norhithread` (más lento). [plan]
- Un plugin o subsistema que se cuelga sin cvar para apagarlo: un `UEngineSubsystem` sin `ShouldCreateSubsystem` se
  crea siempre y puede hacer tick aunque no lo uses. Parche mínimo: que su tick devuelva `Never`, recompilando solo ese
  módulo. [plan]
- Datos generados por script (glTF, buffers) mal formados tumban el RHI sin error de Python: valídalos antes. [probado]

## Lento o colgado

- Mira primero qué procesos gastan CPU (otro editor, ShaderCompileWorker, UBT) antes de culpar al editor. [probado]
- Grafos PCG y generaciones pesadas, de uno en uno: ver [pcg](pcg.md). [probado]
- Trazado de rayos: `r.RayTracing=0` en la configuración del proyecto si el juego no lo necesita. La consola no basta,
  se lee al arrancar; con streaming desbordó la memoria de geometría. [probado]

## Arranque

- Log absoluto por sesión para no perder el rastro de un crash: `-abslog=<ruta con hora> -log -stdout
  -FullStdOutLogOutput`. Las órdenes de Nomos ya pasan `-stdout -FullStdOutLogOutput` y guardan el log en el artefacto
  de la comprobación. [probado]
- Bajar la escalabilidad (`sg.*Quality`, sin trazado de rayos) acelera el editor de trabajo, pero nunca en la captura de
  evidencia: la captura debe parecerse al juego. [plan]
- Un plugin sin build para 5.8 en Fab: compílalo desde fuente como plugin del proyecto (hace falta un target C++) y
  edita la copia que UE carga de verdad. [probado]

## PIE

- Nomos captura con `-game`, no con PIE: en PIE desde el editor por lotes la captura sale con la ventana entera del
  editor, y la cámara del viewport es la del editor, no la del jugador. [probado en Nomos y en el harness]
- Si algún día hace falta PIE en el editor caliente: modo dentro del viewport (no proceso aparte; en Simulate la cámara
  es la del editor), captura en el primer tick si el PIE se cierra solo y lee la pose del pawn, no la de la captura.
  [fuente]
- El primer arranque tarda (≈16 s en un proyecto pesado) y se ve magenta o lavado mientras compilan los shaders: no es
  un fallo de arte. [probado]
- Lo que cambias en el mundo PIE se pierde al parar: los cambios, con PIE parado y en el mundo del editor. [fuente]
