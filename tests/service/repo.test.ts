import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../service/src/db.ts';
import { createTask, getTask, listTasks, moveTask, blockTask } from '../../service/src/repo/tasks.ts';
import { startRun, finishRun } from '../../service/src/repo/runs.ts';
import { openDecision, resolveDecision, listDecisions } from '../../service/src/repo/decisions.ts';
import { ensureBudget, spend, budgetSummary } from '../../service/src/repo/budget.ts';
import { addArtifact, listArtifacts, recordTestRun } from '../../service/src/repo/artifacts.ts';
import { upsertEntry, searchCatalog, listCatalog } from '../../service/src/repo/catalog.ts';
import { detectCapabilities } from '../../service/src/repo/capabilities.ts';
import { listEvents } from '../../service/src/store.ts';
const task = (db: any, id = 't') => createTask(db, { id, title: id, area: 'gameplay' });
test('tareas, runs y artefactos conservan datos y eventos', () => {
 const db = openDb(':memory:'); try {
 const t = task(db); assert.deepEqual(t.acceptance, []); assert.equal(getTask(db, 'missing'), undefined);
 assert.equal(listTasks(db, { area: 'audio' }).length, 0);
 moveTask(db,t.id,'implementando'); assert.throws(()=>moveTask(db,t.id,'done'), /invalid_transition/);
 blockTask(db,t.id,'fallo'); assert.equal(getTask(db,t.id)!.blockedReason,'fallo');
 moveTask(db,t.id,'cerrando'); assert.equal(moveTask(db,t.id,'done').state,'done');
 const r = startRun(db,{taskId:t.id,role:'dev',provider:'codex',skills:['test']});
 assert.equal(finishRun(db,r.id,'done','bien').summary,'bien');
 assert.throws(()=>finishRun(db,r.id,'failed','doble'), /invalid_transition/);
 const a = addArtifact(db,{taskId:t.id,runId:r.id,kind:'report',path:'a',provenance:{source:'test'}});
 assert.deepEqual(listArtifacts(db,{taskId:t.id}),[a]);
 assert.equal(recordTestRun(db,{taskId:t.id,commit:'abc',result:'passed'}).commit,'abc');
 assert.ok(listEvents(db,0).every(e=>e.messageId===null));
 } finally { db.close(); }
});
test('decisiones nacen válidas, preservan bloqueos ajenos y caducan solo por su tarea',()=>{
 const db=openDb(':memory:');try {
 task(db); task(db,'other'); blockTask(db,'t','fallo cierre');
 const d=openDecision(db,{taskId:'t',reason:'elige',options:[{id:'ok',label:'Sí',description:'seguir'}]});
 moveTask(db,'other','preparada'); resolveDecision(db,d.id,'ok','user');
 assert.equal(getTask(db,'t')!.blockedReason,'fallo cierre');
 const d2=openDecision(db,{taskId:'t',reason:'elige',options:[{id:'ok',label:'Sí',description:'seguir'}]});
 moveTask(db,'t','preparada'); assert.throws(()=>resolveDecision(db,d2.id,'ok','user'),/decision_stale/);
 assert.equal(listDecisions(db,'stale').length,1);
 }finally{db.close();}
});
test('presupuesto acepta exacto, null ilimitado y exceso persiste decisión sin gasto',()=>{
 const db=openDb(':memory:');try {
 task(db); const r=startRun(db,{taskId:'t',role:'dev',provider:'codex'});
 for(const scope of ['task','workspace'] as const){
 const b=ensureBudget(db,scope,scope==='task'?'t':'w',{tokens:10,meshyCredits:0});
 spend(db,b.id,r.id,'tokens',10,'exacto'); spend(db,b.id,r.id,'buildMinutes',100,'sin límite');
 assert.throws(()=>spend(db,b.id,r.id,'tokens',1,'exceso'),/budget_exceeded/);
 assert.throws(()=>spend(db,b.id,r.id,'meshyCredits',1,''),/budget_exceeded/);
 assert.equal(budgetSummary(db,scope,b.scopeId).spent.tokens,10);
 assert.equal(budgetSummary(db,scope,b.scopeId).remaining.buildMinutes,null);
 assert.throws(()=>spend(db,b.id,'missing','tokens',1,''),/unknown_run/);
 assert.throws(()=>spend(db,b.id,r.id,'tokens',NaN,''),/invalid_amount/);
 }
 assert.equal(listDecisions(db).length,4); assert.equal(db.prepare('select count(*) n from spends').get()!.n,4);
 }finally{db.close();}
});
test('catálogo FTS sincroniza descripción, filtros y actualización sin interpretar operadores',()=>{
 const db=openDb(':memory:');try {
 const a=upsertEntry(db,{id:'a',name:'Hero',category:'character',description:'personaje fantasía',source:'fab'});
 assert.equal(searchCatalog(db,'personaje fantasía')[0].id,a.id);
 assert.equal(searchCatalog(db,'personaje',{source:'meshy'}).length,0);
 upsertEntry(db,{...a,description:'robot metálico'});
 assert.equal(searchCatalog(db,'fantasía').length,0); assert.equal(searchCatalog(db,'robot').length,1);
 assert.doesNotThrow(()=>searchCatalog(db,'" OR * -')); assert.equal(listCatalog(db).length,1);
 db.prepare('delete from catalog_entries where id=?').run('a'); assert.equal(searchCatalog(db,'robot').length,0);
 }finally{db.close();}
});
test('capacidades usan filesystem inyectado, config y PATH sin revelar claves',()=>{
 const paths=new Set(['custom/UnrealEditor-Cmd.exe','custom/blender.exe','bin/git.exe']);
 const fs={existsSync:(p:string)=>paths.has(p),readFileSync:()=>JSON.stringify({unrealPath:'custom/UnrealEditor-Cmd.exe',blenderPath:'custom/blender.exe'})};
 const caps=detectCapabilities({PATH:'bin',MESHY_API_KEY:'secret'},fs);
 assert.equal(caps.length,9); assert.equal(caps.find(c=>c.id==='unreal')!.state,'detectado');
 assert.equal(caps.find(c=>c.id==='blender')!.state,'detectado');
 assert.equal(caps.find(c=>c.id==='meshy')!.state,'detectado');
 assert.ok(caps.every(c=>['ausente','detectado'].includes(c.state))); assert.ok(!JSON.stringify(caps).includes('secret'));
});
test('fallo de evento revierte tarea y decisión sin dejar bloqueo parcial',()=>{
 const db=openDb(':memory:');try {
 task(db);db.exec("create trigger reject_event before insert on events begin select raise(abort, 'rechazado');end");
 assert.throws(()=>moveTask(db,'t','preparada'),/rechazado/);assert.equal(getTask(db,'t')!.state,'pendiente');
 assert.throws(()=>openDecision(db,{taskId:'t',reason:'elige',options:[]}),/rechazado/);
 assert.equal(listDecisions(db).length,0);assert.equal(getTask(db,'t')!.decisionId,null);
 }finally{db.close();}
});
test('resolver limpia su bloqueo, conserva otro idéntico y rechaza opciones inválidas',()=>{
 const db=openDb(':memory:');try {
 task(db);const options=[{id:'yes',label:'Sí',description:'seguir'}];
 const d=openDecision(db,{taskId:'t',reason:'igual',options});
 assert.throws(()=>resolveDecision(db,d.id,'no','user'),/unknown_option/);
 resolveDecision(db,d.id,'yes','user');assert.equal(getTask(db,'t')!.blockedReason,null);
 blockTask(db,'t','igual');const other=openDecision(db,{taskId:'t',reason:'igual',options});
 resolveDecision(db,other.id,'yes','user');assert.equal(getTask(db,'t')!.blockedReason,'igual');
 }finally{db.close();}
});
test('presupuesto valida pertenencia, métricas y límites sin mutar gastos',()=>{
 const db=openDb(':memory:');try {
 task(db);task(db,'other');const r=startRun(db,{taskId:'other',role:'dev',provider:'codex'});
 const b=ensureBudget(db,'task','t',{tokens:0});assert.equal(ensureBudget(db,'task','t',{tokens:100}).tokens,0);
 assert.throws(()=>spend(db,b.id,r.id,'tokens',0,null),/budget_task_mismatch/);
 assert.throws(()=>spend(db,b.id,r.id,'unknown' as any,0,null),/invalid_kind/);
 assert.throws(()=>ensureBudget(db,'workspace','bad',{tokens:-1}),/invalid_limit/);
 assert.equal(db.prepare('select count(*) n from spends').get()!.n,0);
 }finally{db.close();}
});
test('FTS incorpora catálogo anterior y estado filtra resultados',()=>{
 const db=openDb(':memory:');try {
 db.prepare(`insert into catalog_entries(id,created_at,updated_at,name,category,description,source,state,projects,formats,engine_versions,ai_forbidden,tags)
 values('old','now','now','Antiguo','prop','personaje fantasía','fab','cached','[]','[]','[]',0,'[]')`).run();
 assert.equal(searchCatalog(db,'fantasía',{state:'cached'})[0].id,'old');
 assert.equal(searchCatalog(db,'fantasía',{state:'owned'}).length,0);
 }finally{db.close();}
});
test('plugins y Launcher detectan rutas exactas sin ejecutar procesos',()=>{
 const paths=new Set([
 'C:\\Program Files\\Epic Games\\UE_5.8\\Engine\\Binaries\\Win64\\UnrealEditor-Cmd.exe',
 'C:\\Program Files\\Epic Games\\UE_5.8\\Engine\\Plugins\\Experimental\\ModelContextProtocol\\ModelContextProtocol.uplugin',
 'C:\\Program Files\\Epic Games\\UE_5.8\\Engine\\Plugins\\Experimental\\Toolsets\\AllToolsets\\AllToolsets.uplugin',
 'C:\\Program Files\\Epic Games\\UE_5.8\\Engine\\Plugins\\Fab\\Fab.uplugin',
 'C:\\Program Files\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe']);
 const fs={existsSync:(p:string)=>paths.has(p),readFileSync:()=>{throw new Error('ausente');}};
 const caps=detectCapabilities({},fs);
 for(const id of ['unreal','unreal_mcp','fab_plugin','launcher'])assert.equal(caps.find(c=>c.id===id)!.state,'detectado');
 assert.equal(caps.find(c=>c.id==='blender')!.state,'ausente');
});
test('decisiones sucesivas transfieren bloqueo propio y caducan la anterior', () => {
  const db = openDb(':memory:');
  try {
    task(db);
    const options = [{ id: 'ok', label: 'Sí', description: 'seguir' }];
    const first = openDecision(db, { taskId: 't', reason: 'uno', options });
    const second = openDecision(db, { taskId: 't', reason: 'dos', options });
    assert.equal(listDecisions(db, 'stale')[0].id, first.id);
    assert.equal(getTask(db, 't')!.blockedReason, 'dos');
    resolveDecision(db, second.id, 'ok', 'user');
    assert.equal(getTask(db, 't')!.blockedReason, null);
    assert.equal(getTask(db, 't')!.decisionId, null);
    blockTask(db, 't', 'cierre ajeno');
    openDecision(db, { taskId: 't', reason: 'tres', options });
    const last = openDecision(db, { taskId: 't', reason: 'cuatro', options });
    resolveDecision(db, last.id, 'ok', 'user');
    assert.equal(getTask(db, 't')!.blockedReason, 'cierre ajeno');
  } finally { db.close(); }
});
test('excesos de presupuesto repetidos permiten resolver el último sin bloqueo huérfano', () => {
  const db = openDb(':memory:');
  try {
    task(db);
    const run = startRun(db, { taskId: 't', role: 'dev', provider: 'codex' });
    const budget = ensureBudget(db, 'task', 't', { tokens: 0 });
    for (let i = 0; i < 2; i++) {
      assert.throws(() => spend(db, budget.id, run.id, 'tokens', 1, null), /budget_exceeded/);
    }
    const decisions = listDecisions(db);
    resolveDecision(db, decisions[1].id, 'stop', 'user');
    assert.equal(getTask(db, 't')!.blockedReason, null);
    assert.equal(getTask(db, 't')!.decisionId, null);
    assert.equal(db.prepare('select count(*) n from spends').get()!.n, 0);
  } finally { db.close(); }
});
