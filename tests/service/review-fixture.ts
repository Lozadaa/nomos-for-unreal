import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './worker-fixture.ts';
import { filtered } from '../../service/src/repo/rows.ts';
import { requireRun, runTree } from '../../service/src/repo/worker.ts';
import type { Run } from '../../service/src/model.ts';

export async function reviewFixture(t:any,checks=false) {
  const f=fixture(t);
  writeFileSync(join(f.dataDir,'config.json'),JSON.stringify({concurrency:{codex:2,claude:0}}));
  if(checks) f.db.prepare('update tasks set acceptance=? where id=?').run('["check: npm test"]',f.task.id);
  await f.start();const implementer=f.run(),tree=f.tree();
  writeFileSync(join(tree.path,'resultado.md'),'Resultado revisable\n');
  f.output('KRATOS_DONE {"summary":"Terminado","commits":[],"tests":"passed"}');
  await f.invoke('worker.poll',{runId:implementer.id});
  const startReview=async()=>{
    assert.equal(typeof f.handlers['review.start'],'function','Falta el arranque de revisión');
    const state=f.state();state.treePath=join(f.dir,'review-'+crypto.randomUUID());state.terminalHandle='term_review';state.tail=[];
    writeFileSync(f.file,JSON.stringify(state));
    return f.invoke('review.start',{taskId:f.task.id,implementerRunId:implementer.id});
  };
  const reviewer=()=>filtered<Run>(f.db,'runs',{taskId:f.task.id}).filter(r=>r.role==='revisor').at(-1)!;
  const poll=()=>f.invoke('review.poll',{runId:reviewer().id,generation:reviewer().metadata.pollGeneration ?? 0});
  return {...f,implementer,implementerTree:tree,startReview,reviewer,poll,
    current:()=>requireRun(f.db,implementer.id),reviewTree:()=>runTree(f.db,reviewer())};
}
