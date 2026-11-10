# Trompo · rama B (con Nomos) · notas del experimento

- Proyecto: `Unreal Projects/Trompo`, `nomos nuevo Trompo` desde la rama `jam-vista` (= `main` cc424c2, fases 1-3 dentro).
- Servicio: `nomos start --data .nomos` → puerto 8780. `/status.modo` `{"rapido":true,"director":"evento"}`. Orca cerrado:
  workers como procesos `claude`. Doctor: Unreal 5.9, Pillow presente.
- Inicio: 2026-11-10T14:28:50Z (línea `inicio` en `docs/tiempos.jsonl`, commit propio). Encargo por `POST /messages`
  (1817 caracteres, el bloque de `segundo-juego.md` sin tocar).

## Intervenciones

Ninguna por ahora.

## Seguimiento
- 14:32 · el director creó **una sola tarea** (`ddbf4f72`, «Trompo», alcance de todo el juego, 8 criterios) con las frases
  del encargo copiadas («Tiene que sentirse bien», «Los trompos parecen trompos») y los tres criterios fijos de lo visible.
  Sin dependencias ni segunda pista.
- 14:46 · un worker Opus implementando en su worktree; usa `TrompoAspecto` (la costura de aspecto de la semilla) y añade `TrompoActores`. Dato raro: `nomos status` decía «workers vivos: 0» a las 14:34 con el worker ya corriendo.
- 14:56 · dos commits del worker: ruedo, trompos torneados, física, sonido generado, efectos y HUD; después copa pintada y victoria del modo demo visible a los 45 s.
- 15:00 · NOMOS_DONE (FIN escrito por el worker a las **14:59:44** → 30 min 54 s desde el inicio). Revisor Sonnet aprueba a las 15:02 (solo leyó el diff). 15:02 «Esperando tu aprobación» (gameplay); sin persona se aprueba sola a los 15 min: no intervengo. El worker escribió tres líneas `VISTO`.
- **Pausa · 15:16Z** (pedida por el usuario, 30 min; no cuenta para ninguna rama). `nomos stop` a las 15:16. Estado de
  `ddbf4f72`: `revisando`, revisión aprobada (15:02), en espera de «Aprobar» (`approval.requested` 15:02:14; sin persona se
  aprueba sola a los 15 min, que con la pausa aún no han corrido del todo). Sin integrar en `main` ni comprobaciones del lote
  todavía. Ningún Unreal ni worker vivo al parar. La rama A (TrompoSolo, plantilla compilada) no se ha lanzado.
- **Fin de la pausa · 15:42Z** (`nomos start` otra vez; el plazo de la aprobación automática sigue contando desde las 15:02).
- 15:42:59 · aprobación automática («afterMinutes» 41, por la pausa) → `integrando` con el motivo «Revisión aprobada; **sin
  pruebas exigidas**» → integrado en `main@da3e9a3` a las 15:43:07 → `done` 15:43:14. Ninguna intervención.
- **Hallazgo:** en modo rápido el lote de comprobaciones (`acabado`, `imagen`, `build`) no se lanzó: la tarea pasa de
  `revisando` a `integrando` cuando ningún criterio empieza por `check:`. La comprobación `imagen` de la fase 2 no corrió
  en esta pasada; lo que miró la imagen fue el worker (tres capturas y líneas `VISTO`) y su `revisar_imagen.py`.
- 15:44 · `nomos metricas --json` → `metricas-trompo-B.json`; `nomos stop`. `.exe` en `Trompo/Empaquetado/Windows/Trompo.exe`
  (empaquetado por el worker a las 14:58Z, en la carpeta del juego).

## 30 min más

- Encargo del usuario: «Me gusto te doy 30min mas de desarrollo con nomos para que lo completes y mejores que sea el loop
  completo mejorado». `nomos start` (copia de Nomos de `jam-vista`); línea `inicio-2` 17:49:23Z con commit propio; el texto
  del coordinador por `POST /messages` (seq 1315). Tope: FIN-2 antes de las 18:19:23Z.
- 17:54 · el director creó **una sola tarea** (`0f0f3393`, «Trompo: bucle completo redondo»), implementando.
- 17:59 · primer commit del worker: cámara baja junto al ruedo, rivales que chocan y caen, demo de 60 s, celebración antes del panel.
- 18:09 · segundo commit: la demo guarda la victoria para el último tiro; el final vuelve a la vista del ruedo.
- 18:11:13 · **FIN-2** (21 min 50 s desde `inicio-2`). Revisión aprobada; a las 18:14 la tarea espera «Aprobar» (gameplay): sin persona se aprueba sola a los 15 min. No intervengo. `.exe` nuevo en `Empaquetado/` (18:09Z).
- 18:27:42 · aprobación automática a los 15 min → integrado en `main@19ea6fa` → `done`. 0 intervenciones. `nomos metricas
  --json` → `metricas-trompo-B2.json`; `nomos stop`. El `.exe` (18:09Z) es anterior a la integración, pero posterior al
  último commit con código (69a27f3, 18:07Z; después solo cambiaron docs y capturas): no lo reempaqueté.
