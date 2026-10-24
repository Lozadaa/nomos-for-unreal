import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './worker-fixture.ts';
import { createTask, requireTask } from '../../service/src/repo/tasks.ts';
import { filtered } from '../../service/src/repo/rows.ts';
import { startRun, finishRun } from '../../service/src/repo/runs.ts';
import { workerFailure } from '../../service/src/handlers/worker-failure.ts';
import { acquire, listLeases, release } from '../../service/src/leases.ts';
import type { Run } from '../../service/src/model.ts';
import { openDb } from '../../service/src/db.ts';
import { requireRun } from '../../service/src/repo/worker.ts';

const path='Content/UI/WBP_HUD.uasset';
function reserve(f: ReturnType<typeof fixture>) {
  f.db.prepare('update tasks set leases=? where id=?').run(JSON.stringify([path]),f.task.id);
}

test('arranque reserva la declaración vigente tras las comprobaciones asíncronas',async t=>{
  const f=fixture(t);reserve(f);
  queueMicrotask(()=>f.db.prepare('update tasks set leases=? where id=?').run(JSON.stringify(['Content/New.uasset']),f.task.id));
  await f.start();assert.deepEqual(listLeases(f.db).map(l=>l.path),['Content/New.uasset']);
});

test('dos tareas del mismo asset solo arrancan un worker; stop libera y permite al segundo arrancar',async t=>{
  const f=fixture(t);reserve(f);await f.start();const owner=f.run();
  assert.equal(listLeases(f.db)[0]?.runId,owner.id);
  const second=createTask(f.db,{title:'HUD alterno',area:'ui',state:'preparada',spec:'Modificar HUD',acceptance:['Se ve'],
    scope:['Content/UI'],leases:['content\\UI\\wbp_hud.uasset']});
  const start=()=>f.invoke('worker.start',{taskId:second.id,provider:'codex',role:'programmer',skills:[]});
  await start();
  assert.equal(f.state().creates,1);
  assert.equal(listLeases(f.db)[0].runId,owner.id);
  const waiting=requireTask(f.db,second.id),failed=filtered<Run>(f.db,'runs',{taskId:second.id})[0];
  assert.equal(waiting.state,'preparada');assert.equal(waiting.blockedReason,null);
  assert.match(waiting.waitReason!,/Esperando reserva: WBP_HUD\.uasset \(tarea /);
  assert.equal(failed.state,'failed');assert.equal(failed.metadata.uncertain,false);
  await f.invoke('worker.stop',{runId:owner.id});
  assert.deepEqual(listLeases(f.db),[]);
  const stopped=requireTask(f.db,f.task.id);
  assert.equal(stopped.state,'preparada');assert.equal(stopped.blockedReason,null);
  assert.match(stopped.waitReason!,/reconciliar/i);assert.equal(stopped.worktreeId,f.tree().id);
  assert.ok(existsSync(join(f.tree().path,'.nomos-brief.md')));
  writeFileSync(f.file,JSON.stringify({...f.state(),treePath:join(f.dir,'second tree')}));
  await start();assert.equal(f.state().creates,2);
  assert.equal(filtered<Run>(f.db,'runs',{taskId:second.id}).length,2);
  assert.equal(requireTask(f.db,second.id).waitReason,null);
});

test('DONE libera; corrección conflictiva conserva run terminado y no envía hasta recuperar reserva',async t=>{
  const f=fixture(t);reserve(f);await f.start();const run=f.run();
  f.output('NOMOS_DONE {"summary":"Listo","commits":["abc"],"tests":"passed"}');
  await f.invoke('worker.poll',{runId:run.id,generation:0});assert.deepEqual(listLeases(f.db),[]);
  acquire(f.db,'other-run','other-task',[path]);const before=f.state().tail.length;
  await f.invoke('worker.send',{runId:run.id,text:'Corregir HUD'});
  assert.equal(f.state().tail.length,before);assert.equal(f.run().state,'done');
  assert.equal(f.run().metadata.correctionCount,0);assert.equal(requireTask(f.db,f.task.id).state,'revisando');
  assert.match(requireTask(f.db,f.task.id).waitReason!,/Esperando reserva/);
  release(f.db,'other-run');await f.invoke('worker.send',{runId:run.id,text:'Corregir HUD'});
  assert.equal(f.run().state,'running');assert.equal(listLeases(f.db)[0].runId,run.id);
  assert.equal(requireTask(f.db,f.task.id).waitReason,null);
});

test('finishRun y workerFailure liberan todas las reservas sin afectar otros runs',()=>{
  const db=openDb(':memory:');
  try {
    const task=createTask(db,{title:'HUD',area:'ui'});
    const first=startRun(db,{taskId:task.id,role:'programmer',provider:'codex'});
    acquire(db,first.id,task.id,[path,'Content/UI/Menu.uasset']);acquire(db,'other','another',['Content/Other.uasset']);
    finishRun(db,first.id,'done','Listo');assert.deepEqual(listLeases(db).map(l=>l.runId),['other']);
    const second=startRun(db,{taskId:task.id,role:'programmer',provider:'codex'});
    acquire(db,second.id,task.id,[path]);workerFailure(db,{runId:second.id},'orca: desconectado');
    assert.deepEqual(listLeases(db).map(l=>l.runId),['other']);
  } finally {db.close();}
});

test('stop de conflicto histórico conserva tarea y reservas del run posterior vigente',async t=>{
  const f=fixture(t);
  const old=startRun(f.db,{taskId:f.task.id,role:'programmer',provider:'codex'});
  workerFailure(f.db,{runId:old.id,conflicts:[{path,runId:'holder',taskId:'owner'}]},'lease_conflict');
  const current=startRun(f.db,{taskId:f.task.id,role:'programmer',provider:'codex',metadata:{worktreeId:'current-tree'}});
  f.db.prepare("update tasks set state='implementando',worktree_id='current-tree',wait_reason=null where id=?").run(f.task.id);
  acquire(f.db,current.id,f.task.id,[path]);
  const before=requireTask(f.db,f.task.id),leases=listLeases(f.db);
  await f.invoke('worker.stop',{runId:old.id});
  assert.deepEqual(requireTask(f.db,f.task.id),before);
  assert.deepEqual(requireRun(f.db,current.id),current);
  assert.deepEqual(listLeases(f.db),leases);assert.equal(requireRun(f.db,old.id).state,'failed');
});

test('stop de run con árbol independiente conserva el seguimiento del árbol de implementación',async t=>{
  const f=fixture(t);
  const implementation=startRun(f.db,{taskId:f.task.id,role:'programmer',provider:'codex',metadata:{worktreeId:'implementation-tree'}});
  const done=finishRun(f.db,implementation.id,'done','Implementado');
  const independent=startRun(f.db,{taskId:f.task.id,role:'reviewer',provider:'codex',metadata:{worktreeId:'review-tree'}});
  f.db.prepare("update tasks set state='revisando',worktree_id='implementation-tree' where id=?").run(f.task.id);
  acquire(f.db,independent.id,f.task.id,[path]);acquire(f.db,'other-run','other-task',['Content/Other.uasset']);
  const before=requireTask(f.db,f.task.id);
  await f.invoke('worker.stop',{runId:independent.id});
  assert.deepEqual(requireTask(f.db,f.task.id),before);assert.deepEqual(requireRun(f.db,implementation.id),done);
  assert.equal(requireRun(f.db,independent.id).state,'cancelled');
  assert.deepEqual(listLeases(f.db).map(l=>l.runId),['other-run']);
});
