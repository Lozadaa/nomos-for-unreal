import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { reviewFixture } from './review-fixture.ts';
import { createTask, requireTask } from '../../service/src/repo/tasks.ts';
import { updateRun } from '../../service/src/repo/worker.ts';
import { openDecision } from '../../service/src/repo/decisions.ts';
import { enqueue } from '../../service/src/commands.ts';
import { streamMarkers, screenMarkers } from '../../service/src/handlers/worker-markers.ts';

test('REVIEW fragmentado se ensambla y JSON inválido incompleto espera con línea',()=>{
  const first=streamMarkers(['KRATOS_REVIEW {"approved":tr'],'');
  const next=streamMarkers(['ue,"findings":[]}'],first.buffer,first.fence);
  assert.deepEqual(next.found,[{kind:'REVIEW',approved:true,findings:[]}]);
  const malformed='KRATOS_REVIEW {"approved":';
  assert.equal(streamMarkers([malformed],'').found[0]?.kind,'INVALID_REVIEW');
  assert.equal((streamMarkers([malformed],'').found[0] as any)?.question,malformed);
  assert.deepEqual(screenMarkers(['• KRATOS_REVIEW {"approved":true,','  "findings":[]}']),
    [{kind:'REVIEW',approved:true,findings:[]}]);
});
test('revisor respeta cupo reservado FIFO sin bloquear toda la tarea',async t=>{
  const f=await reviewFixture(t);writeFileSync(join(f.dataDir,'config.json'),'{"concurrency":{"codex":1}}');
  const other=createTask(f.db,{title:'Anterior',area:'qa'});
  enqueue(f.db,'worker.start',{taskId:other.id,provider:'codex',role:'implementacion',skills:[],attempt:1},'earlier');
  const result=await f.startReview();assert.deepEqual(result,{deferred:true,reason:'Sin hueco en codex'});
  assert.equal(f.reviewer(),undefined);assert.equal(requireTask(f.db,f.task.id).blockedReason,null);
});
test('Decisión pendiente impide crear revisor antes de recursos',async t=>{
  const f=await reviewFixture(t);const before=f.state().creates;
  const decision=openDecision(f.db,{taskId:f.task.id,reason:'Esperar',evidence:[],options:[{id:'ok',label:'Sí',description:'Seguir'}]});
  assert.deepEqual(await f.startReview(),{policyBlocked:true,decisionId:decision.id});
  assert.equal(f.state().creates,before);
});
test('rechazo respeta máximo de correcciones del mismo implementador',async t=>{
  const f=await reviewFixture(t);updateRun(f.db,f.implementer.id,{correctionCount:3});await f.startReview();
  f.output('KRATOS_REVIEW {"approved":false,"findings":[{"file":"x","line":1,"severity":"error","note":"Corregir"}]}');
  await f.poll();const row=f.db.prepare("select payload from commands where type='worker.send'").get()!;
  const before=f.state().tail.length;await f.invoke('worker.send',JSON.parse(row.payload as string));
  assert.equal(f.current().state,'done');assert.equal(f.reviewer().state,'done');assert.equal(f.state().tail.length,before);
  assert.ok(requireTask(f.db,f.task.id).decisionId);
});
test('nueva generación del mismo implementador permite otro run, repetir generación no crea otro',async t=>{
  const f=await reviewFixture(t);await f.startReview();const first=f.reviewer();
  f.output('KRATOS_REVIEW {"approved":false,"findings":[{"file":"x","line":1,"severity":"error","note":"Corregir"}]}');await f.poll();
  const row=f.db.prepare("select id,payload from commands where type='worker.send'").get()!;
  f.db.prepare("update commands set state='done' where id=?").run(row.id);
  await f.invoke('worker.send',JSON.parse(row.payload as string));
  f.output('KRATOS_DONE {"summary":"Corregido","commits":[],"tests":"passed"}');
  await f.invoke('worker.poll',{runId:f.implementer.id,generation:f.current().metadata.pollGeneration});
  await f.startReview();const second=f.reviewer();assert.notEqual(first.id,second.id);
  assert.notEqual(first.metadata.review?.generation,second.metadata.review?.generation);
  assert.equal(second.metadata.review?.implementerRunId,f.implementer.id);
  const before=f.state().creates;await f.startReview();assert.equal(f.state().creates,before);
  assert.equal(f.reviewer().id,second.id);
});
