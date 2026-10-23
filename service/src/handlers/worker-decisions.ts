import type { DatabaseSync } from 'node:sqlite';
import type { Task } from '../model.ts';
import { requireTask } from '../repo/tasks.ts';
import { updateRun, requireRun } from '../repo/worker.ts';
import { refreshPendingDecision } from '../repo/decisions.ts';

function blockSequence(db: DatabaseSync,taskId: string): number {
  return Number(db.prepare("select coalesce(max(seq),0) seq from events where type='task.blocked' and json_extract(payload,'$.taskId')=?")
    .get(taskId)!.seq);
}
export function dispatchGuard(db: DatabaseSync,task: Task) {
  return {taskId:task.id,blockedReason:task.blockedReason,blockSequence:blockSequence(db,task.id)};
}
export function dispatchBlocked(db: DatabaseSync,guard: ReturnType<typeof dispatchGuard>): boolean {
  const task=requireTask(db,guard.taskId);
  return !!task.decisionId || !!task.blockedReason &&
    (task.blockedReason!==guard.blockedReason || blockSequence(db,task.id)>guard.blockSequence);
}
export function pauseForDecision(db: DatabaseSync,taskId: string,runId?: string) {
  const task=requireTask(db,taskId);
  if(runId) updateRun(db,runId,{waiting:true,
    phase:requireRun(db,runId).metadata.phase==='preparing' ? 'preparing' : 'waiting',
    question:task.blockedReason ?? 'Esperando decisión del director'});
  const decision=refreshPendingDecision(db,taskId);
  return {blocked:true,taskId,runId,decisionId:decision?.id ?? task.decisionId};
}
