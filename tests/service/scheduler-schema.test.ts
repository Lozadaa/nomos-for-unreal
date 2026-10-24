import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applySchema } from '../../service/src/schema.ts';
import { migrateWorker,migrateLeases,migrateLanes } from '../../service/src/migrations.ts';
import { openDb } from '../../service/src/db.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { startRun,finishRun } from '../../service/src/repo/runs.ts';
import { enqueue } from '../../service/src/commands.ts';

test('migración reconoce OpenCode y conserva campos rowid metadata e idempotencia al reabrir',()=>{
  const dir=mkdtempSync(join(tmpdir(),'kratos-provider-schema-')),file=join(dir,'db.sqlite');
  let db=new DatabaseSync(file);
  try {
    applySchema(db);migrateWorker(db);migrateLeases(db);migrateLanes(db);
    db.exec(`create table events(seq integer primary key autoincrement,id text not null unique,
      type text not null,message_id text,payload text not null,created_at text not null)`);
    const task=createTask(db,{title:'Histórico',area:'qa'});
    const first=startRun(db,{taskId:task.id,provider:'codex',role:'implementacion',metadata:{phase:'finished',uncertain:false},skills:['tdd']});
    finishRun(db,first.id,'done','Primero');
    const removed=startRun(db,{taskId:task.id,provider:'claude',role:'revisor'});
    db.prepare('delete from runs where id=?').run(removed.id);
    const last=startRun(db,{taskId:task.id,provider:'codex',role:'implementacion',attempt:3,sessionRef:'session',
      model:'modelo',metadata:{startCommandId:'cmd',phase:'preparing',waiting:true},skills:['tdd','review']});
    db.prepare('update runs set rowid=17 where id=?').run(last.id);
    const rows=db.prepare('select rowid,* from runs order by rowid').all();
    const command=enqueue(db,'worker.start',{taskId:task.id,provider:'codex',attempt:3},'existing');
    db.close();db=openDb(file);
    assert.deepEqual(db.prepare('select rowid,* from runs order by rowid').all(),rows);
    const historical=startRun(db,{taskId:task.id,provider:'opencode',role:'implementacion',state:'done',summary:'Importado; sin adaptador'});
    assert.equal(historical.provider,'opencode');
    assert.equal(enqueue(db,'worker.start',{replacement:true},'existing').id,command.id);
    assert.throws(()=>startRun(db,{taskId:task.id,provider:'invalid' as any,role:'implementacion'}),/CHECK/);
    assert.throws(()=>db.prepare("update runs set state='invalid' where id=?").run(last.id),/CHECK/);
    const migrated=db.prepare('select rowid,* from runs order by rowid').all();
    db.close();db=openDb(file);
    assert.deepEqual(db.prepare('select rowid,* from runs order by rowid').all(),migrated);
    assert.equal(db.prepare("select count(*) n from sqlite_master where name like 'runs_migrating%'").get()!.n,0);
  } finally {db.close();rmSync(dir,{recursive:true,force:true});}
});
