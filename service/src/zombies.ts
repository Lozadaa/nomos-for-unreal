import type { DatabaseSync } from 'node:sqlite';
import { transaction } from './repo/rows.ts';
import { appendEvent } from './store.ts';

/**
 * Hito 22: un comando aplazado «Esperando decisión» cuya Decisión ya caducó o se resolvió antes de su último aplazamiento
 * (el manejador la vio y siguió esperando), o cuya tarea ya está hecha, no despertará nunca: se cancela
 * (`command.cancelled {reason:'decisión caducada'}`). Al abrir la base y en cada pasada del planificador.
 */
export function cancelDecisionZombies(db: DatabaseSync): number {
  return transaction(db, () => {
    const rows = db.prepare(`select c.id,c.type,c.updated_at at,json_extract(c.payload,'$.taskId') taskId,t.state task from commands c
      left join tasks t on t.id=json_extract(c.payload,'$.taskId')
      where c.state='pending' and c.error like 'Esperando decisión%'`).all();
    let cancelled = 0;
    for (const row of rows) {
      const decision = db.prepare(`select d.state,d.updated_at at from decisions d where d.task_id=? and exists(select 1 from json_each(d.evidence) e
        where json_extract(e.value,'$.kind')='command' and json_extract(e.value,'$.ref')=?) order by d.created_at desc,d.rowid desc limit 1`).get(row.taskId, row.id);
      const dead = row.task === 'done' || !!decision && ['stale', 'resolved'].includes(decision.state as string)
        && Date.parse(decision.at as string) <= Date.parse(row.at as string);
      if (!dead) continue;
      const now = new Date().toISOString();
      db.prepare("update commands set state='failed',error='Cancelado: decisión caducada',claimed_by=null,finished_at=?,updated_at=? where id=?").run(now, now, row.id);
      appendEvent(db, 'command.cancelled', null, {commandId: row.id, type: row.type, taskId: row.taskId, reason: 'decisión caducada'});
      cancelled++;
    }
    return cancelled;
  });
}
