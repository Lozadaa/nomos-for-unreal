import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './worker-fixture.ts';
import { requireTask } from '../../service/src/repo/tasks.ts';
import { listEvents } from '../../service/src/store.ts';
import { listDecisions } from '../../service/src/repo/decisions.ts';
import { plan } from '../../service/src/scheduler.ts';

const brief='Lee el archivo .nomos-brief.md de esta carpeta y ejecuta lo que dice.';
const setup=(t:any,config:object={},env:Record<string,string>={})=>{
  const f=fixture(t,env);writeFileSync(join(f.dataDir,'config.json'),JSON.stringify({concurrency:{opencode:1},...config}));return f;
};
const start=(f:ReturnType<typeof fixture>)=>f.invoke('worker.start',{taskId:f.task.id,provider:'opencode',role:'implementacion',skills:[]});
const poll=(f:ReturnType<typeof fixture>)=>f.invoke('worker.poll',{runId:f.run().id});

test('OpenCode arranca con el brief en el comando, modelo fijado y opencode.json fuera de Git',async t=>{
  const f=setup(t);await start(f);const run=f.run(),short=f.task.id.slice(0,8);
  assert.equal(run.provider,'opencode');assert.equal(run.metadata.model,'opencode/beam-free');
  assert.deepEqual(f.state().tail,[`opencode run --auto --model opencode/beam-free --title nomos-${short} ${brief}`],
    'una sola orden: el brief viaja en ella y no se reenvía');
  assert.equal(JSON.parse(readFileSync(join(f.tree().path,'opencode.json'),'utf8')).model,'opencode/beam-free');
  assert.equal(execFileSync('git',['-C',f.tree().path,'status','--porcelain'],{encoding:'utf8'}),'','opencode.json y el brief no ensucian el árbol');
  assert.equal(requireTask(f.db,f.task.id).state,'implementando');
  f.output('NOMOS_DONE {"summary":"Docs listas","commits":[],"tests":"none"}');await poll(f);
  assert.equal(f.run().state,'done');assert.equal(requireTask(f.db,f.task.id).state,'revisando');
});
test('opencodeModel de config.json decide el modelo del comando y del árbol',async t=>{
  const f=setup(t,{opencodeModel:'opencode/deepseek-v4.1-flash-free'});await start(f);
  assert.match(f.state().tail[0],/--model opencode\/deepseek-v4\.1-flash-free /);
  assert.equal(f.run().metadata.model,'opencode/deepseek-v4.1-flash-free');
  assert.equal(JSON.parse(readFileSync(join(f.tree().path,'opencode.json'),'utf8')).model,'opencode/deepseek-v4.1-flash-free');
});
for(const [env,reason] of [['FAKE_ORCA_OPENCODE_CREDENTIAL','OpenCode rechazó las credenciales: ejecuta opencode auth login'],
  ['FAKE_ORCA_OPENCODE_MISSING','OpenCode no está instalado o no está en el PATH del terminal']])
test(`OpenCode que no puede arrancar falla limpio y la tarea pasa a Claude sin Decisión: ${reason}`,async t=>{
  const f=setup(t,{concurrency:{claude:1,opencode:1}},{[env]:'1'});await start(f);const worktreeId=f.run().metadata.worktreeId;
  await poll(f);
  const run=f.run(),task=requireTask(f.db,f.task.id);
  assert.equal(run.state,'failed');assert.equal(run.summary,reason);assert.equal(run.metadata.uncertain,false);
  const failed=listEvents(f.db,0).filter(e=>e.type==='worker.failed');
  assert.deepEqual(failed.map(e=>e.payload),[{runId:run.id,taskId:task.id,provider:'opencode',reason,reassignedTo:'claude'}]);
  assert.equal(task.state,'preparada');assert.equal(task.assigneeProvider,'claude');assert.equal(task.worktreeId,null);
  assert.equal(task.blockedReason,null);assert.equal(task.decisionId,null);assert.equal(task.waitReason,reason);
  assert.deepEqual(f.state().closed,['term_fake']);assert.deepEqual(f.state().removed,[worktreeId]);
  assert.deepEqual(plan(f.db,{concurrency:{claude:1,opencode:1}}),[{taskId:task.id,action:'start',reason:'Disponible',provider:'claude'}]);
  assert.deepEqual(listDecisions(f.db,'open'),[]);
});
test('la corrección a OpenCode continúa su sesión con opencode run --continue',async t=>{
  const f=setup(t);await start(f);
  f.output('NOMOS_DONE {"summary":"Docs listas","commits":[],"tests":"none"}');await poll(f);
  await f.invoke('worker.send',{runId:f.run().id,text:'Corrige el título'});
  assert.match(f.state().tail.at(-1),/^opencode run --continue --auto --model opencode\/beam-free Lee el archivo \.nomos-inbox\/[0-9a-f-]+\.md y ejecuta lo que dice\.$/);
  assert.equal(f.run().state,'running');assert.equal(f.run().metadata.correctionCount,1);
});
