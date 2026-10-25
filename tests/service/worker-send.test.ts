import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fixture } from './worker-fixture.ts';
import { getTask } from '../../service/src/repo/tasks.ts';
import { listEvents } from '../../service/src/store.ts';
// hito 18: tras una corrección, el NOMOS_DONE con commits declarados exige un commit posterior al envío
const work=(f:ReturnType<typeof fixture>,cycle:number)=>{const tree=f.tree().path;writeFileSync(join(tree,`ciclo${cycle}.txt`),String(cycle));
  for(const args of [['add','.'],['commit','-m',`Ciclo ${cycle}`]]) execFileSync('git',['-C',tree,...args],{windowsHide:true});};
const done=(cycle=0)=>`NOMOS_DONE {"summary":"Listo ${cycle}","commits":["commit${cycle}"],"tests":"passed"}`;
test('send guarda texto multilínea y reactiva el mismo run/sesión/tree invalidando polls antiguos',async t=>{
  const f=fixture(t);await f.start();const original=f.run();
  f.output(done());await f.invoke('worker.poll',{runId:original.id,generation:0});
  const deadline=f.run().metadata.deadlineAt;
  const text='Primera línea "literal"\nSegunda $(sin ejecutar)';
  await f.invoke('worker.send',{runId:original.id,text},'correction');
  const sent=listEvents(f.db,0).find(e=>e.type==='worker.message_sent');assert.ok(sent,'send debe registrar entrega');
  const message=sent.payload;
  assert.equal(readFileSync(join(f.tree().path,message.path as string),'utf8'),text);
  assert.match(f.state().tail.at(-1),/^Lee el archivo \.nomos-inbox\/[a-f0-9-]+\.md y ejecuta lo que dice\.$/);
  // worktrees de antes del hito 11: su info/exclude solo conoce la bandeja con el nombre anterior; la carpeta se ignora sola
  assert.equal(readFileSync(join(f.tree().path,'.nomos-inbox','.gitignore'),'utf8'),'*\n');
  assert.equal(f.run().id,original.id);assert.equal(f.run().sessionRef,original.sessionRef);assert.equal(f.state().creates,1);
  assert.equal(f.run().state,'running');assert.equal(f.run().finishedAt,null);assert.equal(f.run().summary,null);
  assert.equal(f.run().metadata.correctionCount,1);assert.equal(f.run().metadata.deadlineAt,deadline);
  assert.equal(getTask(f.db,f.task.id)!.state,'implementando');
  work(f,1);f.output(done(1));await f.invoke('worker.poll',{runId:original.id,generation:0});assert.equal(f.run().state,'running');
  await f.invoke('worker.poll',{runId:original.id,generation:1});assert.equal(f.run().state,'done');
  assert.equal(listEvents(f.db,0).filter(e=>e.type==='run.started').length,1);
});
test('respuesta a ASK no consume corrección; stop cancela seguimiento conservando archivos',async t=>{
  const f=fixture(t);await f.start();const run=f.run();
  f.output('NOMOS_ASK {"question":"¿Sí?"}');await f.invoke('worker.poll',{runId:run.id,generation:0});
  await f.invoke('worker.send',{runId:run.id,text:'Sí'});assert.equal(f.run().metadata.correctionCount,0);
  await f.invoke('worker.stop',{runId:run.id});assert.equal(f.run().state,'cancelled');
  assert.ok(existsSync(join(f.tree().path,'.nomos-brief.md')));
  f.output(done());await f.invoke('worker.poll',{runId:run.id,generation:1});assert.equal(f.run().state,'cancelled');
  await assert.rejects(f.invoke('worker.send',{runId:run.id,text:'Otra'}),/invalid_worker_state/);
});
test('cuarta corrección abre Decisión resoluble antes de escribir/enviar',async t=>{
  const f=fixture(t);await f.start();const run=f.run();
  for(let i=0;i<3;i++) {
    if(i) work(f,i);f.output(done(i));await f.invoke('worker.poll',{runId:run.id,generation:i});
    await f.invoke('worker.send',{runId:run.id,text:'Corregir '+i});
  }
  work(f,3);f.output(done(3));await f.invoke('worker.poll',{runId:run.id,generation:3});const before=f.state().tail.length;
  await f.invoke('worker.send',{runId:run.id,text:'Cuarta'});
  assert.equal(f.state().tail.length,before);assert.equal(f.run().metadata.correctionCount,3);
  const task=getTask(f.db,f.task.id)!;assert.ok(task.decisionId);
  assert.match(task.blockedReason!,/correcciones/);
});
