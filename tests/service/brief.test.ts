import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../service/src/db.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { startRun } from '../../service/src/repo/runs.ts';
import { renderBrief } from '../../service/src/brief.ts';
test('brief entrega criterios numerados, límites, rol y contexto sin evaluar la especificación',()=>{
  const db=openDb(':memory:');
  try {
    const task=createTask(db,{title:'Título',area:'qa',spec:'$(touch owned)',acceptance:['A','B'],scope:['Docs']});
    const run=startRun(db,{taskId:task.id,role:'programmer',provider:'codex',skills:['tdd']});
    const brief=renderBrief(task,run,{projectContext:'UE 5.6'});
    for (const pattern of [/Título/,/\$\(touch owned\)/,/1\. A\n2\. B/,/Docs/,/TDD/,/push/,/NOMOS_DONE/,/NOMOS_ASK/,/programmer/,/tdd/,/UE 5.6/]) assert.match(brief,pattern);
  } finally {db.close();}
});
test('hito 22: el brief da la orden de turno de Unreal (--wait y --release) solo si el servicio la pasa',()=>{
  const db=openDb(':memory:');
  try {
    const task=createTask(db,{title:'J2.2',area:'escenarios',spec:'x',acceptance:['A'],scope:['Docs']});
    const run=startRun(db,{taskId:task.id,role:'implementacion',provider:'claude'});
    const brief=renderBrief(task,run,{turn:'node "cli.ts" worker turn '+task.id+' --data ".nomos"'});
    assert.match(brief,new RegExp(`worker turn ${task.id} --data "\.nomos" --wait`));
    assert.match(brief,/--release/);
    assert.ok(brief.includes(`\`node "cli.ts" ue py --tarea ${task.id} --data ".nomos" <script.py> [--env K=V]\``), 'x10: el Python del editor va al editor caliente');
    assert.ok(brief.includes(`\`node "cli.ts" ue test --tarea ${task.id} --data ".nomos" <filtro>\``), 'los tests de automatización también');
    assert.match(brief, /lo suelta al acabar/, 'acelera: el turno es por orden');
    assert.ok(brief.includes(`ue receta --tarea ${task.id} --data ".nomos" <receta.json>`), 'acelera: recetas en vez de scripts');
    assert.doesNotMatch(renderBrief(task,run),/worker turn/);
  } finally {db.close();}
});
test('modo rápido: el brief lo explica, los valores por defecto cambian y lo explícito manda',async()=>{
  const {heavyMax,minFreeRamGb,heavyRequiresNoEditor,limits}=await import('../../service/src/config.ts');
  const db=openDb(':memory:');
  try {
    const task=createTask(db,{title:'T',area:'qa',spec:'x',acceptance:['A'],scope:['Docs']});
    const run=startRun(db,{taskId:task.id,role:'implementacion',provider:'claude'});
    assert.match(renderBrief(task,run,{rapido:true}),/Modo rápido/);
    assert.doesNotMatch(renderBrief(task,run),/Modo rápido/);
  } finally {db.close();}
  assert.deepEqual([heavyMax({rapido:true}),minFreeRamGb({rapido:true}),heavyRequiresNoEditor({rapido:true}),limits({rapido:true}).corrections],[2,1.5,false,1]);
  assert.deepEqual([heavyMax({}),minFreeRamGb({}),heavyRequiresNoEditor({}),limits({}).corrections],[1,6,true,3]);
  assert.equal(heavyMax({rapido:true,scheduler:{heavy:{maxConcurrent:3}}}),3);
});
test('ue59: con el motor 5.9 el brief manda leer el mapa de features y pide NOMOS_UE59; con 5.8 o sin versión, no',()=>{
  const db=openDb(':memory:');
  try {
    const task=createTask(db,{title:'Vidrio',area:'assets',spec:'x',acceptance:['A'],scope:['Content']});
    const run=startRun(db,{taskId:task.id,role:'implementacion',provider:'claude',skills:['ue-oficio']});
    const brief=renderBrief(task,run,{engine:'5.9.0',projectContext:'Juego de metras'});
    assert.match(brief,/Unreal 5\.9/);
    assert.match(brief,/ue-oficio\/references\/ue59-juego\.md/);
    assert.match(brief,/NOMOS_UE59/);
    assert.match(brief,/Juego de metras/,'el contexto del proyecto se mantiene');
    for (const engine of ['5.8.3',undefined]) assert.doesNotMatch(renderBrief(task,run,{engine}),/NOMOS_UE59/);
  } finally {db.close();}
});
test('jam: el brief de quien implementa trae el camino corto y las dos reglas de entrega; el del revisor, no',()=>{
  const db=openDb(':memory:');
  try {
    const task=createTask(db,{title:'Brasa',area:'gameplay',spec:'x',acceptance:['A'],scope:['Source']});
    const brief=renderBrief(task,startRun(db,{taskId:task.id,role:'implementacion',provider:'claude'}));
    assert.match(brief,/## Camino corto[\s\S]*\| Poner cosas en el nivel \|[\s\S]*## Contexto del proyecto/);
    assert.match(brief,/Antes de `NOMOS_DONE`: `git status --short` vacío y `revisar_acabado\.py` sin fallos/);
    assert.match(brief,/docs\/aprendido\.md/);
    for(const role of ['revisor','qa','director']) assert.doesNotMatch(renderBrief(task,startRun(db,{taskId:task.id,role,provider:'claude'})),/Camino corto/);
  } finally {db.close();}
});
