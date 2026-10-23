import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './route-fixture.ts';
import { seed } from '../../service/src/seed.ts';
import { appendEvent } from '../../service/src/store.ts';
import { addArtifact } from '../../service/src/repo/artifacts.ts';
import { enqueue, claim } from '../../service/src/commands.ts';

test('todas las rutas requieren token antes de entrada inválida', async () => {
  const f = await fixture(true);
  try {
    for (const [path, data] of [['/tasks'], ['/tasks/%FF'], ['/tasks', {}], ['/decisions'],
      ['/decisions/%FF/resolve', {}], ['/budget'], ['/artifacts'], ['/artifacts/%FF/file'],
      ['/catalog'], ['/capabilities'], ['/commands'], ['/seed', {}]] as [string, any][]) {
      assert.equal((await f.request(path, data, false)).status, 401, path);
    }
  } finally { await f.close(); }
});

test('lecturas filtran y componen tarea sin eventos de otras tareas', async () => {
  const f = await fixture();
  try {
    seed(f.db);
    addArtifact(f.db,{taskId:'seed-task-06',kind:'report',path:'detail.txt'});
    appendEvent(f.db,'task.unrelated',null,{taskId:'seed-task-060'});
    const tests = await (await f.request('/tasks/seed-task-09')).json();
    assert.equal(tests.testRuns.length,2); assert.equal(tests.artifacts.length,4);
    const response = await f.request('/tasks/seed-task-06');
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type')!, /charset=utf-8/);
    const detail = await response.json();
    assert.equal(detail.task.id, 'seed-task-06'); assert.equal(detail.runs.length, 1);
    assert.ok(detail.artifacts.length); assert.ok(Array.isArray(detail.testRuns)); assert.equal(detail.decision, null);
    assert.ok(detail.events.length); assert.ok(detail.events.every((e:any) => e.payload.taskId === detail.task.id));
    const linked = await (await f.request('/tasks/seed-task-04')).json(); assert.equal(linked.decision.id,'seed-decision-01');
    assert.equal((await (await f.request('/tasks?state=pendiente')).json()).length,2);
    assert.equal((await (await f.request('/catalog?q=tenis')).json()).length,2);
    assert.equal((await (await f.request('/catalog?q=%20')).json()).length,30);
    assert.ok((await (await f.request('/catalog?source=megascans&state=owned')).json()).every((c:any)=>c.source==='megascans' && c.state==='owned'));
    const summary = await (await f.request('/budget')).json(); assert.equal(summary.spent.meshyCredits,60);
    assert.equal((await f.request('/budget?scope=task')).status,400);
    assert.equal((await f.request('/budget?scope=task&scopeId=seed-task-06')).status,200);
    enqueue(f.db,'demo',{nested:{ok:true}},'one'); claim(f.db,'worker'); enqueue(f.db,'demo',{},'two');
    const commands = await (await f.request('/commands?state=running')).json();
    assert.equal(commands.length,1); assert.deepEqual(commands[0].payload,{nested:{ok:true}});
    assert.ok((await (await f.request('/capabilities')).json()).some((c:any)=>c.id==='node'));
    for (const path of ['/tasks?state=bad','/tasks?area=bad','/catalog?source=bad','/catalog?state=bad','/commands?state=bad','/decisions?state=bad','/budget?scope=bad','/tasks/%FF'])
      assert.equal((await f.request(path)).status,400,path);
    assert.equal((await f.request('/tasks/nope')).status,404);
  } finally { await f.close(); }
});

test('acciones validan datos, crean pendiente y resuelven decisiones vigentes o stale', async () => {
  const f = await fixture(true);
  try {
    assert.equal((await f.request('/seed',{})).status,201);
    assert.equal((await f.request('/seed',{})).status,409);
    assert.equal((await f.request('/seed',{force:'yes'})).status,400);
    assert.equal((await f.request('/seed',{force:true})).status,201);
    const created = await f.request('/tasks',{title:'Nueva',spec:'Spec',area:'qa',acceptance:['Listo'],state:'done',id:'evil'});
    assert.equal(created.status,201); const task = await created.json(); assert.equal(task.state,'pendiente'); assert.notEqual(task.id,'evil');
    for (const data of [{title:''},{title:'A',spec:4,area:'qa',acceptance:[]},{title:'A',spec:'',area:'bad',acceptance:[]},{title:'A',spec:'',area:'qa',acceptance:[4]}])
      assert.equal((await f.request('/tasks',data)).status,400);
    assert.equal((await f.request('/decisions/seed-decision-01/resolve',{optionId:'bad',by:'yo'})).status,400);
    assert.equal((await f.request('/decisions/seed-decision-01/resolve',{optionId:'seed-catalog-04',by:'yo'})).status,200);
    assert.equal((await f.request('/seed',{force:true})).status,201);
    appendEvent(f.db,'task.changed',null,{taskId:'seed-task-04'});
    const stale = await f.request('/decisions/seed-decision-01/resolve',{optionId:'seed-catalog-04',by:'yo'});
    assert.equal(stale.status,409); assert.equal((await stale.json()).error,'decision_stale');
    assert.equal((await f.request('/decisions/nope/resolve',{optionId:'x',by:'yo'})).status,404);
  } finally { await f.close(); }
});
