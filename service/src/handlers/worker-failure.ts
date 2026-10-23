import type { DatabaseSync } from 'node:sqlite';
import type { Run } from '../model.ts';
import { filtered } from '../repo/rows.ts';
import { finishRun } from '../repo/runs.ts';
import { blockTask, requireTask } from '../repo/tasks.ts';
import { updateRun } from '../repo/worker.ts';
import { refreshPendingDecision } from '../repo/decisions.ts';

export function workerFailure(db: DatabaseSync, payload: any, cause: string): void {
  const runs=filtered<Run>(db,'runs',payload.runId ? {id:payload.runId} : {taskId:payload.taskId});
  const taskId=payload.taskId ?? runs[0]?.taskId;
  for(const run of runs.filter(r=>r.state==='running' || payload.runId && r.state==='done')) {
    if(run.state==='done') updateRun(db,run.id,{}, {state:'running'});
    finishRun(db,run.id,'failed',cause);
    updateRun(db,run.id,{waiting:false,phase:'finished',uncertain:true,pollGeneration:(run.metadata.pollGeneration ?? 0)+1});
  }
  if(taskId) {
    const task=requireTask(db,taskId);
    blockTask(db,taskId,cause,task.decisionId ?? undefined);
    refreshPendingDecision(db,taskId);
  }
}
