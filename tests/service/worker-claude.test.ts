import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './worker-fixture.ts';
import { listEvents } from '../../service/src/store.ts';
import { requireTask } from '../../service/src/repo/tasks.ts';
import { skillsForRole } from '../../service/src/skills.ts';

const start=(f:ReturnType<typeof fixture>,provider='claude')=>f.invoke('worker.start',
  {taskId:f.task.id,provider,role:'implementacion',skills:['tdd','qa']});
const poll=(f:ReturnType<typeof fixture>)=>f.invoke('worker.poll',{runId:f.run().id});

test('Claude arranca con fake+Git, atribuye proveedor y skills esperadas, permiso y DONE',async t=>{
  const f=fixture(t,{FAKE_ORCA_MODE:'claude'}),create=f.ctx.orca.worktreeCreate,wait=f.ctx.orca.terminalWaitIdle;
  f.ctx.orca.worktreeCreate=async(...args)=>{assert.equal(args[2],'claude');return create(...args);};
  f.ctx.orca.terminalWaitIdle=async(...args)=>{assert.ok(args[2]?.test('bypass permissions'));return wait(...args);};
  await start(f);const run=f.run();assert.equal(run.provider,'claude');
  assert.deepEqual(run.skills,['tdd','qa',...skillsForRole('implementacion','qa')]);
  const brief=readFileSync(join(f.tree().path,'.kratos-brief.md'),'utf8');
  assert.match(brief,/Carga las skills/);assert.match(brief,/tdd, qa/);assert.match(brief,/primera línea.*KRATOS_SKILLS/);
  assert.deepEqual(f.state().tail.slice(0,2),['claude --model sonnet --dangerously-skip-permissions','bypass permissions on']);
  const before=f.state().tail.length;
  await poll(f);assert.equal(f.run().metadata.waiting,true);
  assert.equal(f.run().metadata.question,'Do you want to allow this command? (y/n)');
  const event=listEvents(f.db,0).find(e=>e.type==='worker.waiting')!;
  assert.equal(event.payload.question,f.run().metadata.question);assert.equal(event.payload.provider,'claude');
  await poll(f);assert.equal(listEvents(f.db,0).filter(e=>e.type==='worker.waiting').length,1);
  assert.equal(f.state().tail.length,before,'El servicio nunca responde automáticamente al permiso');
  f.output('KRATOS_DONE {"summary":"Implementado","commits":[],"tests":"passed"}');await poll(f);
  assert.equal(f.run().state,'done');assert.equal(requireTask(f.db,f.task.id).state,'revisando');
  assert.equal(f.run().metadata.confirmedSkills,undefined);
  assert.equal(listEvents(f.db,0).some(e=>e.type==='worker.skills_missing'),false);
  assert.ok(listEvents(f.db,0).filter(e=>['run.started','worker.output','worker.waiting','run.finished'].includes(e.type))
    .every(e=>e.payload.provider==='claude'));
});
test('Claude detecta permiso y marcadores con viñetas en source screen sin alterar cursor',async t=>{
  const f=fixture(t,{FAKE_ORCA_MODE:'claude'});await start(f);await poll(f);const cursor=f.run().metadata.cursor;
  const screen=(lines:string[])=>writeFileSync(f.file,JSON.stringify({...f.state(),screen:lines,screenCursor:'999'}));
  screen(['⏺ Allow this action?']);await poll(f);assert.equal(f.run().metadata.question,'⏺ Allow this action?');
  await poll(f);assert.equal(listEvents(f.db,0).filter(e=>e.type==='worker.waiting').length,2);
  screen(['⏺ KRATOS_ASK {"question":"¿Qué', '  ⎿ color?"}']);await poll(f);
  assert.equal(f.run().metadata.question,'¿Qué color?');assert.equal(f.run().metadata.cursor,cursor);
  screen(['● KRATOS_DONE {"summary":"Listo",','  "commits":[],"tests":"none"}']);await poll(f);
  assert.equal(f.run().state,'done');assert.equal(f.run().summary,'Listo');
});
test('espera idle de Claude nombra el proveedor real',async t=>{
  const f=fixture(t,{FAKE_ORCA_MODE:'claude'});await start(f);await poll(f);
  f.output('Trabajando');await poll(f);writeFileSync(f.file,JSON.stringify({...f.state(),idle:true}));
  await poll(f);await poll(f);assert.match(f.run().metadata.question!,/claude/i);
});
test('proveedor desconocido no arranca',async t=>{
  await assert.rejects(start(fixture(t),'otro'),/invalid_worker_payload/);
});
test('respuesta y stop Claude conservan sesión y atribuyen mensajes y cierre',async t=>{
  const f=fixture(t,{FAKE_ORCA_MODE:'claude'});await start(f);await poll(f);const original=f.run();
  await f.invoke('worker.send',{runId:original.id,text:'Respuesta autorizada por el director'});
  assert.equal(f.run().provider,'claude');assert.equal(f.run().sessionRef,original.sessionRef);
  assert.equal(f.run().id,original.id);assert.equal(f.run().metadata.correctionCount,0);
  assert.equal(listEvents(f.db,0).find(e=>e.type==='worker.message_sent')?.payload.provider,'claude');
  await f.invoke('worker.stop',{runId:original.id});assert.equal(f.run().state,'cancelled');
  assert.match(f.run().summary!,/claude/i);assert.equal(f.state().creates,1);
});
