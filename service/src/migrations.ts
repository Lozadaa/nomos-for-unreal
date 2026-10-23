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

/** Amplía el proveedor persistible sin convertirlo en un adaptador ejecutable. */
export function migrateWorkerProviders(db:DatabaseSync):void {
  transaction(db,()=>{
    const sql=db.prepare("select sql from sqlite_master where type='table' and name='runs'").get()!.sql as string;
    if(sql.includes("'opencode'")) return;
    const check=/check\s*\(\s*provider\s+in\s*\(([^)]*)\)\s*\)/i;
    if(!check.test(sql)) throw new Error('invalid_provider_schema');
    const definition=sql.replace(check,(_,providers)=>`check(provider in (${providers},'opencode'))`)
      .replace(/^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"runs"|runs)\s*\(/i,'CREATE TABLE runs_migrating(');
    if(definition===sql || !definition.startsWith('CREATE TABLE runs_migrating(')) throw new Error('invalid_provider_schema');
    const auxiliaries=db.prepare("select sql from sqlite_master where tbl_name='runs' and type in ('index','trigger') and sql is not null").all();
    const columns=['rowid',...db.prepare('pragma table_info(runs)').all().map(row=>'"'+String(row.name).replaceAll('"','""')+'"')].join(',');
    db.exec(definition);
    db.exec(`insert into runs_migrating(${columns}) select ${columns} from runs order by rowid`);
    db.exec('drop table runs; alter table runs_migrating rename to runs');
    for(const auxiliary of auxiliaries) db.exec(auxiliary.sql as string);
  });
}

/** Hito 5: cada prueba dice qué comprobación es (cpp, blueprint, asset, map, umg, build). */
export function migrateChecks(db: DatabaseSync): void {
  transaction(db, () => {
    const columns = db.prepare('pragma table_info(test_runs)').all();
    if (!columns.some(row => row.name === 'check_id')) db.exec('alter table test_runs add column check_id text');
  });
}

/** Hito 4: versión del motor con la que se verificó un pack y cola de descargas asistidas del Launcher. */
export function migrateAssets(db: DatabaseSync): void {
  transaction(db, () => {
    const columns = db.prepare('pragma table_info(catalog_entries)').all();
    if (!columns.some(row => row.name === 'verified_engine')) db.exec('alter table catalog_entries add column verified_engine text');
    db.exec(`create table if not exists downloads(
      id text primary key, created_at text not null, updated_at text not null, entry_id text not null,
      target_project text, state text not null check(state in ('pending','completed','timeout','cancelled')),
      requested_at text not null, completed_at text, detail text not null default '{}')`);
  });
}
