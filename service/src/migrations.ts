import type { DatabaseSync } from 'node:sqlite';
import { transaction } from './repo/rows.ts';

export function migrateWorker(db: DatabaseSync): void {
  transaction(db, () => {
    for (const [table, column, definition] of [
      ['tasks', 'scope', "text not null default '[]'"],
      ['runs', 'metadata', "text not null default '{}'"],
      ['commands', 'not_before', 'text'],
    ]) {
      const columns = db.prepare(`pragma table_info(${table})`).all();
      if (!columns.some(row => row.name === column)) db.exec(`alter table ${table} add column ${column} ${definition}`);
    }
  });
}

export function migrateLeases(db: DatabaseSync): void {
  transaction(db, () => {
    db.exec(`create table if not exists leases(
      path text primary key collate nocase, run_id text not null,
      task_id text not null, acquired_at text not null)`);
    const columns=db.prepare('pragma table_info(tasks)').all();
    for (const [column,definition] of [
      ['leases',"text not null default '[]'"],
      ['review_approved','integer not null default 0'],
      ['wait_reason','text'],
    ]) if (!columns.some(row=>row.name===column)) db.exec(`alter table tasks add column ${column} ${definition}`);
  });
}
