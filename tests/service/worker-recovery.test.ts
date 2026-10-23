import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';
import { fixture } from './worker-fixture.ts';
import { enqueue, claim } from '../../service/src/commands.ts';
import { startRunner } from '../../service/src/runner.ts';
import { getTask } from '../../service/src/repo/tasks.ts';
import { startRun } from '../../service/src/repo/runs.ts';
import { listEvents } from '../../service/src/store.ts';

async function until(check:()=>boolean) {
  for(let i=0;i<300&&!check();i++) await delay(10);
  assert.ok(check(),'No llegó resultado del runner');
}
test('reinicio no repite start/send inciertos, falla run y libera poll de solo lectura',async t=>{
  const f=fixture(t);const run=startRun(f.db,{taskId:f.task.id,role:'programmer',provider:'codex'});
  const first=enqueue(f.db,'worker.start',{taskId:f.task.id},'interrupted');claim(f.db,'dead');
  const stop=startRunner(f.db,{}, {intervalMs:1,context:f.ctx});
  try {
    await until(()=>f.db.prepare('select state from commands where id=?').get(first.id)!.state==='failed');
    assert.equal(f.db.prepare('select state from runs where id=?').get(run.id)!.state,'failed');
    assert.match(getTask(f.db,f.task.id)!.blockedReason!,/^orca: resultado incierto tras reinicio/);
    assert.equal(f.state().repos.length,0);
  } finally {stop();await stop.drained;}
  const poll=enqueue(f.db,'worker.poll',{runId:run.id},'read');claim(f.db,'dead');
  let read=false;
  const next=startRunner(f.db,{'worker.poll':async ()=>{read=true;}},{intervalMs:1,context:f.ctx});
  try {await until(()=>read);assert.equal(f.db.prepare('select state from commands where id=?').get(poll.id)!.state,'done');}
  finally {next();await next.drained;}
});

test('timeout de Orca termina comando una sola vez y bloquea sin duplicar worktrees',async t=>{
  const f=fixture(t,{FAKE_ORCA_HANG:'1'});
  const command=enqueue(f.db,'worker.start',{taskId:f.task.id,provider:'codex',role:'programmer',skills:[]},'hang');
  const stop=startRunner(f.db,f.handlers,{intervalMs:1,context:f.ctx});
  try {
    await until(()=>f.db.prepare('select state from commands where id=?').get(command.id)!.state==='failed');
    await delay(30);
    assert.equal(f.db.prepare('select attempts from commands where id=?').get(command.id)!.attempts,1);
    assert.match(getTask(f.db,f.task.id)!.blockedReason!,/^orca:/);assert.equal(f.run().state,'failed');
    assert.equal(f.state().creates,undefined);
  } finally {stop();await stop.drained;}
  const firstRun=f.run().id;
  f.ctx.orca=(await import('../../service/src/adapters/orca.ts')).createOrca({...f.orcaOptions,env:{FAKE_ORCA_STATE:f.file}});
  await f.start();assert.equal(f.run().id,firstRun);
  assert.ok(getTask(f.db,f.task.id)!.decisionId,'resultado incierto exige reconciliación antes de otro create');
  assert.equal(f.db.prepare('select count(*) n from runs').get()!.n,1);
});

test('fallo Git después de crear worktree guarda checkpoint y falla run sin dejarlo activo',async t=>{
  const f=fixture(t);f.ctx.git.renameBranch=async()=>{throw new Error('colisión de rama');};
  await assert.rejects(f.start(),/colisión/);
  assert.equal(f.run().state,'failed');assert.ok(f.tree().path);assert.equal(f.state().creates,1);
  assert.match(getTask(f.db,f.task.id)!.blockedReason!,/^orca:/);
});

test('HEAD ilegible del nuevo worktree conserva ruta y handle para reconciliación',async t=>{
  const f=fixture(t),head=f.ctx.git.head;
  f.ctx.git.head=async dir=>{if(dir!==f.projectDir) throw new Error('HEAD ilegible');return head(dir);};
  await assert.rejects(f.start(),/HEAD ilegible/);
  assert.ok(f.tree(),'ruta del recurso debe quedar guardada incluso antes de leer HEAD');
  assert.equal(f.run().sessionRef,'term_fake');assert.equal(f.run().state,'failed');
  assert.equal(getTask(f.db,f.task.id)!.worktreeId,f.tree().id);
});

test('tool.completed contextualiza cada subprocess durante start una vez sin incluir el brief',async t=>{
  const f=fixture(t);
  const command=enqueue(f.db,'worker.start',{taskId:f.task.id,provider:'codex',role:'programmer',skills:[]},'observe');
  const {orca,...context}=f.ctx;const callback:any[]=[];
  const stop=startRunner(f.db,f.handlers,{intervalMs:1,context,orcaOptions:{...f.orcaOptions,onCompleted:e=>{callback.push(e);}}});
  try {
    await until(()=>f.db.prepare('select state from commands where id=?').get(command.id)!.state==='done');
    const events=listEvents(f.db,0).filter(e=>e.type==='tool.completed');
    assert.equal(events.length,callback.length);assert.ok(events.length>=7);
    assert.ok(events.every(e=>e.payload.commandId===command.id&&e.payload.taskId===f.task.id&&e.payload.runId===f.run().id));
    assert.ok(events.every(e=>e.payload.exitCode===0));
    assert.doesNotMatch(JSON.stringify(events),/Crear README/);
  } finally {stop();await stop.drained;}
});

test('send incierto tras aceptación posible falla run y no reenvía el inbox',async t=>{
  const f=fixture(t);await f.start();const run=f.run();
  f.ctx.orca=(await import('../../service/src/adapters/orca.ts')).createOrca({...f.orcaOptions,env:{...f.orcaOptions.env,FAKE_ORCA_REJECT:'1'}});
  const before=f.state().tail.length;
  await assert.rejects(f.invoke('worker.send',{runId:run.id,text:'Una entrega'}),/aceptó/);
  assert.equal(f.state().tail.length,before+1);assert.equal(f.run().state,'failed');
  assert.equal(f.run().metadata.correctionCount,0);assert.match(getTask(f.db,f.task.id)!.blockedReason!,/^orca:/);
});
