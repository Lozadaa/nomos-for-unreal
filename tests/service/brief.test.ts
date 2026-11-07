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
    assert.doesNotMatch(renderBrief(task,run),/worker turn/);
  } finally {db.close();}
});
