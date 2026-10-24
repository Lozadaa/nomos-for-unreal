import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './worker-fixture.ts';
import { createOrca } from '../../service/src/adapters/orca.ts';
import { updateRun } from '../../service/src/repo/worker.ts';
import { requireTask } from '../../service/src/repo/tasks.ts';
import { enqueue } from '../../service/src/commands.ts';
import { startRunner } from '../../service/src/runner.ts';
import { listEvents } from '../../service/src/store.ts';
import { until } from '../cli-helpers.ts';

test('hang local IsIdle falla comando, bloquea tarea y no encola otro poll',async t=>{
  const f=fixture(t);await f.start();
  const hanging=createOrca({...f.orcaOptions,timeoutMs:100,env:{...f.orcaOptions.env,FAKE_ORCA_HANG:'1'}});
  f.ctx.orca.terminalRead=async()=>({text:'',cursor:'0',source:'stream'});
  f.ctx.orca.terminalIsIdle=hanging.terminalIsIdle;
  updateRun(f.db,f.run().id,{idlePolls:1});
  f.db.prepare("delete from commands where type='worker.poll'").run();
  const cmd=enqueue(f.db,'worker.poll',{runId:f.run().id},'hang-poll');
  const stop=startRunner(f.db,f.handlers,{intervalMs:5,context:f.ctx});
  try {
    await until(async()=>f.db.prepare('select state from commands where id=?').get(cmd.id)!.state!=='pending'
      && f.db.prepare('select state from commands where id=?').get(cmd.id)!.state!=='running');
    assert.equal(f.db.prepare('select state from commands where id=?').get(cmd.id)!.state,'failed');
    assert.match(requireTask(f.db,f.task.id).blockedReason!,/^orca: timeout:/);
    assert.equal(f.run().state,'failed');
    assert.equal(f.db.prepare("select count(*) n from commands where state='pending'").get()!.n,0);
  } finally {stop();await stop.drained;}
});

test('fence de stream atraviesa polls, envío y reinicio sin terminar por ejemplo',async t=>{
  const f=fixture(t);await f.start();
  const poll=()=>f.invoke('worker.poll',{runId:f.run().id,generation:f.run().metadata.pollGeneration ?? 0});
  f.output('````text');await poll();
  await f.invoke('worker.send',{runId:f.run().id,text:'Sigue'});
  f.output('```','~~~~','````con sufijo','NOMOS_DONE {"summary":"Ejemplo","commits":[],"tests":"none"}');
  await poll();
  assert.equal(f.run().state,'running');assert.equal(listEvents(f.db,0).filter(e=>e.type==='run.finished').length,0);
  // A fresh runner reloads the persisted stream state before the next page.
  f.db.prepare("delete from commands where type='worker.poll' and state='pending'").run();
  f.output('`````','NOMOS_DO');await poll();
  f.output('NE {"summary":"Real","commits":[],"tests":"passed"}');
  enqueue(f.db,'worker.poll',{runId:f.run().id,generation:f.run().metadata.pollGeneration},'after-restart');
  const stop=startRunner(f.db,f.handlers,{intervalMs:5,context:f.ctx});
  try {await until(async()=>f.run().state==='done');assert.equal(f.run().summary,'Real');}
  finally {stop();await stop.drained;}
  assert.equal(listEvents(f.db,0).filter(e=>e.type==='run.finished').length,1);
});

test('envío invalida fragmento DONE anterior y exige marcador completo nuevo',async t=>{
  const f=fixture(t);await f.start();
  f.output('NOMOS_DO');
  await f.invoke('worker.poll',{runId:f.run().id,generation:0});
  await f.invoke('worker.send',{runId:f.run().id,text:'Nueva instrucción'});
  let reads=0;
  f.ctx.orca.terminalRead=async()=>({text:++reads===1
    ? 'NE {"summary":"Anterior","commits":[],"tests":"passed"}'
    : 'NOMOS_DONE {"summary":"Nuevo","commits":[],"tests":"passed"}',cursor:String(99+reads),source:'stream'});
  await f.invoke('worker.poll',{runId:f.run().id,generation:0});assert.equal(reads,0);
  const generation=f.run().metadata.pollGeneration;
  await f.invoke('worker.poll',{runId:f.run().id,generation});
  assert.equal(f.run().state,'running');assert.equal(listEvents(f.db,0).filter(e=>e.type==='run.finished').length,0);
  await f.invoke('worker.poll',{runId:f.run().id,generation});
  assert.equal(f.run().state,'done');assert.equal(f.run().summary,'Nuevo');
});

test('send no convierte ejemplo cercado en DONE visto si lastLines perdió apertura',async t=>{
  const f=fixture(t);await f.start();
  const marker='NOMOS_DONE {"summary":"Luego real","commits":[],"tests":"passed"}';
  f.output('```text',...Array.from({length:25},()=>'- texto'),marker,'```');
  await f.invoke('worker.poll',{runId:f.run().id,generation:0});
  assert.equal(f.run().state,'running');
  await f.invoke('worker.send',{runId:f.run().id,text:'Continúa'});
  f.output(marker);await f.invoke('worker.poll',{runId:f.run().id,generation:f.run().metadata.pollGeneration});
  assert.equal(f.run().state,'done');assert.equal(f.run().summary,'Luego real');
});
