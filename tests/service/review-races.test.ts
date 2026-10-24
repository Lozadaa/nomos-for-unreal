import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewFixture } from './review-fixture.ts';
import { requireTask } from '../../service/src/repo/tasks.ts';
import { requireRun, updateRun } from '../../service/src/repo/worker.ts';
import { acquire, listLeases } from '../../service/src/leases.ts';
import { recoverCommands } from '../../service/src/recovery.ts';
import { createServer } from '../../service/src/server.ts';
import { openDecision } from '../../service/src/repo/decisions.ts';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

test('instrucción aceptada por HTTP invalida aprobación y revisión aún en vuelo',async t=>{
  const f=await reviewFixture(t);await f.startReview();
  const server=createServer(f.db,'secret','service/web',f.dataDir);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
  f.db.prepare('update tasks set review_approved=1 where id=?').run(f.task.id);
  const response=await fetch(`http://127.0.0.1:${(server.address() as any).port}/runs/${f.implementer.id}/message`,{
    method:'POST',headers:{Authorization:'Bearer secret'},body:JSON.stringify({text:'Corrige nueva condición'})});
  assert.equal(response.status,202);assert.equal(requireTask(f.db,f.task.id).reviewApproved,0);
  f.output('NOMOS_REVIEW {"approved":true,"findings":[]}');await f.poll();
  assert.equal(requireTask(f.db,f.task.id).reviewApproved,0);
});
test('fallo del review.start después de cambio del implementador preserva su run y leases',async t=>{
  const f=await reviewFixture(t);const original=f.ctx.orca.terminalWaitIdle;
  f.ctx.orca.terminalWaitIdle=async(...args)=>{
    await original(...args);updateRun(f.db,f.implementer.id,{pollGeneration:1},{state:'running'});
    acquire(f.db,f.implementer.id,f.task.id,['Docs']);throw new Error('orca: sesión de revisión falló');
  };
  await assert.rejects(f.startReview(),/sesión de revisión falló/);
  assert.equal(f.reviewer().state,'failed');assert.equal(f.current().state,'running');
  assert.equal(listLeases(f.db)[0].runId,f.implementer.id);
});
test('recovery review.start preserva implementación corregida activa y sus leases',async t=>{
  const f=await reviewFixture(t);await f.startReview();
  updateRun(f.db,f.implementer.id,{pollGeneration:1},{state:'running'});acquire(f.db,f.implementer.id,f.task.id,['Docs']);
  f.db.prepare("update commands set state='running' where id=?").run(f.reviewer().metadata.startCommandId!);
  recoverCommands(f.db);
  assert.equal(f.reviewer().state,'failed');assert.equal(f.current().state,'running');
  assert.equal(listLeases(f.db)[0].runId,f.implementer.id);
});
test('instrucción en envío invalida snapshot antes de esperar aceptación de terminal',async t=>{
  const f=await reviewFixture(t);await f.startReview();const send=f.ctx.orca.terminalSend;
  f.ctx.orca.terminalSend=async(handle,text)=>{
    if(text.includes('.nomos-inbox')) {
      f.output('NOMOS_REVIEW {"approved":true,"findings":[]}');await f.poll();
      assert.equal(requireTask(f.db,f.task.id).reviewApproved,0);
    }
    return send(handle,text);
  };
  await f.invoke('worker.send',{runId:f.implementer.id,text:'Corregir'});
  assert.equal(requireRun(f.db,f.implementer.id).state,'running');
});
for(const change of ['decision','cupo']) test(`revalida ${change} tras snapshot antes de recursos del revisor`,async t=>{
  const f=await reviewFixture(t);const diff=f.ctx.git.diff;let calls=0;
  f.ctx.git.diff=async(...args)=>{
    const result=await diff(...args);
    if(++calls===2) {
      if(change==='decision') openDecision(f.db,{taskId:f.task.id,reason:'Esperar',evidence:[],options:[{id:'ok',label:'Sí',description:'Seguir'}]});
      else writeFileSync(join(f.dataDir,'config.json'),'{"concurrency":{"codex":0}}');
    }
    return result;
  };
  const before=f.state().repos.length;await f.startReview();
  assert.equal(f.state().repos.length,before);assert.equal(f.reviewer(),undefined);
});
