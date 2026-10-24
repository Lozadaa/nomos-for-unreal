import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fixture } from './route-fixture.ts';
import { createTask, requireTask } from '../../service/src/repo/tasks.ts';
import { startRun, finishRun } from '../../service/src/repo/runs.ts';
import { insert } from '../../service/src/repo/rows.ts';
import { appendEvent, listEvents } from '../../service/src/store.ts';

test('spec prepara atómicamente y worker start deduplica incluso después de cambiar estado',async()=>{
  const f=await fixture(true);
  try {
    const task=createTask(f.db,{title:'Juego',area:'qa'}),url='/tasks/'+task.id;
    assert.equal((await f.request(url+'/worker',{provider:'codex',role:'implementacion',skills:[]})).status,400);
    for(const scope of [[],['../evil'],['Source/**'],['C:/evil'],['ok',3]]) {
      assert.equal((await f.request(url+'/spec',{spec:'Cambio',acceptance:['Existe'],area:'qa',scope})).status,400);
      assert.equal(requireTask(f.db,task.id).state,'pendiente');
    }
    const spec={spec:'Cambio',acceptance:['Existe'],area:'gameplay',scope:['Docs\\Readme.md','Scripts/']};
    const prepared=await f.request(url+'/spec',spec);assert.equal(prepared.status,200);
    assert.deepEqual((await prepared.json()).scope,['Docs/Readme.md','Scripts']);
    assert.equal(requireTask(f.db,task.id).state,'preparada');
    for(const patch of [{provider:'desconocido'},{attempt:0},{attempt:1.5},{skills:['']},{role:''}])
      assert.equal((await f.request(url+'/worker',{provider:'codex',role:'implementacion',skills:[],...patch})).status,400);
    const payload={provider:'codex',role:'implementacion',skills:['tdd'],attempt:2};
    const first=await f.request(url+'/worker',payload);assert.equal(first.status,202);const command=await first.json();
    f.db.prepare("update tasks set state='implementando' where id=?").run(task.id);
    const before=listEvents(f.db,0).length;
    assert.deepEqual(await (await f.request(url+'/worker',payload)).json(),command);
    assert.equal(listEvents(f.db,0).length,before);
    const row=f.db.prepare('select * from commands').get()!;
    assert.equal(row.idempotency_key,'worker.start:'+task.id+':2');assert.equal(row.type,'worker.start');
    startRun(f.db,{taskId:task.id,provider:'codex',role:'implementacion'});
    assert.equal((await f.request(url+'/spec',spec)).status,409);
    assert.equal(requireTask(f.db,task.id).spec,'Cambio');
  } finally {await f.close();}
});

test('spec puede preparar tarea con run terminado y rechaza tarea cerrada sin cambiarla',async()=>{
  const f=await fixture(true);
  try {
    const task=createTask(f.db,{title:'Juego',area:'qa'});
    const run=startRun(f.db,{taskId:task.id,provider:'codex',role:'implementacion'});
    finishRun(f.db,run.id,'cancelled','Detenido');
    f.db.prepare("update tasks set state='implementando' where id=?").run(task.id);
    const spec={spec:'Nuevo encargo',acceptance:['Existe'],area:'qa',scope:['Docs']},url='/tasks/'+task.id+'/spec';
    assert.equal((await f.request(url,spec)).status,200);
    assert.equal(requireTask(f.db,task.id).state,'preparada');
    f.db.prepare("update tasks set state='done' where id=?").run(task.id);
    assert.equal((await f.request(url,{...spec,spec:'Reemplazo'})).status,409);
    assert.equal(requireTask(f.db,task.id).spec,'Nuevo encargo');
  } finally {await f.close();}
});

test('run muestra espera y salida por run/seq; message y stop encolan sin rutas externas',async()=>{
  const f=await fixture(true);
  try {
    const task=createTask(f.db,{title:'Juego',area:'qa'});
    const run=startRun(f.db,{taskId:task.id,provider:'codex',role:'implementacion',metadata:{waiting:true,question:'¿Color?'}});
    const other=startRun(f.db,{taskId:task.id,provider:'codex',role:'implementacion'});
    const first=appendEvent(f.db,'worker.output',null,{taskId:task.id,runId:run.id,lines:['uno']});
    appendEvent(f.db,'worker.output',null,{taskId:task.id,runId:other.id,lines:['ajeno']});
    const last=appendEvent(f.db,'worker.output',null,{taskId:task.id,runId:run.id,lines:['dos']});
    const url='/runs/'+run.id;
    const detail=await (await f.request(url)).json();assert.equal(detail.latestStatus.state,'esperando_worker');
    assert.equal(detail.latestStatus.question,'¿Color?');assert.equal(detail.worktree,null);
    assert.deepEqual((await (await f.request(url+'/output?since='+first.seq)).json()).map((e:any)=>e.seq),[last.seq]);
    for(const since of ['','-1','1.2','NaN','Infinity','9007199254740992'])
      assert.equal((await f.request(url+'/output?since='+since)).status,400);
    assert.equal((await f.request(url+'/message',{text:''})).status,400);
    const data={text:'hola\n$(literal)',idempotencyKey:'send-one'};
    const message=await f.request(url+'/message',data);assert.equal(message.status,202);
    assert.deepEqual(await (await f.request(url+'/message',data)).json(),await message.json());
    const stop=await f.request(url+'/stop',{});assert.equal(stop.status,202);
    assert.deepEqual(await (await f.request(url+'/stop',{})).json(),await stop.json());
    finishRun(f.db,run.id,'failed','Error');assert.equal((await f.request(url+'/message',{text:'hola'})).status,409);
    assert.equal((await f.request('/runs/nope')).status,404);
    assert.equal((await f.request(url+'/diff?path=C:/evil&base=HEAD')).status,400);
  } finally {await f.close();}
});

test('diff usa base/worktree persistido y conserva binario solo en stat',async()=>{
  const f=await fixture(true);
  try {
    const git=(...args:string[])=>execFileSync('git',['-C',f.dir,...args],{encoding:'utf8',windowsHide:true});
    git('init');git('config','core.autocrlf','false');git('config','user.name','Test');git('config','user.email','test@example.invalid');
    writeFileSync(join(f.dir,'base.txt'),'base\n');git('add','base.txt');git('commit','-m','Base');
    const base=git('rev-parse','HEAD').trim();
    writeFileSync(join(f.dir,'texto ñ.txt'),'nuevo\n');git('add','texto ñ.txt');git('commit','-m','Texto');
    writeFileSync(join(f.dir,'image.bin'),Buffer.from([0,1,2]));writeFileSync(join(f.dir,'.nomos-brief.md'),'secreto');
    const task=createTask(f.db,{title:'Juego',area:'qa'});
    const tree=insert(f.db,'worktrees',{taskId:task.id,path:f.dir,branch:'test',baseCommit:base,state:'active',closedReason:null});
    const run=startRun(f.db,{taskId:task.id,provider:'codex',role:'implementacion',sessionRef:'terminal',metadata:{worktreeId:tree.id}});
    const response=await f.request('/runs/'+run.id+'/diff');assert.equal(response.status,200);
    const diff=await response.json();assert.match(diff.stat,/image.bin/);assert.match(diff.patch,/nuevo/);
    assert.doesNotMatch(diff.patch,/image.bin|Binary files|secreto/);assert.equal(diff.commits[0].subject,'Texto');
  } finally {await f.close();}
});

test('nuevas rutas autentican primero y decisiones abiertas se resuelven sin nacer stale',async()=>{
  const f=await fixture(true);
  try {
    for(const path of ['/tasks/%FF/spec','/tasks/%FF/worker','/runs/%FF','/runs/%FF/output','/runs/%FF/diff','/runs/%FF/message','/runs/%FF/stop','/decisions']) {
      assert.equal((await f.request(path,{},false)).status,401,path);
      assert.equal((await f.request(path,undefined,false)).status,401,path);
    }
    const task=createTask(f.db,{title:'Pregunta',area:'qa'});
    const input={taskId:task.id,reason:'¿Color?',evidence:[{kind:'run',ref:'r1'}],options:[{id:'answer',label:'Responder en el chat',description:'Texto libre'}]};
    for(const patch of [{reason:''},{options:[]},{evidence:[{}]},{options:[input.options[0],input.options[0]]}])
      assert.equal((await f.request('/decisions',{...input,...patch})).status,400);
    const response=await f.request('/decisions',{...input,state:'resolved',contextHash:'evil'});assert.equal(response.status,201);
    const decision=await response.json();assert.equal(decision.state,'open');assert.notEqual(decision.contextHash,'evil');
    assert.equal((await f.request('/decisions/'+decision.id+'/resolve',{optionId:'answer',by:'nomos'})).status,200);
  } finally {await f.close();}
});
