import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './route-fixture.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { startRun, finishRun } from '../../service/src/repo/runs.ts';
import { updateRun } from '../../service/src/repo/worker.ts';
import { insert } from '../../service/src/repo/rows.ts';
import { complete } from '../../service/src/commands.ts';
import type { Worktree } from '../../service/src/model.ts';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

async function setup(t:any) {
  const f=await fixture();t.after(f.close);
  const path=join(f.dir,'tree');mkdirSync(path);
  const git=(...args:string[])=>execFileSync('git',['-C',path,...args],{windowsHide:true,stdio:'pipe'}).toString().trim();
  git('init');git('config','user.name','Kratos test');git('config','user.email','test@example.invalid');
  git('commit','--allow-empty','-m','Base');
  const task=createTask(f.db,{title:'Revisar',area:'qa',spec:'Crear README',acceptance:['Existe'],scope:['Docs'],state:'revisando'});
  const tree=insert<Worktree>(f.db,'worktrees',{taskId:task.id,path,branch:'test',baseCommit:git('rev-parse','HEAD'),state:'active',closedReason:null});
  f.db.prepare('update tasks set worktree_id=? where id=?').run(tree.id,task.id);
  const run=startRun(f.db,{taskId:task.id,role:'implementacion',provider:'codex',sessionRef:'term',metadata:{worktreeId:tree.id}});
  finishRun(f.db,run.id,'done','Implementado');
  return {...f,task,run};
}
test('POST revisión autenticado elige implementador y conserva clave; repetir generación es idempotente',async t=>{
  const f=await setup(t),path=`/tasks/${f.task.id}/review`;
  assert.equal((await f.request(path,{},false)).status,401);
  const response=await f.request(path,{});assert.equal(response.status,202);
  const {commandId}=await response.json();
  const row=f.db.prepare('select * from commands where id=?').get(commandId)!;
  assert.equal(row.idempotency_key,`review.start:${f.task.id}:${f.run.id}`);
  assert.equal(JSON.parse(row.payload as string).implementerRunId,f.run.id);
  assert.equal((await (await f.request(path,{})).json()).commandId,commandId);
  f.db.prepare("update commands set state='running' where id=?").run(commandId);complete(f.db,commandId,{runId:'review-old'});
  assert.equal((await (await f.request(path,{})).json()).commandId,commandId);
  assert.equal(f.db.prepare('select state from commands where id=?').get(commandId)!.state,'done');
  updateRun(f.db,f.run.id,{pollGeneration:1});
  assert.equal((await (await f.request(path,{})).json()).commandId,commandId);
  assert.equal(f.db.prepare('select state from commands where id=?').get(commandId)!.state,'pending');
  assert.equal(f.db.prepare("select count(*) n from events where type='command.done'").get()!.n,1);
  assert.equal(f.db.prepare("select count(*) n from events where type='command.pending'").get()!.n,2);
});
test('revisión rechaza tarea/run/rol/estado/ownership inválidos y nueva spec invalida aprobación',async t=>{
  const f=await setup(t),path=`/tasks/${f.task.id}/review`;
  const other=createTask(f.db,{title:'Otra',area:'qa'});
  const foreign=startRun(f.db,{taskId:other.id,role:'implementacion',provider:'codex'});finishRun(f.db,foreign.id,'done','Otro');
  assert.equal((await f.request(path,{implementerRunId:foreign.id})).status,400);
  assert.equal((await f.request(path,{implementerRunId:9})).status,400);
  updateRun(f.db,f.run.id,{}, {state:'running'});assert.equal((await f.request(path,{})).status,400);
  finishRun(f.db,f.run.id,'done','Hecho');
  f.db.prepare('update tasks set review_approved=1 where id=?').run(f.task.id);
  assert.equal((await f.request(`/tasks/${f.task.id}/spec`,{spec:'Nueva',acceptance:['Nueva'],area:'qa',scope:['Docs']})).status,200);
  assert.equal(f.db.prepare('select review_approved from tasks where id=?').get(f.task.id)!.review_approved,0);
});
