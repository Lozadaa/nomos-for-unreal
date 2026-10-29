import type { DatabaseSync } from 'node:sqlite';
import { transaction } from './repo/rows.ts';
import { migrateBrand } from './legacy.ts';
import { groupRepeated } from './repo/decisions.ts';

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

/** Añade `value` al `check(column in (...))` de `table` reconstruyendo la tabla (SQLite no altera checks); conserva rowid, índices y disparadores. */
function widenCheck(db: DatabaseSync, table: string, column: string, value: string): boolean {
  const sql=db.prepare("select sql from sqlite_master where type='table' and name=?").get(table)!.sql as string;
  if(sql.includes(`'${value}'`)) return false;
  const check=new RegExp(String.raw`check\s*\(\s*${column}\s+in\s*\(([^)]*)\)\s*\)`,'i');
  if(!check.test(sql)) throw new Error(`invalid_${column}_schema`);
  const temp=`${table}_migrating`;
  const definition=sql.replace(check,(_,values)=>`check(${column} in (${values},'${value}'))`)
    .replace(new RegExp(String.raw`^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"${table}"|${table})\s*\(`,'i'),`CREATE TABLE ${temp}(`);
  if(definition===sql || !definition.startsWith(`CREATE TABLE ${temp}(`)) throw new Error(`invalid_${column}_schema`);
  const auxiliaries=db.prepare("select sql from sqlite_master where tbl_name=? and type in ('index','trigger') and sql is not null").all(table);
  const columns=['rowid',...db.prepare(`pragma table_info(${table})`).all().map(row=>'"'+String(row.name).replaceAll('"','""')+'"')].join(',');
  db.exec(definition);
  db.exec(`insert into ${temp}(${columns}) select ${columns} from ${table} order by rowid`);
  db.exec(`drop table ${table}; alter table ${temp} rename to ${table}`);
  for(const auxiliary of auxiliaries) db.exec(auxiliary.sql as string);
  return true;
}

/** Amplía el proveedor persistible sin convertirlo en un adaptador ejecutable. */
export function migrateWorkerProviders(db:DatabaseSync):void {
  transaction(db,()=>widenCheck(db,'runs','provider','opencode'));
}

/** Hito 5b: plantillas del motor como fuente del catálogo. */
export function migrateEngineSource(db: DatabaseSync): void {
  transaction(db, () => widenCheck(db, 'catalog_entries', 'source', 'engine'));
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

/** Hito 6: atribución por rol y carpeta de archivo de la tarea cerrada. */
export function migrateClosing(db: DatabaseSync): void {
  transaction(db, () => {
    const columns = db.prepare('pragma table_info(tasks)').all();
    for (const [column, definition] of [['attribution', "text not null default '{}'"], ['archive_path', 'text']])
      if (!columns.some(row => row.name === column)) db.exec(`alter table tasks add column ${column} ${definition}`);
  });
}

/** Hito 7: carril del ejecutor (normal o largo), latido del comando en curso, tipo de fallo y comprobaciones de capacidades. */
export function migrateLanes(db: DatabaseSync): void {
  transaction(db, () => {
    const columns = db.prepare('pragma table_info(commands)').all();
    const legacy = !columns.some(row => row.name === 'lane');
    for (const [column, definition] of [['lane', "text not null default 'normal'"], ['heartbeat_at', 'text'], ['failure_kind', 'text']])
      if (!columns.some(row => row.name === column)) db.exec(`alter table commands add column ${column} ${definition}`);
    // solo al migrar: escribir en cada apertura convertía la lectura en escritura y dos conexiones se bloqueaban
    if (legacy) db.exec(`update commands set lane='long' where type in ('checks.run','ui.cycle','asset.migrate')`);
    db.exec(`create table if not exists capability_checks(
      id text primary key, state text not null check(state in ('comprobado','roto')), detail text not null, checked_at text not null)`);
  });
}

/** Hito 10: el chat en vivo guarda cuándo empezó a escribir el director y si se le pasó el plazo de 3 min. */
export function migrateChat(db: DatabaseSync): void {
  transaction(db, () => {
    const columns = db.prepare('pragma table_info(messages)').all();
    for (const column of ['typing_at', 'timed_out_at'])
      if (!columns.some(row => row.name === column)) db.exec(`alter table messages add column ${column} text`);
    // GET /messages lee los eventos de cada mensaje: sin índice, 0,64 s con 200 mensajes reales (Block Kings)
    db.exec('create index if not exists events_message_id on events(message_id)');
  });
}

/** Hito 13: prioridad del director (mayor arranca antes; 0 por defecto). */
export function migratePriority(db: DatabaseSync): void {
  transaction(db, () => {
    if (!db.prepare('pragma table_info(tasks)').all().some(row => row.name === 'priority'))
      db.exec('alter table tasks add column priority integer not null default 0');
  });
}

/** Hito 21: espera deliberada del director sobre una tarea (JSON, ver hold.ts). */
export function migrateHold(db: DatabaseSync): void {
  transaction(db, () => {
    if (!db.prepare('pragma table_info(tasks)').all().some(row => row.name === 'hold')) db.exec('alter table tasks add column hold text');
  });
}

/** Hito 11: el proveedor del propio servicio pasa a `nomos` en las bases anteriores al renombrado (ver legacy.ts). */
export function migrateNomos(db: DatabaseSync): void {
  transaction(db, () => migrateBrand(db, (table, column, value) => widenCheck(db, table, column, value)));
}

/**
 * Hito 18: con la base de Block Kings (100 000 eventos, 13 000 comandos) los pendientes del director y las pausas tardaban
 * 20-50 ms cada consulta y una pasada del planificador ~100 ms (18 ms con índice), todo con el bucle de eventos parado.
 */
export function migrateIndexes(db: DatabaseSync): void {
  db.exec('create index if not exists events_type on events(type, seq); create index if not exists commands_type on commands(type, state)');
}

/** Hito 20: cuántas veces se repitió una Decisión automática; las abiertas repetidas de antes se agrupan en la más reciente. */
export function migrateDecisionRepeats(db: DatabaseSync): void {
  transaction(db, () => {
    if (!db.prepare('pragma table_info(decisions)').all().some(row => row.name === 'seen_count'))
      db.exec('alter table decisions add column seen_count integer not null default 1');
    groupRepeated(db);
  });
}

/** Hito 27: cursor propio del director por evento (último evento entregado a una sesión). */
export function migrateDirector(db: DatabaseSync): void {
  if (!db.prepare('pragma table_info(director)').all().some(row => row.name === 'wake_seq'))
    db.exec('alter table director add column wake_seq integer not null default 0');
}
