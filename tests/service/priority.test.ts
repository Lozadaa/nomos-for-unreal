import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../service/src/db.ts';
import { createTask, requireTask } from '../../service/src/repo/tasks.ts';
import { plan } from '../../service/src/scheduler.ts';
import { fixture } from './route-fixture.ts';

const spec={state:'preparada' as const,spec:'Crear',acceptance:['Existe'],scope:['Docs']};

test('el planificador arranca antes la prioridad mayor; empate por fecha de creación',()=>{
  const db=openDb(':memory:');
  const old=createTask(db,{title:'J2.0a',area:'qa',...spec}),older=createTask(db,{title:'J2.0b',area:'qa',...spec});
  const urgent=createTask(db,{title:'J1.6',area:'qa',...spec,priority:5}),low=createTask(db,{title:'Pulido',area:'qa',...spec,priority:-1});
  assert.equal(requireTask(db,old.id).priority,0,'por defecto 0');
  const decisions=plan(db,{concurrency:{codex:0,claude:2,opencode:0}});
  assert.deepEqual(decisions.filter(d=>d.action==='start').map(d=>d.taskId),[urgent.id,old.id],'solo dos huecos: la urgente y la más antigua');
  assert.deepEqual(decisions.map(d=>d.taskId),[urgent.id,old.id,older.id,low.id]);
  db.close();
});
test('POST /tasks acepta priority y POST /tasks/:id/priority la cambia; rechaza lo que no es entero',async ()=>{
  const f=await fixture(true);
  try {
    const created=await (await f.request('/tasks',{title:'J1.7',area:'qa',spec:'',acceptance:[],priority:3})).json() as any;
    assert.equal(created.priority,3);
    const changed=await f.request(`/tasks/${created.id}/priority`,{priority:-2});
    assert.equal(changed.status,200);assert.equal((await changed.json() as any).priority,-2);
    for(const priority of [1.5,'2',null]) assert.equal((await f.request(`/tasks/${created.id}/priority`,{priority})).status,400);
    assert.equal((await f.request('/tasks',{title:'x',area:'qa',spec:'',acceptance:[],priority:'alta'})).status,400);
  } finally {await f.close();}
});
