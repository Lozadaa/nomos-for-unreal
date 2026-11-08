import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { reviewFixture } from './review-fixture.ts';
import { createTask, requireTask } from '../../service/src/repo/tasks.ts';
import { updateRun } from '../../service/src/repo/worker.ts';
import { openDecision } from '../../service/src/repo/decisions.ts';
import { enqueue } from '../../service/src/commands.ts';
import { streamMarkers, screenMarkers } from '../../service/src/handlers/worker-markers.ts';

test('REVIEW fragmentado se ensambla y JSON inválido incompleto espera con línea',()=>{
  const first=streamMarkers(['NOMOS_REVIEW {"approved":tr'],'');
  const next=streamMarkers(['ue,"findings":[]}'],first.buffer,first.fence);
  assert.deepEqual(next.found,[{kind:'REVIEW',approved:true,findings:[]}]);
  const malformed='NOMOS_REVIEW {"approved":';
  assert.equal(streamMarkers([malformed],'').found[0]?.kind,'INVALID_REVIEW');
  assert.equal((streamMarkers([malformed],'').found[0] as any)?.question,malformed);
  assert.deepEqual(screenMarkers(['• NOMOS_REVIEW {"approved":true,','  "findings":[]}']),
    [{kind:'REVIEW',approved:true,findings:[]}]);
});
// tiempo muerto: el revisor tiene cupo propio (`concurrency.revisor`, 1): no espera detrás de un implementador en cola
test('el revisor no espera a un implementador en cola; sin cupo de revisor espera sin bloquear la tarea',async t=>{
  const f=await reviewFixture(t);writeFileSync(join(f.dataDir,'config.json'),'{"concurrency":{"codex":1,"revisor":0}}');
  const other=createTask(f.db,{title:'Anterior',area:'qa'});
  enqueue(f.db,'worker.start',{taskId:other.id,provider:'codex',role:'implementacion',skills:[],attempt:1},'earlier');
  const result=await f.startReview();assert.deepEqual(result,{deferred:true,reason:'Sin hueco para revisar'});
  assert.equal(f.reviewer(),undefined);assert.equal(requireTask(f.db,f.task.id).blockedReason,null);
  writeFileSync(join(f.dataDir,'config.json'),'{"concurrency":{"codex":1}}');
  await f.startReview();assert.equal(f.reviewer()?.provider,'codex','arranca aunque el implementador anterior siga en cola');
});
test('Decisión pendiente impide crear revisor antes de recursos',async t=>{
  const f=await reviewFixture(t);const before=f.state().creates;
  const decision=openDecision(f.db,{taskId:f.task.id,reason:'Esperar',evidence:[],options:[{id:'ok',label:'Sí',description:'Seguir'}]});
  assert.deepEqual(await f.startReview(),{policyBlocked:true,decisionId:decision.id});
  assert.equal(f.state().creates,before);
});
test('rechazo respeta máximo de correcciones del mismo implementador',async t=>{
  const f=await reviewFixture(t);updateRun(f.db,f.implementer.id,{correctionCount:3});await f.startReview();
  f.output('NOMOS_REVIEW {"approved":false,"findings":[{"file":"x","line":1,"severity":"error","note":"Corregir"}]}');
  await f.poll();const row=f.db.prepare("select payload from commands where type='worker.send'").get()!;
  const before=f.state().tail.length;await f.invoke('worker.send',JSON.parse(row.payload as string));
  assert.equal(f.current().state,'done');assert.equal(f.reviewer().state,'done');assert.equal(f.state().tail.length,before);
  assert.ok(requireTask(f.db,f.task.id).decisionId);
});
test('nueva generación del mismo implementador permite otro run, repetir generación no crea otro',async t=>{
  const f=await reviewFixture(t);await f.startReview();const first=f.reviewer();
  f.output('NOMOS_REVIEW {"approved":false,"findings":[{"file":"x","line":1,"severity":"error","note":"Corregir"}]}');await f.poll();
  const row=f.db.prepare("select id,payload from commands where type='worker.send'").get()!;
  f.db.prepare("update commands set state='done' where id=?").run(row.id);
  await f.invoke('worker.send',JSON.parse(row.payload as string));
  f.output('NOMOS_DONE {"summary":"Corregido","commits":[],"tests":"passed"}');
  await f.invoke('worker.poll',{runId:f.implementer.id,generation:f.current().metadata.pollGeneration});
  await f.startReview();const second=f.reviewer();assert.notEqual(first.id,second.id);
  assert.notEqual(first.metadata.review?.generation,second.metadata.review?.generation);
  assert.equal(second.metadata.review?.implementerRunId,f.implementer.id);
  const before=f.state().creates;await f.startReview();assert.equal(f.state().creates,before);
  assert.equal(f.reviewer().id,second.id);
});
test('hito 5b: si el director sube limits.corrections, el bloqueo del límite ya alcanzado se levanta y la corrección llega',async t=>{
  const f=await reviewFixture(t);updateRun(f.db,f.implementer.id,{correctionCount:3});await f.startReview();
  f.output('NOMOS_REVIEW {"approved":false,"findings":[{"file":"x","line":1,"severity":"error","note":"Corregir"}]}');
  await f.poll();const row=f.db.prepare("select payload from commands where type='worker.send'").get()!;
  await f.invoke('worker.send',JSON.parse(row.payload as string));
  const decision=requireTask(f.db,f.task.id).decisionId!;
  const {resolveDecision}=await import('../../service/src/repo/decisions.ts');
  resolveDecision(f.db,decision,'cancel','director');
  await f.invoke('worker.send',JSON.parse(row.payload as string));
  assert.equal(requireTask(f.db,f.task.id).blockedReason,'Máximo de tres correcciones alcanzado','cancelada y con el límite en 3 sigue bloqueada');
  writeFileSync(join(f.dataDir,'config.json'),JSON.stringify({concurrency:{codex:2,claude:0},limits:{corrections:5}}));
  await f.invoke('worker.send',JSON.parse(row.payload as string));
  assert.equal(requireTask(f.db,f.task.id).blockedReason,null);
  assert.equal(f.current().state,'running');assert.equal(f.current().metadata.correctionCount,4);
});

// experimento metras 2026-11-08: «Revisar» tras el máximo dejaba la tarea colgada hasta subir limits.corrections
test('«Revisar» en el máximo de correcciones permite una más a esa tarea y reenvía sola la corrección parada',async t=>{
  const f=await reviewFixture(t);updateRun(f.db,f.implementer.id,{correctionCount:3});await f.startReview();
  f.output('NOMOS_REVIEW {"approved":false,"findings":[{"file":"x","line":1,"severity":"error","note":"Corregir"}]}');
  await f.poll();const row=f.db.prepare("select id,payload from commands where type='worker.send'").get()!;
  f.db.prepare("update commands set state='done' where id=?").run(row.id);
  const blocked=await f.invoke('worker.send',JSON.parse(row.payload as string),'parada') as any;
  const decision=requireTask(f.db,f.task.id).decisionId!;
  assert.deepEqual(blocked,{policyBlocked:true,decisionId:decision});
  const {resolveDecision}=await import('../../service/src/repo/decisions.ts');
  const {sweepStalls}=await import('../../service/src/stall.ts');
  resolveDecision(f.db,decision,'review','director');
  await sweepStalls(f.ctx);
  assert.equal(f.db.prepare("select state from commands where idempotency_key='parada'").get()!.state,'pending','la corrección parada vuelve a la cola');
  await f.invoke('worker.send',JSON.parse(row.payload as string));
  assert.equal(requireTask(f.db,f.task.id).blockedReason,null);
  assert.equal(f.current().state,'running');assert.equal(f.current().metadata.correctionCount,4);
  assert.equal(JSON.parse(readFileSync(join(f.dataDir,'config.json'),'utf8')).limits,undefined,'la config global no cambia');
});
test('sin persona (director por eventos), el máximo tras una revisión se acepta solo al minuto y la tarea se integra con los hallazgos anotados',async t=>{
  const f=await reviewFixture(t);updateRun(f.db,f.implementer.id,{correctionCount:3});
  writeFileSync(join(f.dataDir,'config.json'),JSON.stringify({concurrency:{codex:2,claude:0},director:{mode:'evento'}}));
  await f.startReview();
  f.output('NOMOS_REVIEW {"approved":false,"findings":[{"file":"x","line":1,"severity":"menor","note":"Nombre poco claro"}]}');
  await f.poll();const row=f.db.prepare("select id,payload from commands where type='worker.send'").get()!;
  f.db.prepare("update commands set state='done' where id=?").run(row.id);
  await f.invoke('worker.send',JSON.parse(row.payload as string),'parada');
  const {listDecisions}=await import('../../service/src/repo/decisions.ts');
  const {sweepAutoDecisions}=await import('../../service/src/decisiones-auto.ts');
  const {sweepStalls}=await import('../../service/src/stall.ts');
  const {readConfig}=await import('../../service/src/config.ts');
  const [decision]=listDecisions(f.db,'open');
  assert.deepEqual(decision.options.map(o=>o.id),['review','aceptar','cancel']);
  assert.equal(sweepAutoDecisions(f.db,readConfig(f.dataDir),Date.parse(decision.createdAt)+60_000),1);
  assert.equal(listDecisions(f.db,'resolved')[0].chosenOptionId,'aceptar');
  await sweepStalls(f.ctx);
  const task=requireTask(f.db,f.task.id);
  assert.equal(task.reviewApproved,1);assert.equal(task.state,'integrando');
  assert.ok(f.db.prepare("select 1 from commands where type='integrate.run'").get(),'integración pedida');
  const note=f.db.prepare("select payload from events where type='review.accepted_with_findings'").get()!;
  assert.match(JSON.parse(note.payload as string).findings,/Nombre poco claro/);
  assert.equal(f.db.prepare("select state from commands where idempotency_key='parada'").get()!.state,'done','la corrección no se envía');
});
