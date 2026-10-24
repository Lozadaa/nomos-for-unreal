import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './worker-fixture.ts';
import { createTask,blockTask } from '../../service/src/repo/tasks.ts';
import { startRun } from '../../service/src/repo/runs.ts';
import { enqueue } from '../../service/src/commands.ts';
import { startRunner } from '../../service/src/runner.ts';
import { schedulingBlocked } from '../../service/src/scheduler-admission.ts';
import { reservations } from '../../service/src/scheduler-state.ts';
import { listDecisions,resolveDecision,openDecision } from '../../service/src/repo/decisions.ts';
import { ensureBudget } from '../../service/src/repo/budget.ts';
import { resumeWorkerStart } from '../../service/src/routes/worker-resume.ts';
import { createServer } from '../../service/src/server.ts';
import { until } from '../cli-helpers.ts';

test('arranque no crea recursos si dependencia se bloquea durante awaits',async t=>{
  const f=fixture(t),base=createTask(f.db,{title:'Base',area:'qa',state:'done'});
  f.db.prepare('update tasks set depends_on=? where id=?').run(JSON.stringify([base.id]),f.task.id);
  const head=f.ctx.git.head;f.ctx.git.head=async path=>{const result=await head(path);blockTask(f.db,base.id,'Revisar');return result;};
  const result=await f.start() as any;
  assert.equal(f.run(),undefined);assert.equal(f.state().creates,undefined);
  assert.equal(result.deferred,true);assert.match(result.reason,/Depende de Base/);
});
test('arranque revalida cupo que se agota durante awaits',async t=>{
  const f=fixture(t),other=createTask(f.db,{title:'Otro',area:'qa'});
  writeFileSync(join(f.dataDir,'config.json'),'{"concurrency":{"codex":1}}');
  const head=f.ctx.git.head;f.ctx.git.head=async path=>{
    const result=await head(path);startRun(f.db,{taskId:other.id,role:'implementacion',provider:'codex'});return result;
  };
  const result=await f.start() as any;
  assert.equal(f.run(),undefined);assert.equal(f.state().creates,undefined);assert.equal(result.deferred,true);
});
test('bloqueo ya presente tampoco permite recursos',async t=>{
  const f=fixture(t);blockTask(f.db,f.task.id,'Esperar director');
  await f.start();assert.equal(f.run(),undefined);assert.equal(f.state().creates,undefined);
});
test('runner conserva intención postergada y luego la completa sin gastar reintentos',async t=>{
  const f=fixture(t);let ready=false;
  const cmd=enqueue(f.db,'worker.start',{taskId:f.task.id,provider:'codex',attempt:1},'deferred');
  const stop=startRunner(f.db,{'worker.start':async()=>ready ? {ok:true} : {deferred:true,reason:'Sin hueco en codex'}},
    {intervalMs:1,context:f.ctx});
  try {
    await until(async()=>!!f.db.prepare('select not_before from commands where id=?').get(cmd.id)!.not_before);
    const row=f.db.prepare('select state,attempts,not_before from commands where id=?').get(cmd.id)!;
    assert.equal(row.state,'pending');assert.equal(row.attempts,0);assert.ok(row.not_before);
    ready=true;f.db.prepare('update commands set not_before=null where id=?').run(cmd.id);
    await until(async()=>f.db.prepare('select state from commands where id=?').get(cmd.id)!.state==='done');
    assert.equal(f.db.prepare('select state from commands where id=?').get(cmd.id)!.state,'done');
  } finally {stop();await stop.drained;}
});
test('admisión de revisión cuenta intenciones anteriores de implementación',t=>{
  const f=fixture(t),other=createTask(f.db,{title:'Otro',area:'qa'});
  writeFileSync(join(f.dataDir,'config.json'),'{"concurrency":{"codex":1}}');
  enqueue(f.db,'worker.start',{taskId:other.id,provider:'codex',attempt:1},'implementation');
  const cmd=enqueue(f.db,'review.start',{taskId:f.task.id,provider:'codex'},'review');
  assert.equal(schedulingBlocked(f.ctx,f.task,'codex',cmd.id),'Sin hueco en codex');
});

test('dependencia bloqueada durante repoAdd impide crear árbol y libera reserva',async t=>{
  const f=fixture(t),base=createTask(f.db,{title:'Base',area:'qa',state:'done'});
  f.db.prepare('update tasks set depends_on=?,leases=? where id=?').run(JSON.stringify([base.id]),'["Content/HUD.uasset"]',f.task.id);
  writeFileSync(join(f.dataDir,'config.json'),'{"concurrency":{"codex":1}}');
  const repoAdd=f.ctx.orca.repoAdd;
  f.ctx.orca.repoAdd=async path=>{const result=await repoAdd(path);blockTask(f.db,base.id,'Revisar');return result;};
  const payload={taskId:f.task.id,provider:'codex',role:'implementacion',skills:[],attempt:1};
  const start=()=>f.invoke('worker.start',payload,'stable');
  const result=await start() as any;
  assert.equal(f.state().creates,undefined);
  assert.equal(result.deferred,true);assert.match(result.reason,/Depende de Base/);
  assert.equal(f.db.prepare('select count(*) n from leases').get()!.n,0);
  const parked=f.run();assert.equal(reservations(f.db).usage.codex,1);
  await assert.rejects(f.invoke('worker.start',payload,'intruder'),/worker_exists/);
  f.db.prepare('update tasks set blocked_reason=null where id=?').run(base.id);f.ctx.orca.repoAdd=repoAdd;
  await start();assert.equal(f.run().id,parked.id);assert.equal(f.run().attempt,1);
  assert.equal(f.run().state,'running');assert.equal(f.run().metadata.phase,'running');
  assert.equal(f.db.prepare('select count(*) n from runs').get()!.n,1);assert.equal(f.state().creates,1);
});

for(const phase of ['excludeLocal','terminalWaitIdle','terminalRead'] as const) {
  test(`dependencia bloqueada durante ${phase} conserva árbol sin entregar encargo`,async t=>{
    const f=fixture(t),base=createTask(f.db,{title:'Base',area:'qa',state:'done'});
    f.db.prepare('update tasks set depends_on=? where id=?').run(JSON.stringify([base.id]),f.task.id);
    const owner=phase==='excludeLocal' ? f.ctx.git : f.ctx.orca;
    const operation=(owner as any)[phase];
    (owner as any)[phase]=async(...args:any[])=>{const result=await operation(...args);blockTask(f.db,base.id,'Revisar');return result;};
    const result=await f.start() as any;
    assert.equal(f.state().creates,1);
    assert.ok(!f.state().tail.includes('Lee el archivo .nomos-brief.md de esta carpeta y ejecuta lo que dice.'));
    assert.equal(result?.deferred,undefined);
    assert.equal(f.run().metadata.phase,'preparing');assert.equal(f.run().metadata.waiting,true);
    assert.equal(f.tree().id,f.run().metadata.worktreeId);
    const decision=listDecisions(f.db,'open')[0];assert.ok(decision);
    resolveDecision(f.db,decision.id,'approve','director');
    const before=f.state().tail.length;
    await f.invoke('worker.send',{runId:f.run().id,text:'Lee el archivo .nomos-brief.md de esta carpeta y ejecuta lo que dice.'});
    assert.equal(f.state().tail.length,before,'la continuación explícita también debe comprobar la dependencia');
    f.db.prepare('update tasks set blocked_reason=null where id=?').run(base.id);
    const pending=listDecisions(f.db,'open')[0];if(pending) resolveDecision(f.db,pending.id,'approve','director');
    await f.invoke('worker.send',{runId:f.run().id,text:'Lee el archivo .nomos-brief.md de esta carpeta y ejecuta lo que dice.'});
    assert.equal(f.run().metadata.phase,'running');assert.equal(f.state().creates,1);
  });
}

test('política nueva durante preparación suspendida mantiene POST explícito y mismo run',async t=>{
  const f=fixture(t),base=createTask(f.db,{title:'Base',area:'qa',state:'done'});
  f.db.prepare("update tasks set state='preparada',depends_on=? where id=?").run(JSON.stringify([base.id]),f.task.id);
  const repoAdd=f.ctx.orca.repoAdd;
  f.ctx.orca.repoAdd=async path=>{const result=await repoAdd(path);blockTask(f.db,base.id,'Revisar');return result;};
  const payload={taskId:f.task.id,provider:'codex',role:'implementacion',skills:[],attempt:1};
  const start=()=>f.invoke('worker.start',payload,'policy-parked');
  await start();const parked=f.run();
  f.db.prepare('update tasks set blocked_reason=null where id=?').run(base.id);f.ctx.orca.repoAdd=repoAdd;
  ensureBudget(f.db,'workspace','game',{tokens:1000});
  const result=await start() as any;assert.equal(result.policyBlocked,true);
  const cmd=f.db.prepare("select id,state from commands where idempotency_key='policy-parked'").get()!;
  const decision=listDecisions(f.db,'open')[0];resolveDecision(f.db,decision.id,'approve','director');
  assert.equal(f.db.prepare('select state from commands where id=?').get(cmd.id)!.state,'done');
  resumeWorkerStart(f.db,cmd.id as string);
  assert.equal(f.db.prepare('select state from commands where id=?').get(cmd.id)!.state,'pending');
  await start();assert.equal(f.run().id,parked.id);assert.equal(f.state().creates,1);
});
test('Decisión externa en preparación local exige POST tras resolver sin arranque automático',async t=>{
  const f=fixture(t),base=createTask(f.db,{title:'Base',area:'qa',state:'done'});
  f.db.prepare("update tasks set state='preparada',assignee_provider='codex',depends_on=? where id=?").run(JSON.stringify([base.id]),f.task.id);
  const repoAdd=f.ctx.orca.repoAdd;
  f.ctx.orca.repoAdd=async path=>{const result=await repoAdd(path);blockTask(f.db,base.id,'Revisar');return result;};
  const server=createServer(f.db,'secret','service/web',f.dataDir);
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${(server.address() as any).port}/tasks/${f.task.id}/worker`;
  const post=async()=>{
    const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer secret'},
      body:JSON.stringify({provider:'codex',role:'implementacion',skills:[],attempt:1})});
    assert.equal(response.status,202);return response.json();
  };
  let probes=0;
  const stop=startRunner(f.db,{...f.handlers,probe:async()=>{probes++;}},{intervalMs:1,schedulerIntervalMs:5,context:f.ctx});
  try {
    const {commandId}=await post();
    const command=()=>f.db.prepare('select * from commands where id=?').get(commandId)!;
    await until(async()=>command().state==='pending'&&!!f.run()?.metadata.waiting);
    const parked=f.run();assert.equal(f.state().creates,undefined);
    f.ctx.orca.repoAdd=repoAdd;f.db.prepare('update tasks set blocked_reason=null where id=?').run(base.id);
    const decision=openDecision(f.db,{taskId:f.task.id,reason:'Autorizar preparación',
      options:[{id:'approve',label:'Autorizar',description:'Continuar preparación'}]});
    f.db.prepare('update commands set not_before=null where id=?').run(commandId);
    await until(async()=>command().state==='done'||Number(f.db.prepare(
      "select count(*) n from events where type='command.deferred' and json_extract(payload,'$.commandId')=?").get(commandId)!.n)>=2);
    assert.equal(command().state,'done');
    const completed=f.db.prepare("select payload from events where type='command.done' and json_extract(payload,'$.commandId')=? order by seq desc limit 1").get(commandId)!;
    assert.equal(JSON.parse(completed.payload as string).result.policyBlocked,true);
    resolveDecision(f.db,decision.id,'approve','director');
    f.db.prepare('update commands set not_before=null where id=?').run(commandId);
    enqueue(f.db,'probe',{},'after-resolution');await until(async()=>probes===1);
    assert.equal(f.state().creates,undefined);assert.equal(command().state,'done');
    assert.deepEqual(await post(),{commandId});
    await until(async()=>command().state==='done'&&f.state().creates===1);
    assert.equal(f.run().id,parked.id);assert.equal(f.run().attempt,1);
    assert.equal(f.db.prepare('select count(*) n from runs').get()!.n,1);
  } finally {stop();await stop.drained;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
