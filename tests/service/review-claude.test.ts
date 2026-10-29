import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reviewFixture } from './review-fixture.ts';
import { createOrca } from '../../service/src/adapters/orca.ts';
import { enqueue } from '../../service/src/commands.ts';
import { listEvents } from '../../service/src/store.ts';
import { requireTask } from '../../service/src/repo/tasks.ts';

function claude(f:Awaited<ReturnType<typeof reviewFixture>>) {
  f.ctx.orca=createOrca({...f.orcaOptions,env:{...f.orcaOptions.env,FAKE_ORCA_MODE:'claude'}});
  writeFileSync(join(f.dataDir,'config.json'),'{"concurrency":{"codex":2,"claude":1}}');
}
test('revisor Claude de Codex mantiene identidad independiente, espera permiso y aprueba',async t=>{
  const f=await reviewFixture(t);claude(f);await f.startReview();const run=f.reviewer();
  assert.equal(run.provider,'claude');assert.notEqual(run.id,f.implementer.id);
  assert.equal(run.metadata.review?.implementerRunId,f.implementer.id);
  assert.notEqual(run.sessionRef,f.implementer.sessionRef);assert.notEqual(f.reviewTree().path,f.implementerTree.path);
  assert.equal(requireTask(f.db,f.task.id).worktreeId,f.implementerTree.id);
  assert.match(readFileSync(join(f.reviewTree().path,'.nomos-brief.md'),'utf8'),/primera línea.*NOMOS_SKILLS/);
  await f.poll();assert.equal(f.reviewer().metadata.waiting,true);
  f.output('⏺ salida informativa','NOMOS_REVIEW {"approved":true,"findings":[]}');await f.poll();
  assert.equal(f.reviewer().state,'done');assert.equal(f.current().state,'done');
  assert.equal(requireTask(f.db,f.task.id).reviewApproved,1);
  const started=listEvents(f.db,0).find(e=>e.type==='review.started')!;
  assert.equal(started.payload.provider,'claude');assert.equal(started.payload.same_provider,false);
  assert.equal(listEvents(f.db,0).find(e=>e.type==='review.finished')?.payload.provider,'claude');
});
test('el revisor Claude arranca con models.revisor (no con workerModel) y lo deja en su run',async t=>{
  const f=await reviewFixture(t);claude(f);
  writeFileSync(join(f.dataDir,'config.json'),'{"concurrency":{"codex":2,"claude":1},"workerModel":"haiku","models":{"revisor":"opus"}}');
  await f.startReview();
  assert.equal(f.reviewer().provider,'claude');assert.equal(f.reviewer().metadata.model,'opus');
  assert.ok(f.state().tail.includes(`claude --model opus --dangerously-skip-permissions --session-id ${f.reviewer().metadata.sessionId}`));
  assert.equal(f.state().tail.some((line:string)=>line.includes('--model sonnet')),false);
});
test('preparación reutilizable recalcula proveedor sin perder run, command ni FIFO',async t=>{
  const f=await reviewFixture(t),repo=f.ctx.orca.repoAdd;let once=true;
  f.ctx.orca.repoAdd=async(...args)=>{
    const result=await repo(...args);
    if(once) {once=false;writeFileSync(join(f.dataDir,'config.json'),'{"concurrency":{"codex":0,"claude":0}}');}
    return result;
  };
  const cmd=enqueue(f.db,'review.start',{taskId:f.task.id,implementerRunId:f.implementer.id,provider:'codex'},'prepared-review');
  f.db.prepare("update commands set state='running' where id=?").run(cmd.id);
  assert.deepEqual(await f.handlers['review.start'](cmd,f.ctx),{deferred:true,reason:'Sin hueco en codex'});
  const prepared=f.reviewer();assert.equal(prepared.provider,'codex');assert.equal(prepared.sessionRef,null);
  assert.equal(prepared.metadata.phase,'preparing');assert.equal(prepared.metadata.worktreeId,undefined);
  const before=f.state().creates;
  claude(f);
  const earlier=enqueue(f.db,'worker.start',{taskId:'anterior',provider:'claude',role:'implementacion',skills:[]},'earlier');
  f.db.prepare('update commands set rowid=? where id=?').run(0,earlier.id);
  assert.deepEqual(await f.handlers['review.start'](cmd,f.ctx),{deferred:true,reason:'Sin hueco en claude'});
  assert.equal(f.state().creates,before);assert.equal(f.reviewer().id,prepared.id);
  f.db.prepare("update commands set state='done' where id=?").run(earlier.id);
  writeFileSync(f.file,JSON.stringify({...f.state(),tail:[],treePath:join(f.dir,'review-switched'),terminalHandle:'term_review'}));
  const result=await f.handlers['review.start'](cmd,f.ctx);
  assert.equal((result as any).runId,prepared.id);assert.equal(f.reviewer().provider,'claude');
  assert.equal(f.reviewer().metadata.startCommandId,cmd.id);assert.equal(f.reviewer().attempt,1);
  assert.equal(JSON.parse(f.db.prepare('select payload from commands where id=?').get(cmd.id)!.payload as string).provider,'claude');
  assert.equal(f.state().creates,before+1);assert.match(f.state().tail[0],/^claude /);
});
