import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './route-fixture.ts';
import { openDecision,resolveDecision } from '../../service/src/repo/decisions.ts';

test('dependencias autenticadas se declaran antes de preparar y rechazan ciclos',async()=>{
  const f=await fixture();
  try {
    const create=async(title:string)=>(await (await f.request('/tasks',{title,area:'qa',spec:'Probar',acceptance:['Verde'],
      assigneeRole:'qa',assigneeProvider:'claude'})).json());
    const a=await create('Base'),b=await create('Dependiente');
    const decision=openDecision(f.db,{taskId:b.id,reason:'Autorizar contexto',options:[{id:'approve',label:'Sí',description:'Autorizar'}]});
    assert.equal((await f.request(`/tasks/${b.id}/depends`,{dependsOn:[a.id]},false)).status,401);
    const response=await f.request(`/tasks/${b.id}/depends`,{dependsOn:[a.id]});
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).dependsOn,[a.id]);
    assert.throws(()=>resolveDecision(f.db,decision.id,'approve','director'),/decision_stale/);
    assert.equal(b.assigneeRole,'qa');assert.equal(b.assigneeProvider,'claude');
    assert.equal((await f.request(`/tasks/${a.id}/depends`,{dependsOn:[b.id]})).status,400);
    assert.equal((await f.request(`/tasks/${a.id}/depends`,{dependsOn:['missing']})).status,404);
  } finally {await f.close();}
});
test('tarea acepta OpenCode como proveedor declarado sin adaptador',async()=>{
  const f=await fixture();
  try {
    const response=await f.request('/tasks',{title:'OpenCode',area:'qa',spec:'Probar',acceptance:['Verde'],assigneeProvider:'opencode'});
    assert.equal(response.status,201);assert.equal((await response.json()).assigneeProvider,'opencode');
  } finally {await f.close();}
});
