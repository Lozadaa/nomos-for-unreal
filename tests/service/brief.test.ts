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
