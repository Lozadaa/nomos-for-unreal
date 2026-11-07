# x10: resultados

Fecha: 2026-11-07. Rama `nomos-x10`, commits `ebb6d2a`, `e3a05cd` y `02135cb`. El análisis está en [analisis.md](analisis.md).

## Antes y después

| Qué | Antes | Después | Cómo se midió |
|---|---|---|---|
| Script Python en el editor (KratosFabTest, UE 5.8.3) | 12,3-14,7 s cada uno (3 en frío) | 0,108-0,109 s cada uno; el primero 10,7 s porque abre el editor | Real: [bench-editor.json](bench-editor.json) |
| Contexto fijo del primer turno de cada sesión de Claude | 64,7-68,1 k tokens | 59,4-59,6 k (−5 a −8,5 k por turno) | Real: `claude -p` con y sin `--settings` |
| Tokens de los workers de Herbalist con compactación a 200 k | 2 269 M | 1 118 M (−51 %), 127 compactaciones | Simulación sobre las 147 transcripciones reales; la compactación no se ha visto aún en un juego |
| Tests | 799 de 800 | 802 de 803 | `npm test`. La que falla es la misma en las dos pasadas: `worker-recovery` «tool.completed contextualiza…», que espera 15 s y no llega con FASTVFX y Unreal cargando el PC. Sola pasa (6 de 6) |

Lo que se proyecta a Herbalist, sin medirlo en un juego real:
- **Python en el editor**: 339 llamadas con mediana de 23 s (4,3 h). Pasarían a un arranque por turno más 0,1 s por script. Eso ahorra unas 1,5 h de esas 4,3 y acorta los turnos de Unreal que bloquean las comprobaciones.
- **Tokens**: el −8 % del contexto fijo y la compactación se suman. La compactación cuenta la mitad del gasto de los workers, que son el 85 % del total.

## Qué se implementó

1. **Sesiones de Claude más ligeras** (`service/src/claude-lean.ts`):
   - Workers, revisores y director arrancan con `--settings %LOCALAPPDATA%/nomos/claude-sesiones.json`. Ese archivo apaga los plugins del usuario que no son `superpowers`, `code-review` ni `ponytail`, y fija `autoCompactWindow: 200000`.
   - Los hooks, las skills del usuario, Second Brain y su MCP no se tocan.
   - `NOMOS_LEAN=off` lo apaga. Si la ruta lleva espacios no se aplica, porque Orca no admite comillas.
2. **Editor caliente** (`service/src/editor/caliente.ts`, `service/unreal/nomos_caliente.py`):
   - `nomos ue py <script.py> [--env K=V]`, `nomos ue estado` y `nomos ue parar`.
   - El editor se abre una vez por worktree con `-NullRHI` y un callback de tick de Slate. Lee los trabajos de `Saved/NomosCaliente/entrada` y deja el resultado en `salida`.
   - Mismo contrato que `-ExecutePythonScript`: el env del trabajo y `__main__`.
   - Se reabre si cambian `Binaries/Win64` o el `.uproject`.
   - Se cierra tras 10 min sin trabajo, al hacer `worker turn --release` o con `ue parar`.
3. **Brief del worker y `references/maquina.md`**: con el turno, el Python del editor va por `nomos ue py`.

## Lo que queda, por impacto

| Qué | Por qué no ahora |
|---|---|
| Ver la compactación a 200 k en un juego real y medir sus tokens con `nomos status` | Hace falta una producción. Si empeora la calidad, se sube con un ajuste por modelo o con `NOMOS_LEAN=off` |
| Pasar al editor caliente los `Automation RunTests` (351 llamadas, 5,6 h) | Se ejecutan por varios ticks y el resultado sale en el log: necesitan un trabajo que espere al «Test Completed». Siguiente paso natural |
| Capturas con `-game` (359 llamadas, 11,1 h): espera fija de 30 s antes de capturar | Esperar a que no queden shaders ni streaming en vez de dormir. Pide pruebas con Unreal en mapas reales |
| Comprobaciones del servicio (`checks/*`) por el editor caliente | `unreal-cmd.ts` lo está tocando FASTVFX; hay poca reutilización entre comprobaciones de una tarea |
| Scripts que se repiten (104 distintos en Herbalist: crear materiales, montar escenas, sondeos) como recetas al estilo FASTVFX | FASTVFX cubre VFX y materiales; las escenas y la UI necesitan sus propias plantillas |
| Sondeo de workers (238 000 `orca terminal read/wait`) y `events` de 585 MB en 6 días | Es coste del servicio, no de tokens ni del juego. Habría que no guardar `worker.output` repetido ni `tool.completed` de lecturas |
| Briefs de 22-27 KB con `docs/ui-direction.md` copiado entero | Un 2 % de los tokens; mejor enlazar el documento que copiarlo |
| Revisión que espera hueco («Sin hueco en claude»: 1,7 h) | Depende del cupo de concurrencia que fija el usuario |

Incidencia: al lanzar la medida del editor en frío, el agente de FASTVFX abrió su editor en el mismo minuto. Durante unos 70 s hubo dos Unreal abiertos (uno de 1,1 GB). Ninguno falló.
