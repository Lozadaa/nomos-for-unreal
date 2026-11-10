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
