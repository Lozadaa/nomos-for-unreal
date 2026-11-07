# x10 · qué extraer de `per-simmons/unreal-agent-harness` y de las sugerencias de ChatGPT

Fecha: 2026-11-07. Leído por un agente sobre un clon del repo (35 commits del 22 al 24 jun 2026, 209 estrellas, **sin
licencia**, macOS/Metal, UE 5.8) y contrastado con lo que Nomos ya tiene. Meta del usuario: que Nomos sea el mejor
harness de Unreal en calidad y rapidez; un juego completo en días, no en semanas.

## El harness, en cinco líneas

- 57 archivos, ~6 900 líneas de Python; el 80 % son generadores de kits de edificios en Blender. Lo que es harness:
  `ue_qa.py` (captura MCP → PNG + JSON), `ue_launch.sh`, `ue_crashlog.sh`, `ue_remote/ue_exec.py` y ~40 docs en prosa.
- Un agente Claude Code con el **MCP oficial de Epic** en un editor con GUI: actúa → captura 3 ángulos → lee logs → corrige.
- Sin tests, sin idempotencia, sin índice de assets, sin servicio, sin cola. Concurrencia: «un editor, serializa».
- Son notas de laboratorio de tres días. Sirve como catálogo de obstáculos del MCP de Epic, no como código a importar
  (y sin licencia no se puede reutilizar).

## Tabla

| Idea | Harness | Nomos ya | Extraer |
|---|---|---|---|
| Captura desde una pose dada + rejilla y etiquetas de actores con XYZ en la imagen, con JSON al lado | `README.md` (`CaptureViewport {captureTransform, annotations}`), `ue_qa.py` | Vistas player/left/right/top y hoja 2×2 (`references/evidencia.md`), sin etiquetas ni JSON | **Sí**: JSON de cámara y actores junto a cada captura de `map` y `escena`, para que el revisor razone posiciones sin otra sonda. 3-4 h |
| Diff lado a lado intención/resultado | `ue_qa.py refdiff` | Línea base por píxeles + hallazgos con regla/zona/valor (`checks/umg.ts`) | No: Nomos mide, el harness solo monta |
| Lanzador con `-abslog`, matar CrashReportClient que retiene el puerto | `ue_launch.sh` | Caliente con latido y reapertura | Solo «CrashReportClient retiene el turno» como causa en `turnIdleMs`. 1 h |
| Remote-exec con exit codes | `ue_exec.py` | `ue py` con `ok/error/ms` | No |
| MCP de Epic como vía principal | todo | `editor-mcp.ts` apagado por defecto | No: sandbox sin `import unreal`, SSE que inunda contexto, editor con GUI que no cabe en 32 GB. Confirma la decisión de Nomos |
| ChatGPT a) recetas de juego de alto nivel con versión, parámetros y **prueba propia** (`apply_recipe`) | no | Recetas JSON con caché (`editor/recetas.ts`), FASTVFX con `version_plantilla`; ninguna receta corre su prueba | **Sí**: campo `verifica` en cada receta (sondeo esperado) que corre tras aplicarla, y recetas por juego (interactuable, recolectable, planta, panel) sobre `nomos_recetas.py`. 4-6 h la base |
| b) servicio persistente, índice de assets, cola, Live Coding, DDC, UBA | no | Servicio, caliente, cola (`editor/queue.ts`), catálogo (`catalog/indexer.ts`); sin Live Coding ni UBA | Ahora no: `cpp` son 197 comprobaciones en 3,6 h totales, no es cuello |
| c) operaciones idempotentes por id de trabajo, estado previo del asset | no | `ue receta/py/test --tarea`, caché por hash, `escena` repetible; `task create` sin clave | Clave de idempotencia en `task create` (messageId). 2 h |
| d) ciclo rápido en la iteración / aceptación al entregar; test omitido = pendiente, informe viejo = inválido | no | `selectChecks` por diff, `checkGate` exige el commit probado, caché umg por hash | Ya está lo de aceptación. Falta el ciclo rápido **antes** de entregar: `nomos entrega --verificar` (siguiente.md, punto 2). 6 h |
| e) paquete de contexto por tarea y «qué falló antes» con validez | notas a mano | Brief con spec/alcance; `umgAttempt` ya inyecta el intento anterior en UI; `## Lecciones` a Second Brain | Extender «qué falló antes» a la revisión de código (hallazgos del intento anterior en el brief de corrección). 3 h |
| f) un escritor del editor, verificador determinista, revisión según complejidad | prosa | Turno por orden, comprobaciones deterministas, revisor siempre | Saltar el revisor LLM cuando el diff son solo assets o recetas con comprobaciones en verde. 4 h |
| g) métricas y canario | `BUILD-LOG.md` a mano | `nomos metricas` (esta rama) | Canario en Herbalist con las mismas tareas antes y después |

## Absorbido (rama `absorbe-harness`, 2026-11-07)

Tres agentes leyeron los ~1 MB de docs del repo (agente/QA/lanzador; PIE/personajes/look; PCG/Blender/mundo) y dejaron
reglas con su evidencia. Lo útil quedó en Nomos con nuestras palabras (el repo no tiene licencia):

- **Skill nueva `ue-oficio`** (`skills/ue-oficio`), que se instala en el juego con las de UI y cargan todos los roles que
  tocan el editor (implementación, habilidad, VFX, UI, assets, animación, mundo, QA): diez reglas de cabecera y seis
  referencias: `python-ue58`, `importar`, `camara-pawn`, `iluminacion`, `pcg`, `diagnostico`. Cada regla dice si se
  probó, si sale del código del motor o si es un plan sin probar.
- **JSON de escena junto a cada captura de `-game`** (`service/unreal/nomos_escena.py`): cámara, pawn y hasta 40 actores
  visibles con posición, tamaño, base y píxel. Probado con UE 5.8.3 en `FastVfxBench` (captura del jugador + vista
  lateral, 22-23 s, igual que sin él). En la primera pasada destapó un objeto flotando 20 cm sobre el suelo del mapa de
  banco. El QA visual recibe el JSON con la captura y `ue-visual-qa` tiene criterios para leerlo («Capturas de escena»).
- Dos hallazgos propios al probarlo: en `-game` los actores no exponen `get_actor_hidden_in_game` a Python, y aparecen
  actores de depuración sin geometría (`ChaosDebugDrawActor`, `GameplayDebuggerCategoryReplicator`).

### Recetas y código que salen de ahí (pendiente, por valor)

| Qué | Detalle | Por qué |
|---|---|---|
| Veredicto de posesión y suelo en `map` | Tras jugar: pawn de la clase esperada, \|Z pawn − Z PlayerStart\| < 50 cm, base de la cápsula sobre el suelo, log sin «fell out of world», «KillZ» ni «No PlayerStart» | Un juego que «arranca» con el jugador cayendo pasa hoy la comprobación |
| Captura inválida por shaders | > 20 % de píxeles magenta o suelo lavado → repetir, no mandar al QA | Evita rechazos falsos del QA visual |
| Receta `importar_malla` | Importa, mide, rechaza ×100/×0,01 y pivote fuera de la base en módulos, sRGB off en altura/máscara, `TC_Default` en decals | El error más repetido del repo y de Herbalist (escala) |
| Receta `camara_tercera_persona` | Offset relativo, FOV, control de rotación y brazo; valida una sola cámara activa y lente fuera de la malla | Cámaras que tiemblan o ven el interior del pawn |
| Receta `post_exterior` | PPV sin límites, exposición manual, motion blur 0, avisos de sol bajo sin atmósfera y niebla opaca | Capturas blancas o negras |
| Receta `poblar_pcg` | Volumen, paleta, semilla; genera y exige ISM > 0; recrea el volumen si cambia material | PCG falla en silencio |
| `nomos ue crash` | Último informe de las dos carpetas de Crashes, `ErrorMessage` y 60 líneas de pila | El worker deja de relanzar a ciegas |
| Utilidad `set_transform` en recetas | Lee el transform y completa lo que falte | Escalas reseteadas en silencio |

Descartado y por qué: el MCP de Epic como base, la ejecución remota de Python (elige editor al azar con varios abiertos),
los scripts de macOS y todo lo de Cesium, NYC y splats.

## Camino hacia «muy rápido», por orden

1. **Tiempo muerto** (esta rama): Decisiones obvias solas, cupo del revisor, `nomos metricas`. Pendiente: verlo en Herbalist.
2. **`nomos entrega --verificar`** antes del revisor: evidencia existe y no es puntero LFS, nada fuera del alcance, tests
   sobre el HEAD entregado, cada criterio citado. Ataca la mitad de los 59 rechazos sin gastar un turno de nadie.
3. **Canario medido**: tres tareas representativas de Herbalist (variante de planta, panel de UI, bug de inventario)
   con `nomos metricas --desde` antes y después de cada cambio. Sin esto el x10 sigue proyectado.
4. **Recetas con prueba propia y por juego**: cada receta deja su sondeo esperado y lo ejecuta; después, recetas de
   dominio (interactuable, recolectable, planta, panel) que un worker aplica con parámetros en vez de escribir Python.
   Es la apuesta de fondo para la velocidad: lo difícil se resuelve una vez.
5. **JSON de actores en las capturas** (lo único técnico aprovechable del harness) y «qué falló antes» en el brief de
   corrección: menos vueltas del QA visual y de la revisión.
6. **Revisor solo cuando el cambio lo merece** y correcciones en sesión nueva desde la segunda: tokens y espera.
7. **RAM**: medirla por proceso en `status`; con 32 GB no caben dos editores y dos workers. 64 GB es la única vía a
   dos tareas con Unreal en paralelo.

## Qué no copiar

- El MCP oficial de Epic como base, ni `ue_qa.py`/`ue_launch.sh` tal cual (rutas macOS, `sips`, `lsof`, sin licencia).
- Los docs de Cesium, NYC y splats (~70 % del repo): fuera del alcance de un juego como Herbalist.
- «Builder + Critic con moodboard» sin métrica: Nomos ya mide con línea base y hallazgos con valor; volver a un crítico
  solo LLM reabre los bucles de 20 intentos de UI Kit v1.
