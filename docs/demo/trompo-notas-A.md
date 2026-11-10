# Trompo · rama A (sin Nomos) · notas del experimento

- Proyecto: `Unreal Projects/TrompoSolo`: árbol del primer commit de `CandelaSolo` (`TP_Blank` de UE 5.9) renombrado, Git
  con un commit; compila en 96 s antes de empezar.
- Quién: **no es `claude -p`**: el clasificador de permisos bloqueó `claude -p --model opus --dangerously-skip-permissions
  --disable-slash-commands` (prueba a las 14:3x, «Create Unsafe Agents»). Plan B de `segundo-juego.md`: un subagente de
  Claude Code (`general-purpose`, `model: opus`) con el encargo sin tocar y cuatro reglas: sin skills ni subagentes, no leer
  Nomos ni otros proyectos, terminar y cerrar lo abierto, y vigilar él mismo lo que lance en segundo plano.
- Lanzado: 2026-11-10T15:45Z (tras cerrar B); su línea `inicio`: 15:45:19Z. FIN: 16:25:08Z → **39 min 49 s**.
- Vigilancia: el subagente corrió en primer plano de esta sesión, así que no pude mirarlo cada 5 min como pide
  `segundo-juego.md`; no hizo falta: no se quedó colgado (84 herramientas, 40 min, 246 k tokens de subagente).
- Intervenciones: **0** (ni del arnés).
- Informe del agente: `.exe` Shipping en `TrompoSolo/Empaquetado/Windows/TrompoSolo.exe`; el modo demo gana a los 58,3 s de
  juego (≈63 s desde que se abre, 3 de 3 veces); test `Trompo.Reglas` pasa; sonido sintetizado sin oírlo; commit `0445809`.
