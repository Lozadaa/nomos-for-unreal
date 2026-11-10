import { DatabaseSync } from "node:sqlite";
import { applySchema } from "./schema.ts";
import { cancelDecisionZombies } from './zombies.ts';
import { migrateApprovals } from './approvals.ts';
import { migrateTeam } from './team.ts';
import { migrateFastVfx } from './fastvfx/cache.ts';
import { migrateWorker, migrateLeases,migrateWorkerProviders,migrateAreas,migrateAssets,migrateChecks,migrateClosing,migrateLanes,migrateEngineSource,migrateChat,migrateNomos,migratePriority,migrateIndexes,migrateDecisionRepeats,migrateHold,migrateDirector } from './migrations.ts';

export function openDb(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec(`
    pragma journal_mode = WAL;
    pragma busy_timeout = 5000;
    create table if not exists messages(
      id text primary key, text text not null, origin text not null,
      created_at text not null, acked_at text, reply_text text, replied_at text);
    create table if not exists events(
      seq integer primary key autoincrement, id text not null unique,
      type text not null, message_id text, payload text not null, created_at text not null);
    create table if not exists director(
      id integer primary key check(id = 1), session text, alive_at text,
      last_ack_seq integer not null default 0, paused integer not null default 0);
    insert or ignore into director(id) values (1);
  `);
  applySchema(db);
  migrateWorker(db);
  migrateLeases(db);
  migrateWorkerProviders(db);
  migrateAreas(db);
  migrateAssets(db);
  migrateChecks(db);
  migrateClosing(db);
  migrateLanes(db);
  migrateEngineSource(db);
  migrateChat(db);
  migrateNomos(db);
  migratePriority(db);
  migrateIndexes(db);
  migrateDecisionRepeats(db);
  migrateHold(db);
  migrateDirector(db);
  migrateApprovals(db);
  migrateTeam(db);
  migrateFastVfx(db);
  // hito 22: los comandos zombi de Decisiones caducadas desaparecen al abrir la base
  cancelDecisionZombies(db);
  return db;
}
