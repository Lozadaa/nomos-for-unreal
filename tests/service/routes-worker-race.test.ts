import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { openDb } from '../../service/src/db.ts';
import { taskWorker } from '../../service/src/routes/task-worker.ts';
import { runs } from '../../service/src/routes/runs.ts';
import type { Context } from '../../service/src/routes/context.ts';
import { createTask, requireTask } from '../../service/src/repo/tasks.ts';
import { startRun, finishRun } from '../../service/src/repo/runs.ts';
import { listEvents } from '../../service/src/store.ts';

// Boundary transport is controlled; handlers, body reader, repositories and SQLite are real.
function held(db: Context['db'],handler: typeof taskWorker,path: string,data: object) {
  const req=Object.assign(new PassThrough(),{method:'POST'}),encoded=JSON.stringify(data);
  let status=0,payload: any;
  const res={writeHead(code: number){status=code;},end(value: string){payload=JSON.parse(value);}};
  req.write(encoded.slice(0,1));
  const pending=handler({db,req:req as unknown as IncomingMessage,res:res as unknown as ServerResponse,
    url:new URL(path,'http://127.0.0.1')});
  return {pending,finish:()=>req.end(encoded.slice(1)),response:()=>({status,payload})};
}
function prepared(db: Context['db']) {
  return createTask(db,{title:'Juego',area:'qa',state:'preparada',spec:'Original',acceptance:['Existe'],scope:['Docs']});
}
const start={provider:'codex',role:'implementacion',skills:[],attempt:1};

test('spec relee tarea cerrada mientras llega body y conserva estado/spec sin eventos nuevos',async()=>{
  const db=openDb(':memory:');
  try {
    const task=prepared(db),request=held(db,taskWorker,'/tasks/'+task.id+'/spec',{
      spec:'Reemplazo',acceptance:['Nuevo'],area:'qa',scope:['Scripts']});
    db.prepare("update tasks set state='done' where id=?").run(task.id);
    const before=listEvents(db,0).length;request.finish();
    await assert.rejects(request.pending,/invalid_transition/);
    assert.equal(requireTask(db,task.id).state,'done');assert.equal(requireTask(db,task.id).spec,'Original');
    assert.equal(listEvents(db,0).length,before);
  } finally {db.close();}
});

test('worker start sin clave previa rechaza tarea cerrada durante body sin encolar comando',async()=>{
  const db=openDb(':memory:');
  try {
    const task=prepared(db),request=held(db,taskWorker,'/tasks/'+task.id+'/worker',start);
    db.prepare("update tasks set state='done' where id=?").run(task.id);request.finish();
    await assert.rejects(request.pending,/invalid_transition/);
    assert.equal(db.prepare('select count(*) n from commands').get()!.n,0);
  } finally {db.close();}
});

test('worker start recupera clave existente aunque cierre tarea durante body, sin comando/evento duplicado',async()=>{
  const db=openDb(':memory:');
  try {
    const task=prepared(db),path='/tasks/'+task.id+'/worker',first=held(db,taskWorker,path,start);
    first.finish();await first.pending;assert.equal(first.response().status,202);
    const retry=held(db,taskWorker,path,start);
    db.prepare("update tasks set state='done' where id=?").run(task.id);
    const before=listEvents(db,0).length;retry.finish();await retry.pending;
    assert.deepEqual(retry.response(),first.response());
    assert.equal(db.prepare('select count(*) n from commands').get()!.n,1);
    assert.equal(listEvents(db,0).length,before);
  } finally {db.close();}
});

test('message sin clave previa rechaza run cancelado durante body sin encolar envío',async()=>{
  const db=openDb(':memory:');
  try {
    const task=prepared(db),run=startRun(db,{taskId:task.id,provider:'codex',role:'implementacion'});
    const request=held(db,runs,'/runs/'+run.id+'/message',{text:'No enviar',idempotencyKey:'new'});
    finishRun(db,run.id,'cancelled','Detenido');const before=listEvents(db,0).length;request.finish();
    await assert.rejects(request.pending,/invalid_transition/);
    assert.equal(db.prepare('select count(*) n from commands').get()!.n,0);
    assert.equal(listEvents(db,0).length,before);
  } finally {db.close();}
});

test('message recupera entrega existente después de cancelar run durante body sin segundo envío',async()=>{
  const db=openDb(':memory:');
  try {
    const task=prepared(db),run=startRun(db,{taskId:task.id,provider:'codex',role:'implementacion'});
    const path='/runs/'+run.id+'/message',data={text:'Entrega literal',idempotencyKey:'same'};
    const first=held(db,runs,path,data);first.finish();await first.pending;assert.equal(first.response().status,202);
    const retry=held(db,runs,path,data);finishRun(db,run.id,'cancelled','Detenido');
    const before=listEvents(db,0).length;retry.finish();await retry.pending;
    assert.deepEqual(retry.response(),first.response());
    assert.equal(db.prepare('select count(*) n from commands').get()!.n,1);
    assert.equal(listEvents(db,0).length,before);
    const after=held(db,runs,path,data);after.finish();await after.pending;
    assert.deepEqual(after.response(),first.response());
  } finally {db.close();}
});
