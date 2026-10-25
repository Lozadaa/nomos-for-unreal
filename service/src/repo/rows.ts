import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
const json = new Set(['acceptance', 'dependsOn', 'skills', 'evidence', 'options', 'provenance', 'projects', 'formats', 'engineVersions', 'tags', 'scope', 'metadata', 'leases', 'attribution', 'hold']);
export function decode<T>(row: any): T {
    return Object.fromEntries(Object.entries(row).map(([key, value]) => {
        const name = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        return [name, json.has(name) && (name !== 'scope' || String(value).startsWith('[')) ? JSON.parse(value as string) : value];
    })) as T;
}
export function read<T>(db: DatabaseSync, table: string, id: string): T | undefined {
    const row = db.prepare(`select * from ${table} where id=?`).get(id);
    return row ? decode<T>(row) : undefined;
}
export function insert<T>(db: DatabaseSync, table: string, input: object): T {
    const now = new Date().toISOString();
    const data = { id: randomUUID(), createdAt: now, updatedAt: now, ...input };
    const entries = Object.entries(data);
    const columns = entries.map(([k]) => '"' + k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()) + '"');
    db.prepare(`insert into ${table}(${columns.join(',')}) values(${entries.map(() => '?').join(',')})`)
        .run(...entries.map(([k, v]) => json.has(k) && (k !== 'scope' || Array.isArray(v)) ? JSON.stringify(v) : v) as SQLInputValue[]);
    return read<T>(db, table, data.id)!;
}
export function transaction<T>(db: DatabaseSync, action: () => T): T {
    // Savepoints let composed repository operations share a single atomic transaction.
    const name = 'repo_' + randomUUID().replaceAll('-', '');
    db.exec(`savepoint ${name}`);
    try {
        const result = action();
        db.exec(`release ${name}`);
        return result;
    }
    catch (error) {
        db.exec(`rollback to ${name}; release ${name}`);
        throw error;
    }
}
export function filtered<T>(db: DatabaseSync, table: string, filter: object = {}): T[] {
    const entries = Object.entries(filter).filter(([, v]) => v !== undefined);
    const where = entries.map(([k]) => k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()) + '=?').join(' and ');
    return db.prepare(`select * from ${table}${where ? ' where ' + where : ''} order by rowid`).all(...entries.map(([, v]) => v) as SQLInputValue[]).map(r => decode<T>(r));
}
export type Input<T> = Partial<Omit<T, 'createdAt' | 'updatedAt'>>;
