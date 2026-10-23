import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applySchema } from '../../service/src/schema.ts';
import { openDb } from '../../service/src/db.ts';
import { createTask, requireTask } from '../../service/src/repo/tasks.ts';
import { acquire, listLeases } from '../../service/src/leases.ts';
import { seed } from '../../service/src/seed.ts';

test('migra tareas existentes y decodifica reservas con defaults sin perder datos',()=>{
  const dir=mkdtempSync(join(tmpdir(),'kratos-lease-schema-')),file=join(dir,'db.sqlite');
  try {
    const old=new DatabaseSync(file);applySchema(old);
    old.prepare(`insert into tasks(id,title,spec,acceptance,state,area,depends_on,created_at,updated_at)
      values('legacy','Anterior','','[]','pendiente','qa','[]','now','now')`).run();old.close();
    const db=openDb(file);
    try {
      const legacy=requireTask(db,'legacy');
      assert.deepEqual(legacy.leases,[]);assert.equal(legacy.reviewApproved,0);assert.equal(legacy.waitReason,null);
      const task=createTask(db,{title:'Reserva',area:'ui',leases:['Content/UI/HUD.uasset']});
      assert.deepEqual(task.leases,['Content/UI/HUD.uasset']);assert.equal(legacy.title,'Anterior');
    } finally {db.close();}
    const reopened=openDb(file);reopened.close();
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('resembrar producción limpia reservas de runs eliminados',()=>{
  const db=openDb(':memory:');
  try {
    createTask(db,{title:'Anterior',area:'ui'});acquire(db,'old-run','old-task',['Content/UI/HUD.uasset']);
    seed(db,{force:true});assert.deepEqual(listLeases(db),[]);
  } finally {db.close();}
});
