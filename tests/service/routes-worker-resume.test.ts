import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { fixture } from './worker-fixture.ts';
import { createServer } from '../../service/src/server.ts';
import { startRunner } from '../../service/src/runner.ts';
import { ensureBudget } from '../../service/src/repo/budget.ts';
import { listDecisions } from '../../service/src/repo/decisions.ts';
import { moveTask } from '../../service/src/repo/tasks.ts';
import { listEvents } from '../../service/src/store.ts';
import { startRun, finishRun } from '../../service/src/repo/runs.ts';
import { until } from '../cli-helpers.ts';

async function setup(t:any) {
  const f=fixture(t);moveTask(f.db,f.task.id,'preparada');
  ensureBudget(f.db,'workspace','game',{tokens:1000});
  const server=createServer(f.db,'secret','service/web',f.dataDir);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const post=async(path:string,data:object)=>{
    const response=await fetch(base+path,{method:'POST',headers:{Authorization:'Bearer secret'},body:JSON.stringify(data)});
    assert.ok(response.ok,await response.clone().text());return response.json();
  };
  const start=(role='original')=>post(`/tasks/${f.task.id}/worker`,{provider:'codex',role,skills:['tdd'],attempt:1});
  const runner=startRunner(f.db,f.handlers,{intervalMs:5,context:f.ctx});
  const commandState=(id:string)=>f.db.prepare('select * from commands where id=?').get(id)!;
  const finish=(id:string)=>until(async()=>['done','failed'].includes(String(commandState(id).state)));
  const close=async()=>{runner();await runner.drained;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));};
  return {...f,post,start,commandState,finish,close};
}

test('POST aprobado reanuda mismo intento/comando una vez con payload original y un solo árbol',async t=>{
  const f=await setup(t);
  try {
    const first=await f.start();await f.finish(first.commandId);
    const decision=listDecisions(f.db,'open')[0];assert.ok(decision);assert.equal(f.run(),undefined);
    assert.deepEqual(await f.start(),first);assert.equal(f.commandState(first.commandId).state,'done');
    await f.post(`/decisions/${decision.id}/resolve`,{optionId:'approve',by:'director'});
    assert.equal(f.run(),undefined);
    const results=await Promise.all([f.start('replacement'),f.start('replacement')]);
    assert.deepEqual(results,[first,first]);
    await until(async()=>!!f.run());await f.finish(first.commandId);
    assert.equal(f.commandState(first.commandId).state,'done');assert.equal(f.commandState(first.commandId).attempts,2);
    assert.equal(f.run().role,'original');assert.equal(f.run().state,'running');assert.equal(f.state().creates,1);
    assert.equal(f.db.prepare('select count(*) n from runs').get()!.n,1);
    assert.equal(listDecisions(f.db).length,1);
    assert.deepEqual(await f.start(),first);assert.equal(f.state().creates,1);
    assert.equal(listEvents(f.db,0).filter(e=>e.type==='command.pending'&&e.payload.resumed===true).length,1);
  } finally {await f.close();}
});

test('POST repetido no reactiva arranque failed con recursos inciertos',async t=>{
  const f=await setup(t);
  try {
    const first=await f.start();await f.finish(first.commandId);
    const decision=listDecisions(f.db,'open')[0];
    await f.post(`/decisions/${decision.id}/resolve`,{optionId:'approve',by:'director'});
    f.ctx.orca.terminalSend=async()=>{throw new (await import('../../service/src/adapters/orca.ts')).OrcaError('timeout','hang','process');};
    await f.start();await until(async()=>!!f.run());await f.finish(first.commandId);
    assert.equal(f.commandState(first.commandId).state,'failed');assert.equal(f.run().metadata.uncertain,true);
    assert.deepEqual(await f.start(),first);assert.equal(f.commandState(first.commandId).state,'failed');
    assert.equal(f.state().creates,1);assert.equal(f.db.prepare('select count(*) n from runs').get()!.n,1);
  } finally {await f.close();}
});

test('POST sin etiqueta durable no reactiva done aunque exista decisión resuelta',async t=>{
  const f=await setup(t);
  try {
    const first=await f.start();await f.finish(first.commandId);
    const decision=listDecisions(f.db,'open')[0];
    await f.post(`/decisions/${decision.id}/resolve`,{optionId:'approve',by:'director'});
    f.db.prepare("update events set payload=json_remove(payload,'$.result') where type='command.done'").run();
    assert.deepEqual(await f.start(),first);assert.equal(f.commandState(first.commandId).state,'done');
    assert.equal(f.run(),undefined);assert.equal(f.state().creates,undefined);
  } finally {await f.close();}
});

test('POST reevalúa presupuesto cambiado y no reactiva automáticamente después de resolver',async t=>{
  const f=await setup(t);
  try {
    const first=await f.start();await f.finish(first.commandId);
    const decision=listDecisions(f.db,'open')[0];
    await f.post(`/decisions/${decision.id}/resolve`,{optionId:'approve',by:'director'});
    f.db.prepare('update budgets set tokens=2000').run();
    await f.start();await until(async()=>listDecisions(f.db).length===2);await f.finish(first.commandId);
    assert.equal(f.run(),undefined);assert.equal(f.state().creates,undefined);
    assert.equal(listDecisions(f.db,'open').length,1);
  } finally {await f.close();}
});

test('run limpio de otro intento no impide continuar el intento autorizado',async t=>{
  const f=await setup(t);
  try {
    const old=startRun(f.db,{taskId:f.task.id,provider:'codex',role:'old',attempt:2});
    finishRun(f.db,old.id,'cancelled','Sin recursos');
    const first=await f.start();await f.finish(first.commandId);
    const decision=listDecisions(f.db,'open')[0];
    await f.post(`/decisions/${decision.id}/resolve`,{optionId:'approve',by:'director'});
    await f.start();await until(async()=>f.db.prepare('select count(*) n from runs').get()!.n===2);
    await f.finish(first.commandId);assert.equal(f.state().creates,1);
  } finally {await f.close();}
});
