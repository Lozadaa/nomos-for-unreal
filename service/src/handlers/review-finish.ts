import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkerContext } from '../runner.ts';
import type { Run } from '../model.ts';
import type { Marker } from './worker-markers.ts';
import { reviewCurrent, reviewGeneration } from '../review.ts';
import { requireRun, updateRun } from '../repo/worker.ts';
import { requireTask, moveTask } from '../repo/tasks.ts';
import { finishRun } from '../repo/runs.ts';
import { transaction } from '../repo/rows.ts';
import { addArtifact } from '../repo/artifacts.ts';
import { appendEvent } from '../store.ts';
import { enqueue } from '../commands.ts';

export async function finishReview(ctx:WorkerContext,run:Run,marker:Extract<Marker,{kind:'REVIEW'}>):Promise<void> {
  const {db}=ctx,snapshot=run.metadata.review;
  const current=!!snapshot && await reviewCurrent(ctx,run.taskId,snapshot);
  transaction(db,()=>{
    run=requireRun(db,run.id);if(run.state!=='running') return;
    const task=requireTask(db,run.taskId),implementer=snapshot ? requireRun(db,snapshot.implementerRunId) : undefined;
    const stale=!current || !implementer || implementer.state!=='done'
      || reviewGeneration(task,implementer)!==snapshot!.inputGeneration || !!task.decisionId || !!task.blockedReason;
    const report={...marker,runId:run.id,...snapshot,stale};
    const path=`review-${run.id}.json`;mkdirSync(join(ctx.dataDir,'artifacts'),{recursive:true});
    writeFileSync(join(ctx.dataDir,'artifacts',path),JSON.stringify(report,null,2)+'\n');
    finishRun(db,run.id,'done',stale ? 'Revisión desactualizada' : marker.approved ? 'Aprobado' : 'Correcciones requeridas');
    updateRun(db,run.id,{waiting:false,phase:'finished',markerBuffer:''});
    addArtifact(db,{taskId:run.taskId,runId:run.id,kind:'report',path,provenance:report});
    appendEvent(db,'review.finished',null,{taskId:run.taskId,...report});
    if(stale) return;
    db.prepare('update tasks set review_approved=? where id=?').run(marker.approved ? 1 : 0,run.taskId);
    if(marker.approved) {
      if(task.acceptance.some(s=>s.startsWith('check:'))) moveTask(db,run.taskId,'probando');
    } else {
      const text='Correcciones de revisión:\n'+marker.findings.map(f=>`${f.file}:${f.line} [${f.severity}] ${f.note}`).join('\n');
      enqueue(db,'worker.send',{runId:implementer!.id,text},`review.correction:${run.id}`);
      moveTask(db,run.taskId,'implementando');
    }
  });
}
