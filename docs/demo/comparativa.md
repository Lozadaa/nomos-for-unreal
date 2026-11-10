# Candela · con Nomos y sin Nomos (2026-11-10)

Encargo: el bloque de texto de `docs/demo/candela.md`, sin tocar, igual para las dos ramas. Unreal 5.9 MegaJam Preview, este
PC (31 GB de RAM), una rama cada vez. Notas de cada rama: `notas-A.md`, `notas-B.md`.

## Conclusión en diez líneas

1. **No hay «gran diferencia» a favor de Nomos. El umbral no se cumple.** B saca 14/30 (hacía falta ≥ 24) y A saca 22/30.
2. A (un solo agente Opus, sin Nomos) hizo el juego más legible y más vistoso: el juez a ciegas lo prefiere en 7 de 9 criterios.
3. B (Nomos) gana en acabado: 0 fallos de `revisar_acabado` frente a 4 de A (fuente del motor, HUD con Canvas, sin pantalla de carga).
4. B gana en tipografía (3 frente a 1). Pierde en lectura (1 frente a 3), estela y chispas (1 frente a 3) y en el arranque, que sale en negro.
5. Tiempo: B 39 min 21 s de inicio a FIN. A 63 min 24 s de reloj, pero ~40 min de eso fueron un atasco del arnés del experimento.
   Su `.exe` estaba a los 21 min. En trabajo real, A fue más rápido.
6. Intervenciones: B 2 (aprobar a mano y reempaquetar), A 1 (un empujón tras el atasco). Ninguna rama llegó a 0.
7. La primera pasada de B (B1) hizo otro juego: el director solo leía 90 caracteres del encargo. Se paró a los 26 min.
8. Entre B1 y B2 se arreglaron tres causas en Nomos; tras B2, otras dos (aprobación sin persona y `.exe` perdido). Todo con prueba.
9. Lo que le faltó a B es lo visual de base: la semilla trae un patio oscuro (sol de 6 lux) y nada en el encargo de B pedía «que se lea».
10. Para la jam: Nomos ya saca un juego entero, empaquetado y con acabado en 40 min sin perder el encargo, pero no mejor que un buen agente solo.

## Cómo se lanzó cada rama

| | A · sin Nomos | B · con Nomos |
|---|---|---|
| Proyecto | `Unreal Projects/CandelaSolo`: `TP_Blank` de UE 5.9, compila (53 s) antes de empezar | `Unreal Projects/Candela` (B2, creado como `Candela2` y renombrado al final): `nomos nuevo Candela` |
| Quién | Un subagente de Claude Code, Opus, con orden de no usar skills ni leer nada de Nomos | Nomos en modo rápido, director por evento (Sonnet), workers y revisor por proceso `claude` (Opus implementa, Sonnet revisa) |
| Orden exacta | Herramienta `Agent` (`general-purpose`, `model: opus`) con el encargo y 4 reglas. **No es `claude -p`**: el clasificador de permisos bloqueó `claude -p --model opus --dangerously-skip-permissions --disable-slash-commands` (plan 5.2, plan B) | `nomos start --data .nomos` y `POST /messages` con el encargo (la ruta del chat del panel) |
| Orden | Segunda (heredó la caché de shaders) | Primera (B1 07:20 parada; B2 07:31) |

## Medidas objetivas

| Medida | A | B2 | De dónde |
|---|---|---|---|
| Reloj de inicio a FIN | 63 min 24 s (08:19:32 → 09:22:56), con ~40 min de atasco del arnés | **39 min 21 s** (07:31:56 → 08:11:17) | `docs/tiempos.jsonl` |
| `.exe` empaquetado | 21 min después del inicio | lo empaquetó el worker; se perdió al cerrar su worktree; reempaquetado a mano (144 s) | archivos |
| Tokens de entrada (con caché) | 7,50 M | 9,91 M | transcripciones de Claude Code |
| Tokens de salida | 91,9 k | 72,6 k | transcripciones |
| Sesiones de Claude Code | 1 | 8 (4 despertares del director, 2 workers, 2 revisores) | transcripciones, `metricas-B.json` |
| Intervenciones | 1 | 2 | `notas-A.md`, `notas-B.md` |
| Fallos de acabado | 4 (y 1 aviso) | **0** | `revisar_acabado.py` |
| El `.exe` arranca y aguanta 60 s | sí | sí | `grabar.ps1` (vídeo de 60 s) |
| Test de reglas `Candela.Reglas` | pasa (1/1) | pasa (1/1) | `nomos ue test` |
| Código | 1212 líneas añadidas en `Source/` | 745 añadidas sobre la semilla | `git diff --stat` |

## Juicio a ciegas

Juez: un subagente Sonnet, con las cinco capturas de cada `.exe` en modo demo (0, 3, 15, 30, 55 s, a 1280×720, sacadas del
vídeo), etiquetadas X e Y al azar, y la rúbrica. Clave revelada después: X = A, Y = B.

| # | Criterio | A | B | Motivo del juez (resumido) |
|---|---|---|---|---|
| 1 | De menú a final | 2 | 1 | A: menú y demo en marcha. B: el segundo 0 sale negro, sin menú ni final visibles |
| 2 | Mecánica | 2 | 1 | A: estela larga y aro de carga. B: casi no se ve la brasa |
| 3 | Se lee a 1280×720 | 3 | 1 | A: brasa, sombras y faroles claros. B: apenas se distinguen |
| 4 | Arco visual | 3 | 2 | A: de azul oscuro a dorado. B: de negro a marrón claro, poco contraste |
| 5 | Estela y chispas | 3 | 1 | |
| 6 | Sonido (puntuado por mí) | 2 | 2 | Las dos sintetizan sonido en código para lanzarse, reventar, farol y final; no lo he oído: 2, no 3 |
| 7 | HUD y menú, tipografía propia | 1 | 3 | A usa Roboto (la del motor). B, fuentes propias con tildes |
| 8 | Nada por defecto del motor | 2 | 1 | A: fuente del motor. B: suelo liso, faroles esquemáticos |
| 9 | Carga y final con reinicio | 2 | 0 | Las capturas no muestran el final de ninguna; B no muestra ni menú (arranca en negro) |
| 10 | Robustez | 2 | 2 | Las dos avanzan sin caídas (A 7/8, B 6/8 en el segundo 55) |
| | **Total** | **22** | **14** | |

Umbral de `candela.md`: B ≥ 24 y ≥ A + 8; mismo tiempo o menos que A; 0 intervenciones; 0 fallos de acabado.
Se cumple: 0 fallos de acabado y menos reloj que A. **No se cumple:** la nota, la diferencia y las intervenciones.

## Las dos pasadas de B

| | B1 | B2 |
|---|---|---|
| Nomos | main 581b905 | main 887fe6d (B1 arreglado) |
| Qué hizo el director | Leyó 90 caracteres y se inventó otro juego (una vela, viento, 5 faroles) | Dos tareas fieles al encargo, en serie (la visual dependía de la mecánica) |
| Final | Parada a los 26 min: juego equivocado y una revisión atascada por JSON roto | FIN a los 39 min, integrado en `main` |
| Arreglado después en Nomos | brief del director con el mensaje entero; `NOMOS_REVIEW` roto pide repetirlo; áreas `vfx`/`camara`/`ia` | «Por aprobar» sin persona se aprueba a los 15 min; el `.exe` se empaqueta en la carpeta del juego |

## Archivos

- `Escritorio/Candela-demo/`: `Candela-A.mp4`, `Candela-B.mp4`, `Candela-lado-a-lado.mp4`, las diez capturas y esta comparativa.
- `Escritorio/Candela (con Nomos).lnk` → `Unreal Projects/Candela/Empaquetado/Windows/Candela.exe`.
- Métricas de Nomos: `metricas-B1.json`, `metricas-B.json`.
