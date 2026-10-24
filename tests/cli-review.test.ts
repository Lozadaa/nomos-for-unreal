import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { cli, cliFixture, api } from './cli-helpers.ts';
import { openDb } from '../service/src/db.ts';
import { startRun, finishRun } from '../service/src/repo/runs.ts';
import { insert } from '../service/src/repo/rows.ts';
import type { Worktree } from '../service/src/model.ts';

test('CLI task review ID encola revisión con el implementador terminado',async t=>{
  const {dataDir,port}=await cliFixture(t);assert.equal(cli(dataDir,'start','--port',String(port),'--no-open').status,0);
  const task=await api(dataDir,'/tasks',{title:'Revisar',area:'qa',spec:'Existe',acceptance:['Existe'],scope:['Docs']});
  const path=join(dataDir,'review-tree');mkdirSync(path);
  const git=(...args:string[])=>execFileSync('git',['-C',path,...args],{windowsHide:true,stdio:'pipe'}).toString().trim();
  git('init');git('config','user.name','Nomos test');git('config','user.email','test@example.invalid');
  git('commit','--allow-empty','-m','Base');
  const db=openDb(join(dataDir,'nomos.db'));
  const tree=insert<Worktree>(db,'worktrees',{taskId:task.id,path,branch:'nomos/test',baseCommit:git('rev-parse','HEAD'),state:'active',closedReason:null});
  const run=startRun(db,{taskId:task.id,role:'implementacion',provider:'codex',sessionRef:'term',metadata:{worktreeId:tree.id}});
  finishRun(db,run.id,'done','Terminado');db.prepare("update tasks set state='revisando',worktree_id=? where id=?").run(tree.id,task.id);db.close();
  const result=cli(dataDir,'task','review',task.id);assert.equal(result.status,0,result.stderr);
  const command=(await api(dataDir,'/commands')).find((c:any)=>c.id===JSON.parse(result.stdout).commandId);
  assert.equal(command.type,'review.start');assert.equal(command.payload.implementerRunId,run.id);
  assert.equal(cli(dataDir,'task','review').status,1);
});

test('CLI task check ID encola checks.run con el último implementador terminado',async t=>{
  const {dataDir,port}=await cliFixture(t);assert.equal(cli(dataDir,'start','--port',String(port),'--no-open').status,0);
  const task=await api(dataDir,'/tasks',{title:'HUD',area:'ui',spec:'Barra de vida',acceptance:['check: umg']});
  const db=openDb(join(dataDir,'nomos.db'));
  const run=startRun(db,{taskId:task.id,role:'implementacion',provider:'claude'});finishRun(db,run.id,'done','Terminado');db.close();
  const result=cli(dataDir,'task','check',task.id);assert.equal(result.status,0,result.stderr);
  const command=(await api(dataDir,'/commands')).find((c:any)=>c.id===JSON.parse(result.stdout).commandId);
  assert.equal(command.type,'checks.run');assert.deepEqual(command.payload,{taskId:task.id,runId:run.id});
  assert.equal(cli(dataDir,'task','check').status,1);
});
