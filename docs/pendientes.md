# Pendientes

| Qué | Cómo reproducir | Dónde está |
|---|---|---|
| La revisión pedida mientras el responsable volvía a trabajar (fusionar master) tardó 3 min en arrancar tras su `NOMOS_DONE` (15:15:07 → 15:17:58) | Pedir `task review` justo cuando el servicio devuelve la tarea a `implementando`; ver cuándo sale `run.started` del revisor | `review.start` aplazado; ver `service/src/handlers/review-start.ts` y su reintento |
