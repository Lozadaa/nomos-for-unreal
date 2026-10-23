import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './route-fixture.ts';
import { createTask, moveTask, requireTask } from '../../service/src/repo/tasks.ts';
import { startRun, finishRun } from '../../service/src/repo/runs.ts';
import { acquire } from '../../service/src/leases.ts';

test('rutas de reservas autenticadas exponen holders y permiten declarar antes de preparar',async()=>{
  const f=await fixture(true);
  try {
    const task=createTask(f.db,{title:'HUD',area:'ui'}),path=`/tasks/${task.id}/leases`;
    assert.equal((await f.request('/leases',undefined,false)).status,401);
    assert.equal((await f.request(path,{leases:[]},false)).status,401);
    const response=await f.request(path,{leases:['Content\\UI\\WBP_HUD.uasset']});
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).leases,['Content/UI/WBP_HUD.uasset']);
    assert.equal(requireTask(f.db,task.id).state,'pendiente');
    const run=startRun(f.db,{taskId:task.id,role:'programmer',provider:'codex'});
    acquire(f.db,run.id,task.id,['Content/UI/WBP_HUD.uasset']);
    const leases=await (await f.request('/leases')).json();
    assert.equal(leases.length,1);assert.equal(leases[0].runId,run.id);assert.equal(leases[0].taskId,task.id);
    assert.equal((await f.request(path,{leases:[]})).status,409);
    finishRun(f.db,run.id,'done','Listo');moveTask(f.db,task.id,'implementando');
    assert.equal((await f.request(path,{leases:[]})).status,409);
    moveTask(f.db,task.id,'preparada');
    assert.equal((await f.request(path,{leases:['../escape']})).status,400);
    assert.equal((await f.request(path,{leases:'Content'})).status,400);
    assert.equal((await f.request(path,{leases:[]})).status,200);
  } finally {await f.close();}
});

test('crear tarea acepta reservas normalizadas y rechaza rutas inválidas',async()=>{
  const f=await fixture(true);
  try {
    const task={title:'HUD',area:'ui',spec:'Crear HUD',acceptance:['Visible'],leases:['Content\\UI/HUD.uasset']};
    const response=await f.request('/tasks',task);assert.equal(response.status,201);
    assert.deepEqual((await response.json()).leases,['Content/UI/HUD.uasset']);
    assert.equal((await f.request('/tasks',{...task,leases:['C:\\escape']})).status,400);
  } finally {await f.close();}
});
