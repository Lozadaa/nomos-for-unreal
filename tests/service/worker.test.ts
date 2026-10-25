import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './worker-fixture.ts';
import { getTask } from '../../service/src/repo/tasks.ts';
import { listEvents } from '../../service/src/store.ts';

test('start crea un worktree real y brief antes de arrancar Codex y conserva sesión/base',async t=>{
  const f=fixture(t);await f.start();
  const run=f.run();assert.ok(run,'start debe persistir el run');
  const tree=f.tree(), brief=readFileSync(join(tree.path,'.nomos-brief.md'),'utf8');
  assert.equal(run.state,'running');assert.equal(run.sessionRef,'term_fake');assert.equal(run.metadata.phase,'running');
  assert.equal(tree.id,`repo-1::${tree.path}`);assert.equal(tree.branch,`nomos/${f.task.id.slice(0,8)}`);
  assert.equal(tree.baseCommit,f.git('rev-parse','HEAD').trim());assert.equal(getTask(f.db,f.task.id)!.state,'implementando');
  assert.match(brief,/1\. Existe README/);assert.match(brief,/2\. Prueba verde/);assert.match(brief,/Docs/);
  assert.deepEqual(f.state().tail.slice(-1),['Lee el archivo .nomos-brief.md de esta carpeta y ejecuta lo que dice.']);
  assert.equal(f.db.prepare("select count(*) n from commands where type='worker.poll'").get()!.n,1);
  await assert.rejects(f.start(),/worker_exists/);assert.equal(f.state().creates,1);
  assert.match(f.git('status','--porcelain'),/\.nomos\//);
});
test('poll DONE válido mueve a revisando una vez sin aceptar ejemplos ni JSON incompleto',async t=>{
  const f=fixture(t);await f.start();const run=f.run();
  f.output('ejemplo NOMOS_DONE {"summary":"x","commits":[],"tests":"passed"}','NOMOS_DONE {"summary":"x"}');
  await f.invoke('worker.poll',{runId:run.id,generation:0});assert.equal(f.run().state,'running');
  f.output('NOMOS_DONE {"summary":"Implementado","commits":["abc"],"tests":"passed"}');
  await f.invoke('worker.poll',{runId:run.id,generation:0});
  assert.equal(f.run().state,'done');assert.equal(getTask(f.db,f.task.id)!.state,'revisando');
  await f.invoke('worker.poll',{runId:run.id,generation:0});
  assert.equal(listEvents(f.db,0).filter(e=>e.type==='run.finished').length,1);
});

test('ASK espera una sola vez y sigue sondeando con cursor inmóvil; nueva actividad retira espera',async t=>{
  const f=fixture(t);await f.start();const run=f.run();
  f.output('NOMOS_ASK {"question":"¿Qué color?"}');
  for(let i=0;i<3;i++) await f.invoke('worker.poll',{runId:run.id,generation:0});
  assert.equal(f.run().state,'running');assert.equal(f.run().metadata.waiting,true);
  assert.equal(listEvents(f.db,0).filter(e=>e.type==='worker.waiting').length,1);
  const polls=f.db.prepare("select not_before from commands where type='worker.poll' and not_before is not null").all();
  assert.equal(polls.length,4);assert.ok(polls.every(p=>Date.parse(p.not_before as string)>Date.now()-1000));
  f.output('Sigo trabajando');await f.invoke('worker.poll',{runId:run.id,generation:0});
  assert.equal(f.run().metadata.waiting,false);
});
test('poll conserva marcador fragmentado y drena páginas sin perder más de 50 líneas',async t=>{
  const f=fixture(t);await f.start();const run=f.run();
  f.output(...Array.from({length:60},(_,i)=>`salida ${i}`));
  await f.invoke('worker.poll',{runId:run.id,generation:0});await f.invoke('worker.poll',{runId:run.id,generation:0});
  const events=listEvents(f.db,0).filter(e=>e.type==='worker.output');
  assert.equal(events.flatMap(e=>e.payload.lines).filter(s=>String(s).startsWith('salida ')).length,60);
  assert.ok(events.every(e=>(e.payload.lines as string[]).length<=50));
  f.output('NOMOS_DONE {"summary":"Frag');await f.invoke('worker.poll',{runId:run.id,generation:0});
  f.output('mentado","commits":[],"tests":"none"}');await f.invoke('worker.poll',{runId:run.id,generation:0});
  assert.equal(f.run().summary,'Fragmentado');assert.equal(f.run().state,'done');
});
test('poll vence a las cuatro horas sin renovar plazo ni borrar el worktree',async t=>{
  const f=fixture(t);await f.start();const run=f.run();
  f.db.prepare('update runs set metadata=? where id=?').run(JSON.stringify({...run.metadata,deadlineAt:'2000-01-01T00:00:00.000Z'}),run.id);
  await assert.rejects(f.invoke('worker.poll',{runId:run.id,generation:0}),/orca:/);
  assert.equal(f.run().state,'failed');assert.match(getTask(f.db,f.task.id)!.blockedReason!,/^orca:/);
  assert.ok(readFileSync(join(f.tree().path,'.nomos-brief.md'),'utf8'));
});

test('idle actual tras seis polls vacíos con prompt al final emite waiting; Ask histórico ocupado no basta',async t=>{
  const f=fixture(t);await f.start();const run=f.run();f.output('› Ask Codex');
  for(let i=0;i<8;i++) await f.invoke('worker.poll',{runId:run.id,generation:0});
  assert.equal(listEvents(f.db,0).filter(e=>e.type==='worker.waiting').length,0);
  writeFileSync(f.file,JSON.stringify({...f.state(),idle:true}));
  for(let i=0;i<3;i++) await f.invoke('worker.poll',{runId:run.id,generation:0});
  assert.equal(listEvents(f.db,0).filter(e=>e.type==='worker.waiting').length,1);
  assert.equal(f.run().state,'running');assert.equal(f.run().metadata.waiting,true);
});

test('poll emite hueco explícito de cursor sin inventar líneas perdidas',async t=>{
  const f=fixture(t);await f.start();const run=f.run();
  writeFileSync(f.file,JSON.stringify({...f.state(),oldestCursor:'100'}));
  await f.invoke('worker.poll',{runId:run.id,generation:0});
  assert.equal(listEvents(f.db,0).filter(e=>e.type==='worker.output_gap').length,1);
});

test('hueco de cursor descarta marcador parcial del tramo perdido',async t=>{
  const f=fixture(t);await f.start();const run=f.run();
  f.output('NOMOS_DONE {"summary":"Par');await f.invoke('worker.poll',{runId:run.id,generation:0});
  writeFileSync(f.file,JSON.stringify({...f.state(),tail:['cial","commits":[],"tests":"passed"}'],oldestCursor:'100'}));
  await f.invoke('worker.poll',{runId:run.id,generation:0});assert.equal(f.run().state,'running');
});
