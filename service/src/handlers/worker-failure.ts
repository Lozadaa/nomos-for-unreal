import type { DatabaseSync } from 'node:sqlite';
import type { Run } from '../model.ts';
import { filtered, transaction } from '../repo/rows.ts';
import { finishRun } from '../repo/runs.ts';
import { blockTask, requireTask, moveTask } from '../repo/tasks.ts';
import { updateRun } from '../repo/worker.ts';
import { refreshPendingDecision } from '../repo/decisions.ts';
import { leaseWaitReason, release } from '../leases.ts';

export function workerFailure(db: DatabaseSync, payload: any, cause: string): void {
  transaction(db,()=>{
  const runs=filtered<Run>(db,'runs',payload.runId ? {id:payload.runId} : {taskId:payload.taskId});
  const taskId=payload.taskId ?? runs[0]?.taskId;
  for(const run of runs.filter(r=>r.state==='running' || payload.runId && r.state==='done')) {
    if(run.state==='done') updateRun(db,run.id,{}, {state:'running'});
    finishRun(db,run.id,'failed',cause);
    updateRun(db,run.id,{waiting:false,phase:'finished',uncertain:cause!=='lease_conflict',pollGeneration:(run.metadata.pollGeneration ?? 0)+1});
  }
  for(const run of runs) release(db,run.id);
  if(taskId) {
    const task=requireTask(db,taskId);
    if(cause==='lease_conflict') {
      db.prepare('update tasks set wait_reason=? where id=?').run(leaseWaitReason(payload.conflicts),taskId);
      moveTask(db,taskId,'preparada');return;
    }
    blockTask(db,taskId,cause,task.decisionId ?? undefined);
    refreshPendingDecision(db,taskId);
  }
  });
}
