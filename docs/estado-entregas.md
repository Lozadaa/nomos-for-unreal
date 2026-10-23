# Estado de las entregas

Actualizado el 2026-10-23 desde la rama `hito8-vistas`. «Verificado» significa que se ejecutó en esta sesión; lo demás se da por el estado del repositorio y no se volvió a comprobar.

| Hito | Estado | Evidencia |
|---|---|---|
| 0 · Escucha | En `main` | `docs/aceptacion-hito0.md`, `tests/` (pruebas del hito 0 dentro de `npm test`) |
| 1a · Diseño | En `main`; su dirección visual quedó **sustituida** por el hito 8 | `docs/diseno/`, `docs/diseno-visual.md` (reescrito) |
| 1b · Servicio (Tareas 1-5) | En `main` | `tests/service/`, `kratos seed`, rutas con token. Verificado: `npm test` 68/68 |
| 8 · Interfaz viva, Tareas 1-3 | En `main` | base visual, capa de sensación, shell |
| 8 · Interfaz viva, **Tareas 4-6** | **En la rama `hito8-vistas`, sin publicar** | `docs/auditoria-8-cierre.md`, `docs/medicion-8.json`, `docs/capturas-8/` |
| 2 · Primer worker | Lo implementa Codex en otro worktree; **no verificado desde aquí** | plan `docs/superpowers/plans/2026-10-22-hito2-primer-worker.md` |
| 3-7 | Con plan, sin empezar | `docs/superpowers/plans/` |

## Hito 8 (Tareas 4-6): lo que hay y lo que espera

**Hecho y verificado**: Producción como lista viva con detalle compartido y compositor; Chat, Actividad, Entregas, Catálogo, Decisiones, Presupuesto, Capacidades y Estilo; `GET /status` con `project`. `npm test` 68/68 · Vitest 77/77 · build verde (204,9 KB gzip de JS inicial) · Playwright en Chromium y Firefox 37 pasadas, 3 omitidas con motivo · revisión final independiente hecha (1 crítico y 7 importantes arreglados; menores diferidos en la auditoría). INP < 200 ms en las cinco acciones principales, también con CPU ×4.

**Espera a rutas del hito 2** (el panel ya está programado contra el contrato del plan y lo dice con «Disponible cuando haya workers» ante 404): pestañas **Cambios** y **Chat** del detalle (`GET /runs/:id/diff`, `GET /runs/:id/output?since=`, `POST /runs/:id/message`).

**Espera a rutas que no están en ningún plan cerrado**: crear comandos (`POST /commands`: «Preparar para Unreal», ⌘K «Indexar» y «Pausar»), fijar límites de presupuesto, deshacer una decisión, listar mensajes.

**Pendiente de rendimiento**: frames largos con CPU ×4 y la primera pintura de 500 eventos de Actividad (cifras en la auditoría).

**Pendiente del servicio (Codex)**: `'wasm-unsafe-eval'` en la política de seguridad para el visor 3D.

## Cómo repetirlo

```
npm test && npm run test:panel && npm run build
cd panel && npx playwright test           # arranca su propio servicio sembrado
node scripts/medir.ts                     # INP, frames largos y bundle → docs/medicion-8.json
node scripts/capturas.ts todas            # capturas a 1366 y 1920 → docs/capturas-8/
```
