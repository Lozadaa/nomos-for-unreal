# Pendientes

| Qué | Cómo reproducir | Dónde está |
|---|---|---|
| Una dependencia se da por cumplida con la revisión aprobada aunque no esté integrada: la tarea dependiente arranca sobre la base vieja y el servicio le pide después «Falta fusionar master», que es una vuelta más del worker (unos 260 000 tokens en el ensayo del hito 26) | Tarea B con `--depends A`; aprobar la revisión de A sin integrarla; B arranca enseguida y su revisión vuelve con «Falta fusionar master» | `service/src/scheduler-state.ts:46` (`dep.state==='revisando' && dep.reviewApproved===1`) |
| La revisión pedida mientras el responsable volvía a trabajar (fusionar master) tardó 3 min en arrancar tras su `NOMOS_DONE` (15:15:07 → 15:17:58) | Pedir `task review` justo cuando el servicio devuelve la tarea a `implementando`; ver cuándo sale `run.started` del revisor | `review.start` aplazado; ver `service/src/handlers/review-start.ts` y su reintento |
