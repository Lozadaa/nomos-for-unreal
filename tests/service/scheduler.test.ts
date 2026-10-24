import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../service/src/db.ts';
import { createTask,blockTask,requireTask } from '../../service/src/repo/tasks.ts';
import { startRun,finishRun } from '../../service/src/repo/runs.ts';
import { enqueue } from '../../service/src/commands.ts';
import { plan,tick } from '../../service/src/scheduler.ts';
import { acquire } from '../../service/src/leases.ts';
import { listEvents } from '../../service/src/store.ts';
import { workerFailure } from '../../service/src/handlers/worker-failure.ts';
import { readConfig,concurrency } from '../../service/src/config.ts';
import { openDecision,resolveDecision } from '../../service/src/repo/decisions.ts';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const config={concurrency:{codex:1}};
function setup(t:any) {
  const db=openDb(':memory:');t.after(()=>db.close());
  const add=(title:string,extra:object={})=>createTask(db,{title,area:'qa',state:'preparada',spec:'Probar',
    acceptance:['Verde'],scope:['Docs'],...extra});
  return {db,add};
}
test('plan puro reparte un cupo explícito y no escribe eventos ni tareas',t=>{
  const {db,add}=setup(t),a=add('A'),b=add('B'),before=listEvents(db,0);
  assert.deepEqual(plan(db,config),[{taskId:a.id,action:'start',provider:'codex',reason:'Disponible'},
    {taskId:b.id,action:'wait',reason:'Sin hueco en codex'}]);
  assert.deepEqual(listEvents(db,0),before);assert.equal(requireTask(db,b.id).waitReason,null);
});
test('dependencia bloqueada conserva preparada y dos ticks solo notifican un cambio',t=>{
  const {db,add}=setup(t),base=add('X',{state:'pendiente'}),dependent=add('Y',{dependsOn:[base.id]});
  blockTask(db,base.id,'Revisar');
  tick(db,config,{} as any);tick(db,config,{} as any);
  assert.equal(requireTask(db,dependent.id).state,'preparada');
  assert.equal(requireTask(db,dependent.id).waitReason,'Depende de X (bloqueada)');
  assert.equal(listEvents(db,0).filter(e=>e.type==='task.waiting').length,1);
  assert.equal(db.prepare('select count(*) n from commands').get()!.n,0);
});
test('dependencia revisando solo permite arrancar tras aprobación, done también permite',t=>{
  const {db,add}=setup(t),base=add('X',{state:'revisando'}),dependent=add('Y',{dependsOn:[base.id]});
  assert.equal(plan(db,config).find(d=>d.taskId===dependent.id)!.action,'wait');
  db.prepare('update tasks set review_approved=1 where id=?').run(base.id);
  assert.equal(plan(db,config)[0].action,'start');
  db.prepare("update tasks set state='done',review_approved=0 where id=?").run(base.id);
  assert.equal(plan(db,config)[0].action,'start');
});
test('reservas reales y virtuales evitan arranques incompatibles por mayúsculas y separadores',t=>{
  const {db,add}=setup(t),a=add('A',{leases:['Content/UI/HUD.uasset']}),b=add('B',{leases:['content\\ui\\hud.uasset']});
  const decisions=plan(db,{});assert.equal(decisions[0].action,'start');assert.equal(decisions[1].action,'wait');
  assert.match(decisions[1].reason,/Esperando reserva/);
  acquire(db,'owner','other',['content/ui/hud.uasset']);
  assert.ok(plan(db,{}).every(d=>d.action==='wait'));assert.equal(requireTask(db,a.id).waitReason,null);
});
test('implementación alterna a Claude; arte ui qa lo prefieren',t=>{
  const {db,add}=setup(t);const active=add('Activo',{state:'implementando'});
  startRun(db,{taskId:active.id,role:'implementacion',provider:'codex'});
  const a=add('A');assert.equal(plan(db,{concurrency:{codex:1,claude:1}})[0].provider,'claude');
  for(const role of ['arte','ui','qa']) {
    db.prepare('update tasks set assignee_role=? where id=?').run(role,a.id);
    assert.equal(plan(db,{})[0].provider,'claude');
  }
});
const claudeOne={concurrency:{codex:2,claude:1}};
test('arte ui qa usan Codex si Claude está deshabilitado o lleno',t=>{
  const {db,add}=setup(t),task=add('QA',{assigneeRole:'qa'});
  assert.equal(plan(db,config)[0].provider,'codex');
  const active=add('Activo',{state:'implementando'});startRun(db,{taskId:active.id,role:'qa',provider:'claude'});
  for(const role of ['arte','ui','qa']) {
    db.prepare('update tasks set assignee_role=? where id=?').run(role,task.id);
    assert.equal(plan(db,claudeOne)[0].provider,'codex');
  }
});
test('revisor usa opuesto, espera su cupo y admite mismo proveedor solo con uno habilitado',t=>{
  const {db,add}=setup(t),review=add('Revisar',{assigneeRole:'revisor'});
  const implementation=startRun(db,{taskId:review.id,role:'implementacion',provider:'codex'});
  finishRun(db,implementation.id,'done','Listo');
  assert.equal(plan(db,claudeOne)[0].provider,'claude');
  const active=add('Activo',{state:'implementando'});startRun(db,{taskId:active.id,role:'qa',provider:'claude'});
  assert.deepEqual(plan(db,claudeOne),[{taskId:review.id,action:'wait',reason:'Sin hueco en claude'}]);
  assert.equal(plan(db,config)[0].provider,'codex');
});
test('intenciones manuales reservan capacidad sin duplicar runs ya nacidos y preservan payload',t=>{
  const {db,add}=setup(t),a=add('A'),b=add('B');
  const cmd=enqueue(db,'worker.start',{taskId:a.id,provider:'codex',role:'manual',skills:['tdd'],attempt:1},`worker.start:${a.id}:1`);
  assert.equal(plan(db,config).find(d=>d.taskId===a.id)!.reason,'Arranque pendiente');
  tick(db,config,{} as any);tick(db,config,{} as any);
  assert.equal(db.prepare("select count(*) n from commands where type='worker.start'").get()!.n,1);
  assert.equal(JSON.parse(db.prepare('select payload from commands where id=?').get(cmd.id)!.payload as string).role,'manual');
  startRun(db,{taskId:a.id,role:'manual',provider:'codex'});
  assert.equal(plan(db,{concurrency:{codex:2}}).find(d=>d.taskId===b.id)!.action,'start');
});
test('bloqueo previo, política terminada y árbol detenido nunca se reanudan por tick',t=>{
  const {db,add}=setup(t),blocked=add('Bloqueada'),policy=add('Política'),stopped=add('Detenida',{worktreeId:'old'});
  blockTask(db,blocked.id,'Esperar');
  enqueue(db,'worker.start',{taskId:policy.id,provider:'codex',attempt:7},`worker.start:${policy.id}:7`);
  db.prepare("update commands set state='done'").run();
  tick(db,{},{} as any);assert.equal(db.prepare('select count(*) n from commands').get()!.n,1);
  assert.ok([blocked,policy,stopped].every(task=>requireTask(db,task.id).waitReason));
});
test('actualizar explicación de espera no invalida una decisión abierta',t=>{
  const {db,add}=setup(t),task=add('Autorizar');
  const decision=openDecision(db,{taskId:task.id,reason:'Autorizar',options:[{id:'approve',label:'Sí',description:'Autorizar'}]});
  tick(db,config,{} as any);
  assert.equal(resolveDecision(db,decision.id,'approve','director').state,'resolved');
});
test('solo conflicto limpio permite el siguiente intento automático',t=>{
  const {db,add}=setup(t),a=add('A'),b=add('B');
  const clean=startRun(db,{taskId:a.id,provider:'codex',role:'implementacion',attempt:3});
  workerFailure(db,{runId:clean.id,conflicts:[{path:'HUD',taskId:b.id,runId:'holder'}]},'lease_conflict');
  const bad=startRun(db,{taskId:b.id,provider:'codex',role:'implementacion'});finishRun(db,bad.id,'failed','Error');
  tick(db,config,{} as any);
  const rows=db.prepare("select idempotency_key from commands where type='worker.start'").all();
  assert.deepEqual(rows.map(r=>r.idempotency_key),[`worker.start:${a.id}:4`]);
});
test('readConfig valida concurrencia desde dataDir real y conserva otros campos',()=>{
  const dir=mkdtempSync(join(tmpdir(),'kratos-config-'));
  try {
    writeFileSync(join(dir,'config.json'),JSON.stringify({concurrency:{codex:-1}}));
    assert.throws(()=>readConfig(dir),/invalid_worker_config/);
    writeFileSync(join(dir,'config.json'),'{"concurrency":{"claude":1},"unrealPath":"engine"}');
    assert.equal((readConfig(dir) as any).unrealPath,'engine');
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('OpenCode reconoce configuración pero no se selecciona sin adaptador',t=>{
  const {db,add}=setup(t),task=add('OpenCode',{assigneeProvider:'opencode'});
  assert.equal(concurrency({}).opencode,0);
  const decisions=plan(db,{concurrency:{opencode:3}} as any);
  assert.equal(decisions[0].taskId,task.id);assert.equal(decisions[0].action,'wait');
  assert.match(decisions[0].reason,/sin adaptador/i);
  db.prepare('update tasks set assignee_provider=null where id=?').run(task.id);
  assert.equal(plan(db,{concurrency:{opencode:3}} as any)[0].action,'wait');
  db.prepare('update tasks set leases=? where id=?').run('["Content/HUD.uasset"]',task.id);
  enqueue(db,'worker.start',{taskId:task.id,provider:'opencode',attempt:1},'opencode-pending');
  const codex=add('Codex disponible',{leases:['Content/HUD.uasset']});
  const available=plan(db,{concurrency:{codex:1,opencode:3}}).find(d=>d.taskId===codex.id)!;
  assert.equal(available.action,'start');assert.equal(available.provider,'codex');
  const dir=mkdtempSync(join(tmpdir(),'kratos-opencode-'));
  try {
    writeFileSync(join(dir,'config.json'),'{"concurrency":{"opencode":3}}');
    assert.equal(readConfig(dir).concurrency?.opencode,3);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('hito 5b: una run de assets ya terminada (character.setup) no impide arrancar el worker de la tarea',t=>{
  const {db,add}=setup(t),a=add('Héroe');
  finishRun(db,startRun(db,{taskId:a.id,role:'animacion',provider:'unreal'}).id,'done','BP_Hudson reproduce AM_ComboAttack');
  assert.deepEqual(plan(db,config),[{taskId:a.id,action:'start',provider:'codex',reason:'Disponible'}]);
});
