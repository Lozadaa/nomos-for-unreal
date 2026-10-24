import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './worker-fixture.ts';
import { getTask } from '../../service/src/repo/tasks.ts';
import { resolveDecision, listDecisions } from '../../service/src/repo/decisions.ts';
import { ensureBudget } from '../../service/src/repo/budget.ts';
import { read } from '../../service/src/repo/rows.ts';
import type { Decision } from '../../service/src/model.ts';

test('sin Git abre init_git resoluble sin efectos ni bloqueo stale',async t=>{
  const f=fixture(t);const absent=join(f.dir,'not repo');mkdirSync(absent);f.ctx.projectDir=absent;
  writeFileSync(join(absent,'Game.uproject'),'{"FileVersion":3}');
  await f.start();const task=getTask(f.db,f.task.id)!;
  assert.ok(task.decisionId);assert.equal(f.run(),undefined);assert.equal(f.state().repos.length,0);
  const decision=read<Decision>(f.db,'decisions',task.decisionId!)!;
  assert.ok(decision.evidence.some(e=>e.kind==='gate:init_git'));
  resolveDecision(f.db,decision.id,'initialize','director');assert.equal(getTask(f.db,f.task.id)!.blockedReason,null);
});
test('critical por segmentos exige approve exacto y scope nuevo vuelve a pedir',async t=>{
  const f=fixture(t);writeFileSync(join(f.dataDir,'config.json'),JSON.stringify({concurrency:{codex:2},criticalSystems:['Docs/Save']}));
  await f.start();let decision=listDecisions(f.db,'open')[0];assert.ok(decision);
  assert.equal(f.run(),undefined);assert.equal(f.state().repos.length,0);
  resolveDecision(f.db,decision.id,'approve','director');
  f.db.prepare('update tasks set scope=? where id=?').run('["Docs/Save/Sub"]',f.task.id);
  await f.start();decision=listDecisions(f.db,'open')[0];assert.ok(decision);
  resolveDecision(f.db,decision.id,'approve','director');await f.start();assert.equal(f.run().state,'running');
});
test('scope vecino no cruza critical y rutas que escapan se rechazan antes de Orca',async t=>{
  const f=fixture(t);writeFileSync(join(f.dataDir,'config.json'),JSON.stringify({concurrency:{codex:2},criticalSystems:['DocsX']}));
  f.db.prepare('update tasks set scope=? where id=?').run('["../Secrets"]',f.task.id);
  await assert.rejects(f.start(),/invalid_worker_scope/);assert.equal(f.state().repos.length,0);
  f.db.prepare('update tasks set scope=? where id=?').run('["Docs"]',f.task.id);
  await f.start();assert.ok(f.run());assert.equal(listDecisions(f.db).length,0);
});
test('budget finito requiere autorización por ejecución y no crea Spend ficticio',async t=>{
  const f=fixture(t);ensureBudget(f.db,'workspace','game',{tokens:1000,meshyCredits:0});
  await f.start();const decision=listDecisions(f.db,'open')[0];assert.ok(decision);
  assert.equal(f.run(),undefined);resolveDecision(f.db,decision.id,'approve','director');await f.start();
  f.output('KRATOS_DONE {"summary":"Listo","commits":[],"tests":"passed"}');
  await f.invoke('worker.poll',{runId:f.run().id,generation:0});
  const before=f.state().tail.length;await f.invoke('worker.send',{runId:f.run().id,text:'Corregir'});
  assert.equal(f.state().tail.length,before);assert.equal(listDecisions(f.db,'open').length,1);
  assert.equal(f.db.prepare('select count(*) n from spends').get()!.n,0);
});
test('budget agotado y config inválida detienen ejecución antes de efectos',async t=>{
  const f=fixture(t);ensureBudget(f.db,'task',f.task.id,{tokens:0});await f.start();
  assert.equal(f.run(),undefined);assert.match(listDecisions(f.db,'open')[0].reason,/agotado/);
  writeFileSync(join(f.dataDir,'config.json'),'{malformed');
  await assert.rejects(f.start(),/invalid_worker_config/);assert.equal(f.state().repos.length,0);
});

test('criticalSystems null y attempt negativo se rechazan sin crear run ni recursos',async t=>{
  const f=fixture(t);writeFileSync(join(f.dataDir,'config.json'),'{"concurrency":{"codex":2},"criticalSystems":null}');
  await assert.rejects(f.start(),/invalid_worker_config/);assert.equal(f.state().repos.length,0);
  writeFileSync(join(f.dataDir,'config.json'),'{}');
  await assert.rejects(f.invoke('worker.start',{taskId:f.task.id,provider:'codex',role:'programmer',skills:[],attempt:-1}),/invalid_worker_payload/);
  assert.equal(f.run(),undefined);
});

for(const scope of ['Source/*','Source/**','Source/Sa?e','Source/[S]ave','Source/{Save,Other}','Source/Save.']) {
  test(`scope ambiguo ${scope} no elude criticalSystems ni crea recursos`,async t=>{
    const f=fixture(t);writeFileSync(join(f.dataDir,'config.json'),'{"concurrency":{"codex":2},"criticalSystems":["Source/Save"]}');
    f.db.prepare('update tasks set scope=? where id=?').run(JSON.stringify([scope]),f.task.id);
    await assert.rejects(f.start(),/invalid_worker_scope/);
    assert.equal(f.run(),undefined);assert.equal(f.state().repos.length,0);assert.equal(f.state().creates,undefined);
  });
}
