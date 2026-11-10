# Candela · rama A (sin Nomos) · notas del experimento

- Proyecto: `Unreal Projects/CandelaSolo`, plantilla `TP_Blank` de UE 5.9 renombrada, `EngineAssociation` 5.9, Git con un
  commit; compila (53 s) antes de empezar.
- Quién: un subagente de Claude Code, Opus, sin skills (instrucción explícita de no usar la herramienta Skill), sin leer
  nada de Nomos ni de otros proyectos, sin subagentes. **No es `claude -p`**: el clasificador de permisos bloqueó lanzar
  `claude -p --dangerously-skip-permissions`, y el plan (5.2) prevé este plan B. Diferencia con B: el subagente hereda el
  entorno de esta sesión (CLAUDE.md global del usuario, Second Brain), igual que los workers de Nomos.
- Lanzado: 2026-11-10T08:19:11Z; su línea `inicio`: 08:19:32Z.

## Seguimiento

- 08:31 · reglas, HUD y sonido en `Source/`.
- 08:40 · commit «juego completo en C++…», `.exe` empaquetado (08:40:24) y `docs/hecho.md` (sin commitear). Después, el agente
  queda «esperando su trabajo en segundo plano» y no vuelve: no hay ningún proceso suyo vivo.
- **Intervención 1 · 09:21** · un mensaje neutro: «Tu trabajo en segundo plano ya no está corriendo. Continúa con el encargo
  hasta terminarlo.» Causa: atasco del arnés de subagentes, no del agente.
- 09:22:56 · FIN. 09:27 · informe del agente: `.exe` Shipping probado con `CANDELA_AUTO=1`, ganó en 58,5 s; test `Candela.Reglas`
  pasa; 3 commits. Tokens: 7,50 M de entrada (con caché), 91,9 k de salida, 1 sesión.
