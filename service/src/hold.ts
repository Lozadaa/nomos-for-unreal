import type { DatabaseSync } from 'node:sqlite';
import type { Hold, Task } from './model.ts';
import { requireTask } from './repo/tasks.ts';
import { appendEvent } from './store.ts';

const eventType = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
export const holdText = (hold: Hold) => `En espera: ${hold.reason}`;

/**
 * Hito 21: espera deliberada del director (`nomos task hold`). Vence a los `until` minutos, con el primer evento de
 * ese tipo posterior a marcarla o al pedir la integración; mientras dura, ningún barrido abre Decisión de atasco.
 */
export function holdTask(db: DatabaseSync, taskId: string, reason: string, until?: number | string): Task {
  const task = requireTask(db, taskId);
  if (typeof reason !== 'string' || !reason.trim() || until !== undefined
    && !(typeof until === 'number' ? Number.isSafeInteger(until) && until > 0 : typeof until === 'string' && eventType.test(until)))
    throw new Error('invalid_hold');
  if (task.state === 'done') throw new Error('invalid_transition');
  const now = new Date(), sinceSeq = Number(db.prepare('select coalesce(max(seq),0) seq from events').get()!.seq);
  const hold: Hold = {reason: reason.trim(), at: now.toISOString(), sinceSeq,
    ...(typeof until === 'number' ? {until: new Date(now.getTime() + until * 60_000).toISOString()} : {}),
    ...(typeof until === 'string' ? {untilEvent: until} : {})};
  db.prepare('update tasks set hold=?,updated_at=? where id=?').run(JSON.stringify(hold), now.toISOString(), taskId);
  appendEvent(db, 'task.held', null, {taskId, ...hold});
  return requireTask(db, taskId);
}

export function activeHold(db: DatabaseSync, task: Pick<Task, 'hold'>, now = Date.now()): Hold | null {
  const hold = task.hold;
  if (!hold || hold.until && Date.parse(hold.until) <= now) return null;
  if (hold.untilEvent && db.prepare('select 1 from events where type=? and seq>? limit 1').get(hold.untilEvent, hold.sinceSeq)) return null;
  return hold;
}

export function liftHold(db: DatabaseSync, taskId: string, reason: string): void {
  if (!requireTask(db, taskId).hold) return;
  db.prepare('update tasks set hold=null where id=?').run(taskId);
  appendEvent(db, 'task.hold_lifted', null, {taskId, reason});
}

/** Lo que ven `GET /tasks` y el panel: la espera viaja como `waitReason` si el planificador no puso otra. */
export const withHold = <T extends Task>(db: DatabaseSync, task: T): T => {
  const hold = activeHold(db, task);
  return hold && !task.waitReason ? {...task, waitReason: holdText(hold)} : task;
};
/** `nomos status`: las esperas vigentes. */
export const activeHolds = (db: DatabaseSync) => db.prepare("select id,title,hold from tasks where hold is not null and state!='done'").all()
  .flatMap(row => {
    const hold = activeHold(db, {hold: JSON.parse(row.hold as string)});
    return hold ? [{taskId: row.id as string, title: row.title as string, text: holdText(hold), ...(hold.until ? {until: hold.until} : {}),
      ...(hold.untilEvent ? {untilEvent: hold.untilEvent} : {})}] : [];
  });
