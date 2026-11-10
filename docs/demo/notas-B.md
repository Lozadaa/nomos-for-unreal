# Candela · rama B (con Nomos) · notas del experimento

- Proyecto: `Unreal Projects/Candela`, creado con `nomos nuevo Candela` (main 581b905).
- Servicio: `nomos start --data .nomos` → puerto 8780. Doctor: Unreal 5.9 (`UE_5.9\...\UnrealEditor-Cmd.exe`). `/status.modo`:
  `{"rapido":true,"director":"evento"}`. Orca cerrado: workers como procesos `claude`.
- Inicio: 2026-11-10T06:54:33Z (línea `inicio` en `docs/tiempos.jsonl`, commit propio). Encargo enviado por `POST /messages`
  (1600 caracteres, el bloque de `candela.md` sin tocar).

## Intervenciones (cada una es un fallo de Nomos)

Ninguna por ahora.

## Seguimiento (`nomos status` cada ~10 min)

- 07:03 · 2 tareas `implementando` (gameplay «jugabilidad de la vela»; ui «atmósfera, HUD y empaquetado»), 2 workers Opus
  desde 06:56-06:57. Director: 1 despertar, 0,96 M tokens de entrada (con caché).
  **Hallazgo:** el director pidió la segunda tarea con área `vfx` y el servicio respondió 500: la tabla `tasks` no
  aceptaba `vfx`, `camara` ni `ia` aunque la API sí. La creó como `ui` (sin las skills de VFX). Arreglado en Nomos
  después (migración `migrateAreas`), no en esta pasada.
- 07:12 · la pista de jugabilidad entrega (`NOMOS_DONE` 07:11, revisión pedida sola en 1 s). El revisor aprueba a las 07:12,
  pero su `NOMOS_REVIEW` no es JSON válido (cierra «…» con una comilla recta) y Nomos lo trata como una espera. El director
  despierta a las 07:13 y responde «Sin nada que decidir: la revisión ya dio su veredicto». La tarea queda parada.
- 07:19 · **Hallazgo grave:** las specs (`.nomos/specs/candela-a.md`, `-b.md`) describen otro juego: «llevas una vela por una
  sala oscura, el viento apaga la llama, enciendes 5 faroles», con WASD. Nada de brasa, ratón, lanzamiento, sombras ni 8
  faroles. Causa: el brief del director (`director.ts`, `cell()`) recorta cada mensaje a 90 caracteres. El director solo
  leyó «Haz un juego completo en Unreal Engine 5.9 con C++ llamado «Candela» y déjalo empaquetado (Sh…» y se inventó el resto.

## Decisión: B1 se para a los 26 min

- 07:20:32 · `nomos stop`. B1 construía un juego distinto del encargo; seguir hasta los 120 min no cambia la nota y retrasa
  la rama A (un solo Unreal). Esta parada es una intervención: cuenta contra B1.
- Estado al parar: 2 tareas (una en `revisando` parada por la marca inválida, otra `implementando`), 5 commits en ramas de
  worker, nada integrado en `main`, sin `.exe`. Métricas en `docs/demo/metricas-B1.json`.
- Causas que se arreglan en Nomos antes de B2 (máximo tres, plan 5.4): (1) el director recibe el mensaje entero; (2) una
  `NOMOS_REVIEW` con JSON roto hace que Nomos pida al revisor repetirla, en vez de esperar; (3) la tabla `tasks` acepta
  `vfx`, `camara` e `ia`.

## Pasada B2 (Nomos con las tres causas arregladas, main 887fe6d)

- Proyecto: `Unreal Projects/Candela2`, con `nomos nuevo Candela --destino …\Candela2` (el juego se llama Candela).
- Servicio en 8780; `/status.modo` `{"rapido":true,"director":"evento"}`; doctor: Unreal 5.9.
- Inicio: 2026-11-10T07:31:56Z. Mismo encargo, misma ruta (`POST /messages`, 1600 caracteres).

- 07:43 · 2 tareas: «mecánica de la brasa y reglas» (gameplay, implementando desde 07:33) y «feel, UI, patio y empaquetado» (vfx: ya se acepta) que **depende** de la primera: el director las encadenó, no van en paralelo. Specs fieles al encargo (8 faroles, ratón, sombras, calor, CANDELA_AUTO).
- 07:46-07:52 · la pista de mecánica entrega, el revisor aprueba (esta vez con JSON válido) y la tarea pide «Aprobar» al
  usuario (`approval.areas` por defecto: gameplay, arte, ui, animacion). El director despierta y dice «espera tu Aprobar».
- **Intervención 1 · 07:53:25** · `nomos approval approve 468c19d5…`. Causa (fallo de Nomos): en modo rápido y sin persona
  delante, la aprobación del usuario para gameplay/ui para la tarea sin plazo. Parada: 7 min.
- 07:54 · mecánica integrada en main@5b808ad y cerrada (`done`) sola tras la aprobación. Arranca la pista visual (feel, UI, patio y empaquetado).
- 08:10 · la pista visual entrega; revisión aprobada a las 08:12:43 (área vfx: sin «Aprobar» del usuario) e integrada en
  main@c186caf a las 08:12:48. **FIN: 08:11:17** (línea escrita por el worker) → **39 min 21 s** de inicio a FIN.
- 08:13 · el cierre falla al borrar el worktree del revisor («Permission denied», un archivo aún abierto). El director lo
  reintenta solo. No afecta al juego.
- **Hallazgo:** no queda `.exe`. El worker empaquetó en su worktree (`Empaquetado/` va en `.gitignore`) y el cierre borró ese
  worktree. La captura `docs/empaquetado.png` sí se commiteó.
- 08:15:17 · `nomos stop`. Tokens de entrada (con caché): 9,27 M (director 0,86 M, implementación 7,65 M, revisión 0,76 M).
- **Intervención 2 · 08:16** · reempaqueto `main` tal cual con `Scripts/empaquetar.ps1` (plan 5.3: «empaquétala tú… cuenta
  como intervención»).
