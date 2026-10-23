import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Command } from './model.ts';
import { appendEvent } from './store.ts';
import { transaction as savepoint } from './repo/rows.ts';

function transaction<T>(db: DatabaseSync, action: () => T): T {
  if (db.isTransaction) return savepoint(db, action);
  db.exec('begin immediate');
  try { const result = action(); db.exec('commit'); return result; }
  catch (error) { db.exec('rollback'); throw error; }
}

function read(db: DatabaseSync, id: string): Command {
  const row = db.prepare(`select id, created_at as createdAt, updated_at as updatedAt,
    type, payload, idempotency_key as idempotencyKey, state, attempts, error,
    claimed_by as claimedBy, started_at as startedAt, finished_at as finishedAt, not_before as notBefore
    from commands where id=?`).get(id)!;
  return { ...row, payload: JSON.parse(row.payload as string) } as Command;
}

function event(db: DatabaseSync, command: Command, result?: object): void {
  appendEvent(db, `command.${command.state}`, null, {
    commandId: command.id, ...command, ...(result === undefined ? {} : { result }),
  });
}

export function enqueue(db: DatabaseSync, type: string, payload: object,
  idempotencyKey: string, opts: {notBefore?: string} = {}): Command {
  return transaction(db, () => {
    const existing = db.prepare('select id from commands where idempotency_key=?').get(idempotencyKey);
    if (existing) return read(db, existing.id as string);
    const id = randomUUID(), now = new Date().toISOString();
    db.prepare(`insert into commands(id,created_at,updated_at,type,payload,idempotency_key,state,attempts,not_before)
      values(?,?,?,?,?,?,'pending',0,?)`).run(id, now, now, type, JSON.stringify(payload), idempotencyKey, opts.notBefore ?? null);
    const command = read(db, id);
    event(db, command);
    return command;
  });
}

export function claim(db: DatabaseSync, workerId: string): Command | undefined {
  return transaction(db, () => {
    const row = db.prepare(`select id from commands where state='pending' and (not_before is null or not_before<=?)
      order by created_at, rowid limit 1`).get(new Date().toISOString());
    if (!row) return undefined;
    const now = new Date().toISOString();
    db.prepare(`update commands set state='running', attempts=attempts+1, claimed_by=?,
      started_at=?, finished_at=null, updated_at=? where id=?`).run(workerId, now, now, row.id);
    const command = read(db, row.id as string);
    event(db, command);
    return command;
  });
}

function running(db: DatabaseSync, id: string): Command {
  const row = db.prepare('select state from commands where id=?').get(id);
  if (!row) throw new Error('unknown_command');
  if (row.state !== 'running') throw new Error('invalid_command_transition');
  return read(db, id);
}

export function complete(db: DatabaseSync, id: string, result?: object): void {
  transaction(db, () => {
    running(db, id);
    const now = new Date().toISOString();
    db.prepare(`update commands set state='done', error=null, finished_at=?, updated_at=?
      where id=?`).run(now, now, id);
    event(db, read(db, id), result);
  });
}

/** Espera previa a efectos: conserva intención y no consume el presupuesto de reintentos. */
export function defer(db:DatabaseSync,id:string,reason:string):void {
  transaction(db,()=>{
    running(db,id);const now=new Date().toISOString();
    db.prepare(`update commands set state='pending',attempts=max(0,attempts-1),error=?,claimed_by=null,
      started_at=null,finished_at=null,not_before=?,updated_at=? where id=?`)
      .run(reason,new Date(Date.now()+5000).toISOString(),now,id);
    appendEvent(db,'command.deferred',null,{commandId:id,reason,notBefore:read(db,id).notBefore});
  });
}

/** Llamado solo tras validar el bloqueo de política y la ausencia de efectos. */
export function resumePolicyCommand(db: DatabaseSync,id:string,decisionId:string): void {
  const now=new Date().toISOString();
  const changed=db.prepare(`update commands set state='pending',error=null,claimed_by=null,started_at=null,
    finished_at=null,not_before=null,updated_at=? where id=? and state='done'`).run(now,id);
  if(changed.changes) appendEvent(db,'command.pending',null,
    {commandId:id,...read(db,id),resumed:true,decisionId});
}

export function fail(db: DatabaseSync, id: string, error: string, opts: {retry?: boolean} = {}): void {
  transaction(db, () => {
    const command = running(db, id);
    const state = opts.retry !== false && command.attempts < 3 ? 'pending' : 'failed';
    const now = new Date().toISOString();
    db.prepare(`update commands set state=?, error=?, claimed_by=null, started_at=null,
      finished_at=?, updated_at=? where id=?`).run(state, error, state === 'failed' ? now : null, now, id);
    event(db, read(db, id));
  });
}
