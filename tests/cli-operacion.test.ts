import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cli, cliFixture, api, until } from './cli-helpers.ts';

const prepared=async (dataDir:string,title='Cambio')=>{
  const task=await api(dataDir,'/tasks',{title,area:'qa',spec:'Crear',acceptance:['Existe'],scope:['Docs']});
  await api(dataDir,'/tasks/'+task.id+'/spec',{spec:'Crear',acceptance:['Existe'],area:'qa',scope:['Docs']});
  return task;
};

test('CLI task reconcile encola la reconciliación de la tarea y la ejecuta el servicio',{timeout:30_000},async t=>{
  const {dataDir,port}=await cliFixture(t);cli(dataDir,'start','--port',String(port),'--no-open');
  const task=await prepared(dataDir);
  const result=cli(dataDir,'task','reconcile',task.id);assert.equal(result.status,0,result.stderr);
  const {commandId}=JSON.parse(result.stdout);
  await until(async ()=>(await api(dataDir,'/commands')).find((c:any)=>c.id===commandId)?.state==='done');
  const command=(await api(dataDir,'/commands')).find((c:any)=>c.id===commandId);
  assert.equal(command.type,'task.reconcile');assert.deepEqual(command.payload,{taskId:task.id});
  assert.equal(cli(dataDir,'task','reconcile').status,1);
});

test('CLI task create --priority y task priority TAREA N',{timeout:30_000},async t=>{
  const {dataDir,port}=await cliFixture(t);cli(dataDir,'start','--port',String(port),'--no-open');
  const created=cli(dataDir,'task','create','--title','Urgente','--area','qa','--priority','4');
  assert.equal(created.status,0,created.stderr);const task=JSON.parse(created.stdout);assert.equal(task.priority,4);
  const changed=cli(dataDir,'task','priority',task.id,'-1');assert.equal(changed.status,0,changed.stderr);
  assert.equal(JSON.parse(changed.stdout).priority,-1);
  assert.equal(cli(dataDir,'task','priority',task.id,'alta').status,1);
  assert.equal(cli(dataDir,'task','create','--title','X','--area','qa','--priority','1.5').status,1);
});
