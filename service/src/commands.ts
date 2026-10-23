import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Command } from './model.ts';
import { appendEvent } from './store.ts';

function transaction<T>(db: DatabaseSync, action: () => T): T {
  db.exec('begin immediate');
  try { const result = action(); db.exec('commit'); return result; }
  catch (error) { db.exec('rollback'); throw error; }
}

function read(db: DatabaseSync, id: string): Command {
  const row = db.prepare(`select id, created_at as createdAt, updated_at as updatedAt,
    type, payload, idempotency_key as idempotencyKey, state, attempts, error,
    claimed_by as claimedBy, started_at as startedAt, finished_at as finishedAt
    from commands where id=?`).get(id)!;
  return { ...row, payload: JSON.parse(row.payload as string) } as Command;
}

function event(db: DatabaseSync, command: Command, result?: object): void {
  appendEvent(db, `command.${command.state}`, null, {
    commandId: command.id, ...command, ...(result === undefined ? {} : { result }),
  });
}

export function enqueue(db: DatabaseSync, type: string, payload: object,
  idempotencyKey: string): Command {
  return transaction(db, () => {
    const existing = db.prepare('select id from commands where idempotency_key=?').get(idempotencyKey);
    if (existing) return read(db, existing.id as string);
    const id = randomUUID(), now = new Date().toISOString();
    db.prepare(`insert into commands(id,created_at,updated_at,type,payload,idempotency_key,state,attempts)
      values(?,?,?,?,?,?,'pending',0)`).run(id, now, now, type, JSON.stringify(payload), idempotencyKey);
    const command = read(db, id);
    event(db, command);
    return command;
  });
}

export function claim(db: DatabaseSync, workerId: string): Command | undefined {
  return transaction(db, () => {
    const row = db.prepare(`select id from commands where state='pending'
      order by created_at, rowid limit 1`).get();
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

export function fail(db: DatabaseSync, id: string, error: string): void {
  transaction(db, () => {
    const command = running(db, id);
    const state = command.attempts < 3 ? 'pending' : 'failed';
    const now = new Date().toISOString();
    db.prepare(`update commands set state=?, error=?, claimed_by=null, started_at=null,
      finished_at=?, updated_at=? where id=?`).run(state, error, state === 'failed' ? now : null, now, id);
    event(db, read(db, id));
  });
}
