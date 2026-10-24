import type { DatabaseSync } from 'node:sqlite';
import { openDecision } from './repo/decisions.ts';
import { appendEvent } from './store.ts';

/** Estados en los que el servicio (o el director) siempre tiene un paso siguiente encolado o en marcha. */
const active = ['implementando', 'revisando', 'probando', 'integrando', 'cerrando'];
/** El paso que la retoma, como lo pide el director. */
export const resume: Record<string, string> = {implementando: 'worker send <run> --file <corrección>', revisando: 'task review',
  probando: 'task check', integrando: 'task integrate', cerrando: 'task finalize'};
export type Stall = {taskId: string; title: string; state: string; quietSeconds: number};

/**
 * Hito 7: tarea en estado activo, sin Decisión, bloqueo ni espera, sin run viva ni comando pendiente
 * y sin cambios desde hace `quietMs`. Nada la va a mover: es un atasco.
 */
export function stalledTasks(db: DatabaseSync, now = Date.now(), quietMs = 10 * 60_000): Stall[] {
  const rows = db.prepare(`select t.id,t.title,t.state,max(t.updated_at,coalesce((select max(coalesce(finished_at,updated_at)) from runs where task_id=t.id),'')) at
    from tasks t where t.state in (${active.map(() => '?').join(',')}) and t.decision_id is null and t.blocked_reason is null and t.wait_reason is null
    and not exists (select 1 from runs where task_id=t.id and state='running')
    and not exists (select 1 from commands c where c.state in ('pending','running') and (json_extract(c.payload,'$.taskId')=t.id
      or json_extract(c.payload,'$.runId') in (select id from runs where task_id=t.id)))`).all(...active);
  return rows.flatMap(r => {
    const quiet = now - Date.parse(r.at as string);
    return quiet >= quietMs ? [{taskId: r.id as string, title: r.title as string, state: r.state as string, quietSeconds: Math.round(quiet / 1000)}] : [];
  });
}

/** Una Decisión por atasco: el director (o el usuario) elige retomar el paso que falta o cancelar. */
export function openStallDecisions(db: DatabaseSync, now = Date.now()): number {
  const stalls = stalledTasks(db, now);
  for (const s of stalls) {
    appendEvent(db, 'task.stalled', null, {taskId: s.taskId, state: s.state, quietSeconds: s.quietSeconds});
    openDecision(db, {taskId: s.taskId, reason: `Tarea parada en «${s.state}» sin ningún paso en marcha`,
      evidence: [{kind: 'estado', ref: s.state}],
      options: [{id: 'retomar', label: 'Retomar', description: `El director pide el paso que falta (kratos ${resume[s.state]})`},
        {id: 'cancelar', label: 'Cancelar', description: 'Dejar la tarea sin terminar'}]});
  }
  return stalls.length;
}
