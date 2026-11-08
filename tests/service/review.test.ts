import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { reviewFixture } from './review-fixture.ts';
import { requireTask } from '../../service/src/repo/tasks.ts';
import { listArtifacts } from '../../service/src/repo/artifacts.ts';
import { listEvents } from '../../service/src/store.ts';
import { listLeases } from '../../service/src/leases.ts';

for(const checks of [false,true]) test(`Review Focus 3: aprobación ${checks ? 'con' : 'sin'} check:`,async t=>{
  const f=await reviewFixture(t,checks);await f.startReview();
  assert.notEqual(f.reviewer().id,f.implementer.id);assert.notEqual(f.reviewTree().path,f.implementerTree.path);
  assert.notEqual(f.reviewer().sessionRef,f.implementer.sessionRef);
  assert.equal(requireTask(f.db,f.task.id).worktreeId,f.implementerTree.id);
  assert.match(readFileSync(join(f.reviewTree().path,'.nomos-review/diff.patch'),'utf8'),/Resultado revisable/);
  assert.match(readFileSync(join(f.reviewTree().path,'.nomos-brief.md'),'utf8'),/NOMOS_REVIEW/);
  f.output('NOMOS_REVIEW {"approved":true,"findings":[]}');await f.poll();
  assert.equal(f.reviewer().state,'done');assert.equal(f.current().state,'done');
  assert.equal(requireTask(f.db,f.task.id).reviewApproved,1);
  // sin check: ni aprobación del usuario, se pide la integración al aprobar (antes esperaba 35 min al atasco)
  assert.equal(requireTask(f.db,f.task.id).state,checks ? 'probando' : 'integrando');
  assert.equal(f.db.prepare("select count(*) n from commands where type='integrate.run'").get()!.n,checks ? 0 : 1);
  const queued=f.db.prepare("select payload from commands where type='checks.run'").all().map(r=>JSON.parse(r.payload as string));
  assert.deepEqual(queued,checks ? [{taskId:f.task.id,runId:f.implementer.id}] : [],'al aprobar con check: se lanzan las comprobaciones');
  const artifact=listArtifacts(f.db,{runId:f.reviewer().id,kind:'report'})[0];assert.ok(artifact);
  assert.equal((artifact.provenance as any).label,'Revisión · informe');
  assert.deepEqual(JSON.parse(readFileSync(join(f.dataDir,'artifacts',artifact.path),'utf8')).findings,[]);
  assert.equal(listEvents(f.db,0).filter(e=>e.type==='review.finished').length,1);
  assert.equal(listEvents(f.db,0).find(e=>e.type==='review.started')?.payload.same_provider,true);
  await f.poll();assert.equal(listArtifacts(f.db,{kind:'report'}).length,1);
});

test('rechazo libera revisor y envía findings al mismo implementador con reserva',async t=>{
  const f=await reviewFixture(t);f.db.prepare('update tasks set leases=? where id=?').run('["Docs"]',f.task.id);
  await f.startReview();assert.equal(listLeases(f.db).length,0);
  f.output('NOMOS_REVIEW {"approved":false,"findings":[{"file":"resultado.md","line":1,"severity":"error","note":"Falta prueba"}]}');await f.poll();
  assert.equal(f.reviewer().state,'done');assert.equal(requireTask(f.db,f.task.id).state,'implementando');
  const row=f.db.prepare("select payload from commands where type='worker.send'").get()!;
  const payload=JSON.parse(row.payload as string);assert.equal(payload.runId,f.implementer.id);assert.match(payload.text,/Falta prueba/);
  await f.invoke('worker.send',payload);assert.equal(f.current().state,'running');assert.equal(f.current().metadata.correctionCount,1);
  assert.equal(listLeases(f.db)[0].runId,f.implementer.id);
});

test('REVIEW mal formado espera con línea; DONE y ejemplos no aprueban',async t=>{
  const f=await reviewFixture(t);await f.startReview();
  const malformed='NOMOS_REVIEW {"approved":"yes","findings":[]}';
  f.output('```json','NOMOS_REVIEW {"approved":true,"findings":[]}','```',
    'NOMOS_DONE {"summary":"No revisar","commits":[],"tests":"passed"}',malformed);await f.poll();
  assert.equal(f.reviewer().state,'running');assert.equal(f.reviewer().metadata.waiting,true);
  assert.equal(listEvents(f.db,0).filter(e=>e.type==='worker.waiting').at(-1)?.payload.question,malformed);
  assert.equal(requireTask(f.db,f.task.id).reviewApproved,0);
});

test('aprobación atrasada no aprueba diff modificado y queda informe auditable',async t=>{
  const f=await reviewFixture(t);await f.startReview();
  writeFileSync(join(f.implementerTree.path,'resultado.md'),'Cambiado después\n');
  f.output('NOMOS_REVIEW {"approved":true,"findings":[]}');await f.poll();
  assert.equal(requireTask(f.db,f.task.id).reviewApproved,0);
  assert.equal(listEvents(f.db,0).find(e=>e.type==='review.finished')?.payload.stale,true);
});
test('snapshot detecta cambio binario del mismo tamaño sin incluir binario en diff.patch',async t=>{
  const f=await reviewFixture(t);const binary=join(f.implementerTree.path,'asset.bin');
  writeFileSync(binary,Buffer.from([0,1,2,3]));await f.startReview();
  assert.doesNotMatch(readFileSync(join(f.reviewTree().path,'.nomos-review/diff.patch'),'utf8'),/asset.bin|GIT binary/);
  writeFileSync(binary,Buffer.from([0,3,2,1]));
  f.output('NOMOS_REVIEW {"approved":true,"findings":[]}');await f.poll();
  assert.equal(requireTask(f.db,f.task.id).reviewApproved,0);
  assert.equal(listEvents(f.db,0).find(e=>e.type==='review.finished')?.payload.stale,true);
});

test('ASK revisor usa su sesión sin leases ni transición implementación; terminado no se reactiva',async t=>{
  const f=await reviewFixture(t);await f.startReview();
  f.db.prepare('update tasks set leases=? where id=?').run('["Docs"]',f.task.id);
  await f.invoke('worker.send',{runId:f.reviewer().id,text:'Inspeccionar el diff adjunto'});
  assert.equal(listLeases(f.db).length,0);assert.equal(requireTask(f.db,f.task.id).state,'revisando');
  f.output('NOMOS_REVIEW {"approved":true,"findings":[]}');await f.poll();
  await assert.rejects(f.invoke('worker.send',{runId:f.reviewer().id,text:'Otra revisión'}),/invalid_worker_state/);
});
