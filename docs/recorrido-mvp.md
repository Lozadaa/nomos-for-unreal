# Recorrido completo del MVP (hito 7)

Real, en `C:\Users\richa\Documents\Unreal Projects\KratosFabTest` (Unreal 5.8.3), con workers Claude Code (Sonnet) en Orca,
servicio del worktree `hito7-acabado` en `127.0.0.1:8780` y datos en `.kratos-hito7`. Ningún worker Codex. Horas en UTC,
23–24 de octubre de 2026, sacadas de los eventos del servicio (`kratos.db`).

## Qué se pidió

1. **Migrar del catálogo** la raqueta «Nude Tennis Racket» (Fab, de CrazyPadel) a KratosFabTest, sin GUI.
2. **A · Retirar `Content/Kratos/Marcador.uasset`** (4 bytes, rompía el cook; hallazgo de la Tarea 3).
3. **B · HUD de vida y raqueta del catálogo** (área UI, depende de A): barra de vida en C++ que baja un 10 % con H, la
   raqueta migrada delante de la cámara, `cpp` + `umg` (QA visual) + `build` (empaquetado con recorrido).
4. **C · Continuación de B**: «la cifra de vida como porcentaje», pedida tras el DONE con `kratos task continue`.

## Tiempos por etapa

| Etapa | Tarea | Desde → hasta | Duración |
|---|---|---|---|
| Migración del asset del catálogo (editor sin GUI) | catálogo | 22:15:49 → 22:16:22 | 33 s |
| Worker → DONE | A | 22:16:53 → 22:17:21 | 28 s |
| Revisión de código | A | 22:17:37 → 22:18:09 | 32 s |
| Comprobaciones (el diff no toca Unreal) | A | 22:18:09 | 0 s |
| Integración + cierre | A | 22:18:22 → 22:18:33 | 11 s |
| **A completa** | A | 22:16:48 → 22:18:33 | **1 min 45 s** |
| Worker → primer DONE (C++, HUD, raqueta, Build.bat) | B | 22:18:36 → 22:28:27 | 9 min 51 s |
| Ciclo UMG (capturas PIE) → QA visual aprobado | B | 22:28:28 → 22:50:43 | 22 min 15 s (capturas 1 min 27 s; el QA se quedó parado hasta un mensaje del director a las 22:50:31) |
| Revisión de código | B | 22:50:58 → 22:51:43 | 45 s |
| `cpp` + `build` (empaquetado y recorrido de 30 s) | B | 22:51:44 → 22:53:42 | 1 min 58 s |
| Integración rechazada por archivos locales del usuario | B | 22:54:03 → 23:10:40 | 16 min 37 s (bucle de ~170 reintentos, hallazgo 10) |
| Corrección 1 (archivos locales fuera) → DONE | B | 23:53:00 → 00:24:15 | 31 min (envío bloqueado por Orca, hallazgos 11 y 12) |
| UMG + QA visual | B | 00:24:16 → 00:26:57 | 2 min 41 s |
| Parada tras el QA (sin revisión de código encolada) | B | 00:26:57 → 00:45:31 | 18 min 34 s (hallazgo 13) |
| Revisión de código → correcciones | B | 00:45:31 → 00:49:07 | 3 min 36 s |
| Corrección 2 (raqueta versionada, cook, null check…) → DONE | B | 01:08:09 → 01:11:09 | 3 min (reenvío por terminal nuevo) |
| UMG + QA visual + revisión de código (encadenada sola) | B | 01:11:10 → 01:14:41 | 3 min 31 s |
| `cpp` + `build`: la línea base no tenía raqueta | B | 01:14:42 → 01:17:35 | 2 min 53 s (hallazgo 14) |
| Respuesta del worker sin cambios → UMG + QA | B | 01:18:49 → 01:21:03 | 2 min 14 s |
| Revisiones contradictorias y diff contaminado | B | 01:21:07 → 01:30:50 | 9 min 43 s (hallazgos 15 y 16) |
| `cpp` + `build` en verde | B | 01:30:51 → 01:32:38 | 1 min 47 s |
| Integración en `master@ba00556` | B | 01:33:09 → 01:33:11 | 2 s |
| Cierre (Decisión «Cambios sin registrar» → Descartar) | B | 01:33:20 → 01:36:16 | 2 min 56 s |
| **B completa** | B | 22:16:49 → 01:36:16 | **3 h 19 min** |
| Continuación: worker (mismo responsable) → DONE | C | 01:36:37 → 01:38:41 | 2 min 4 s |
| UMG + QA visual → revisión de código (encadenada sola) | C | 01:38:42 → 01:42:05 | 3 min 23 s |
| `cpp` | C | 01:42:06 → 01:42:07 | 1 s |
| Integración en `master@2263a65` + cierre | C | 01:42:20 → 01:42:30 | 10 s |
| **C completa** (sin ninguna intervención manual) | C | 01:36:33 → 01:42:30 | **5 min 57 s** |

Tiempo de trabajo efectivo de los workers en B: unos 16 min (tres DONE). El resto fue espera del director, bucles y
bloqueos de Orca, todos con su hallazgo en [la auditoría](auditoria-7-cierre.md) y su corrección con prueba.

## Lo que queda en el juego

- `master@2263a65` (C sobre `ba00556` de B) en el checkout del usuario: la cifra de vida en porcentaje («70 %»), módulo C++ `KratosFabTest`, HUD de vida (tecla H, −10 %, tope 0), raqueta
  `Content/Fab/Nude_Tennis_Racket_🎾` versionada (los 5 `.uasset`), `Config/DefaultGame.ini` con
  `DirectoriesToAlwaysCook` y GameMode por defecto en `Config/Windows/WindowsEngine.ini`.
- El empaquetado del recorrido arranca, dura 30 s y su captura coincide con la línea base `docs/baseline/build-1280x720.png`
  (regenerada en este recorrido: la anterior era la escena sin raqueta).
- **`Config/DefaultEngine.ini` del usuario**: sin seguir, sin tocar (fecha 2026-10-22 21:20, 515 bytes) y en ningún commit.

## Intervenciones del director (manuales)

Cada una está en la auditoría con su arreglo en Kratos:
- `kratos task review` tras el QA del primer ciclo (ahora lo encola el servicio, hallazgo 13).
- Registro a mano de un terminal nuevo (`real/rehandle.ts`) y luego, ya automático, el reenvío por terminal nuevo (hallazgo 11).
- Borrar `screenFingerprint` tras reiniciar el servicio con el lector de marcadores nuevo (hallazgo 12).
- Regenerar la línea base visual y responder al worker (hallazgo 14).
- Spec alineada con la regla de Config local y tarea devuelta a `revisando` dos veces (hallazgos 15 y 16).
- «Descartar» en «Cambios sin registrar» al cerrar: eran `Build/…/*OpenOrder.log` y el `DefaultEngine.ini` local del árbol.
