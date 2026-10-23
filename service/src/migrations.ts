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
