import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './worker-fixture.ts';
import { requireTask, moveTask } from '../../service/src/repo/tasks.ts';
import { requireRun } from '../../service/src/repo/worker.ts';
import { finishRun } from '../../service/src/repo/runs.ts';
import { workerFailure } from '../../service/src/handlers/worker-failure.ts';
import { filtered } from '../../service/src/repo/rows.ts';
import { enqueue, defer, complete } from '../../service/src/commands.ts';
import { listDecisions, resolveDecision } from '../../service/src/repo/decisions.ts';
import { listLeases } from '../../service/src/leases.ts';
import { plan, tick } from '../../service/src/scheduler.ts';
import type { Command, Run } from '../../service/src/model.ts';

const config={concurrency:{codex:2,claude:2}};
/** Ejecuta el comando como el runner: lo difiere si lo pide y lo completa si no; se puede volver a llamar. */
const execute=async (f:ReturnType<typeof fixture>,cmd:Command)=>{
  f.db.prepare("update commands set state='running',attempts=attempts+1 where id=?").run(cmd.id);
  const result=await f.handlers[cmd.type](cmd,f.ctx) as any;
  if(result?.deferred) defer(f.db,cmd.id,result.reason);else complete(f.db,cmd.id,result || undefined);
  return result;
};
const command=(f:ReturnType<typeof fixture>,type:string,payload:object)=>{
  const cmd=enqueue(f.db,type,payload,type+':'+crypto.randomUUID());
  return ()=>execute(f,cmd);
};
const pending=(f:ReturnType<typeof fixture>,type:string)=>{
  const row=f.db.prepare('select id,payload from commands where type=? order by rowid desc limit 1').get(type)!;
  return {id:row.id,type,payload:JSON.parse(row.payload as string)} as unknown as Command;
};
const reconciled=(f:ReturnType<typeof fixture>,run:Run,treeId:string)=>{
  const after=requireRun(f.db,run.id),task=requireTask(f.db,f.task.id);
  assert.equal(after.metadata.uncertain,false);assert.equal(after.metadata.discarded,true);
  assert.equal(task.state,'preparada');assert.equal(task.worktreeId,null);
  assert.equal(task.decisionId,null);assert.equal(task.blockedReason,null);assert.equal(task.waitReason,null);
  assert.ok(f.state().closed.includes(run.sessionRef));assert.ok(f.state().removed.includes(treeId));
  assert.deepEqual(listLeases(f.db),[]);
};
/** Lo que dejó Block Kings: run cancelada sin `uncertain` y la tarea apuntando aún al árbol de Orca. */
const stuck=async (f:ReturnType<typeof fixture>)=>{
  await f.start();const run=f.run();
  finishRun(f.db,run.id,'cancelled','Seguimiento detenido; no se confirma terminación del proceso codex');
  moveTask(f.db,f.task.id,'preparada');return run;
};

test('cancelar con el árbol limpio deja la run reconciliada y la tarea arranca de nuevo sin Decisión',async t=>{
  const f=fixture(t);await f.start();const run=f.run(),tree=f.tree();
  await f.invoke('worker.stop',{runId:run.id});
  assert.equal(requireRun(f.db,run.id).state,'cancelled');reconciled(f,run,tree.id);
  assert.deepEqual(plan(f.db,config).map(p=>p.action),['start']);
  writeFileSync(f.file,JSON.stringify({...f.state(),treePath:join(f.dir,'second tree'),terminalHandle:'term_2'}));
  await f.invoke('worker.start',{taskId:f.task.id,provider:'codex',role:'programmer',skills:[],attempt:2});
  const runs=filtered<Run>(f.db,'runs',{taskId:f.task.id});
  assert.equal(runs.length,2);assert.equal(runs[1].state,'running');
  assert.equal(requireTask(f.db,f.task.id).state,'implementando');assert.deepEqual(listDecisions(f.db,'open'),[]);
});
test('Orca reutiliza la ruta (y el id) del worktree retirado: el arranque siguiente no choca con la fila cerrada',async t=>{
  // aceptación del hito 13 en KratosFabTest: «UNIQUE constraint failed: worktrees.id» al rearrancar tras cancelar
  const f=fixture(t);writeFileSync(f.file,JSON.stringify({...f.state(),realRemove:true}));
  await f.start();const first=f.tree();
  await f.invoke('worker.stop',{runId:f.run().id});
  writeFileSync(f.file,JSON.stringify({...f.state(),terminalHandle:'term_2'}));
  await f.invoke('worker.start',{taskId:f.task.id,provider:'codex',role:'programmer',skills:[],attempt:2});
  const second=filtered<Run>(f.db,'runs',{taskId:f.task.id})[1];
  assert.equal(second.state,'running');assert.equal(second.metadata.worktreeId,first.id,'misma ruta, mismo id de Orca');
  assert.equal(requireTask(f.db,f.task.id).worktreeId,first.id);
  const branch=execFileSync('git',['-C',first.path,'branch','--show-current'],{encoding:'utf8'}).trim();
  assert.match(branch,/^nomos\/[0-9a-f]{8}-[0-9a-f]{8}$/,'la rama del worker anterior sigue y la nueva no la pisa');
});
test('lo commiteado del intento anterior entra en el árbol nuevo y el brief lo dice',async t=>{
  // TrompoArte: tras «Commitear al run» el intento 2 nacía de main sin el plan de arte ni el material del 1
  const f=fixture(t);writeFileSync(f.file,JSON.stringify({...f.state(),realRemove:true}));
  await f.start();const first=f.tree();
  writeFileSync(join(first.path,'plan.md'),'plan de arte\n');
  execFileSync('git',['-C',first.path,'add','plan.md']);execFileSync('git',['-C',first.path,'commit','-qm','avance del intento 1']);
  await f.invoke('worker.stop',{runId:f.run().id});
  writeFileSync(f.file,JSON.stringify({...f.state(),terminalHandle:'term_2'}));
  await f.invoke('worker.start',{taskId:f.task.id,provider:'codex',role:'programmer',skills:[],attempt:2});
  assert.equal(readFileSync(join(first.path,'plan.md'),'utf8'),'plan de arte\n');
  assert.match(readFileSync(join(first.path,'.nomos-brief.md'),'utf8'),/## Intento anterior[\s\S]*ya está fusionado/);
  // y el intento 3 hereda lo del 2 (la rama más reciente), no solo lo del 1
  writeFileSync(join(first.path,'plan.md'),'plan de arte v2\n');
  execFileSync('git',['-C',first.path,'commit','-qam','avance del intento 2']);
  await f.invoke('worker.stop',{runId:filtered<Run>(f.db,'runs',{taskId:f.task.id}).find(r=>r.state==='running')!.id});
  writeFileSync(f.file,JSON.stringify({...f.state(),terminalHandle:'term_3'}));
  await f.invoke('worker.start',{taskId:f.task.id,provider:'codex',role:'programmer',skills:[],attempt:3});
  assert.equal(readFileSync(join(first.path,'plan.md'),'utf8'),'plan de arte v2\n');
});
test('cancelar con un worker que no cierra reintenta cada 30 s y no toca el árbol',async t=>{
  const f=fixture(t);await f.start();const run=f.run();
  f.ctx.orca={...f.ctx.orca,terminalAlive:async()=>true};
  const result=await command(f,'worker.stop',{runId:run.id})();
  assert.equal(result.deferred,true);assert.equal(result.delayMs,30_000);
  assert.equal(requireRun(f.db,run.id).metadata.closeAttempts,1);
  assert.equal(f.state().removed,undefined);assert.equal(requireTask(f.db,f.task.id).worktreeId,f.tree().id);
});
test('cancelar con cambios sin registrar abre Descartar / Commitear al run / Esperar',async t=>{
  for(const choice of ['discard','commit','wait']) await t.test(choice,async t=>{
    const f=fixture(t);await f.start();const run=f.run(),tree=f.tree();
    writeFileSync(join(tree.path,'nuevo.txt'),'a medias\n');
    const stop=command(f,'worker.stop',{runId:run.id});
    assert.equal((await stop()).deferred,true);
    const decision=listDecisions(f.db,'open')[0];
    assert.deepEqual(decision.options.map(o=>o.label),['Descartar','Commitear al run','Esperar']);
    assert.match(decision.reason,/nuevo\.txt/);assert.equal(f.state().removed,undefined);
    assert.equal((await stop()).deferred,true,'sigue esperando mientras la Decisión está abierta');
    resolveDecision(f.db,decision.id,choice,'director');await stop();
    if(choice==='wait') {
      assert.equal(f.state().removed,undefined);
      assert.match(requireTask(f.db,f.task.id).waitReason!,/cambios sin registrar/);return;
    }
    reconciled(f,run,tree.id);
    if(choice==='commit') assert.match(execFileSync('git',['-C',tree.path,'log','-1','--name-only'],{encoding:'utf8'}),/nuevo\.txt/);
  });
});
test('task reconcile desatasca una tarea con run incierta y worktree, con Git real',async t=>{
  const f=fixture(t);const run=await stuck(f),tree=f.tree();
  assert.equal(plan(f.db,config)[0].reason,'Requiere reconciliar worker existente');
  const result=await command(f,'task.reconcile',{taskId:f.task.id})();
  assert.equal(result.reconciled,true);reconciled(f,run,tree.id);
  assert.deepEqual(plan(f.db,config).map(p=>p.action),['start']);
});
test('task reconcile levanta el bloqueo que dejó el fallo de la run reconciliada (no el de una Decisión)',async t=>{
  const f=fixture(t);await f.start();const run=f.run(),tree=f.tree();
  workerFailure(f.db,{runId:run.id},'orca: cli_error: Preparación del worker: algo falló');moveTask(f.db,f.task.id,'preparada');
  assert.match(requireTask(f.db,f.task.id).blockedReason!,/^orca: cli_error/);
  assert.equal((await command(f,'task.reconcile',{taskId:f.task.id})()).reconciled,true);
  reconciled(f,run,tree.id);assert.deepEqual(plan(f.db,config).map(p=>p.action),['start']);
});
test('task reconcile con cambios sin registrar abre la Decisión de tres opciones en vez de fallar',async t=>{
  const f=fixture(t);await stuck(f);writeFileSync(join(f.tree().path,'nuevo.txt'),'x\n');
  assert.equal((await command(f,'task.reconcile',{taskId:f.task.id})()).deferred,true);
  assert.deepEqual(listDecisions(f.db,'open')[0].options.map(o=>o.id),['discard','commit','wait']);
});
test('la Decisión reconcile de worker.start ofrece opciones que funcionan',async t=>{
  for(const choice of ['retry','leave','cancel']) await t.test(choice,async t=>{
    const f=fixture(t);const run=await stuck(f),tree=f.tree();
    const start=command(f,'worker.start',{taskId:f.task.id,provider:'codex',role:'programmer',skills:[],attempt:2});
    const blocked=await start();assert.equal(blocked.policyBlocked,true);
    const decision=listDecisions(f.db,'open')[0];assert.equal(decision.id,blocked.decisionId);
    assert.deepEqual(decision.options.map(o=>o.label),['Reconciliar y reintentar','Reconciliar y dejar preparada','Cancelar la tarea']);
    const reconcile=pending(f,'task.reconcile');
    assert.equal((await execute(f,reconcile)).deferred,true);
    resolveDecision(f.db,decision.id,choice,'director');
    assert.equal((await execute(f,reconcile)).reconciled,true);
    const startState=f.db.prepare("select state from commands where type='worker.start' order by rowid desc limit 1").get()!.state;
    const task=requireTask(f.db,f.task.id);
    assert.equal(requireRun(f.db,run.id).metadata.discarded,true);assert.ok(f.state().removed.includes(tree.id));
    if(choice==='retry') {assert.equal(startState,'pending','el mismo arranque vuelve a la cola');return;}
    if(choice==='cancel') {assert.equal(task.blockedReason,'Tarea cancelada por el director');return;}
    assert.equal(task.blockedReason,null);assert.deepEqual(plan(f.db,config).map(p=>p.reason),['Disponible']);
    tick(f.db,config,f.ctx);
    const queued=f.db.prepare("select payload from commands where type='worker.start' and state='pending'").all();
    assert.equal(queued.length,1,'el planificador encola un arranque nuevo');
  });
});
