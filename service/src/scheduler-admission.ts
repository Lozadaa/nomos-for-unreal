import type { WorkerContext } from './runner.ts';
import type { Task } from './model.ts';
import { readConfig,concurrency,type WorkerProvider } from './config.ts';
import { conflicts,dependencyReason,reservations } from './scheduler-state.ts';
import { leaseWaitReason } from './leases.ts';
import { requireTask } from './repo/tasks.ts';

/** Volver a llamar tras awaits, inmediatamente antes de efectos; prioridades FIFO entre intenciones. */
export function schedulingBlocked(ctx:WorkerContext,task:Task,provider:WorkerProvider,commandId:string,
  checkLeases=true,ownRunId?:string):string|null {
  task=requireTask(ctx.db,task.id);
  if(task.blockedReason||task.decisionId) return task.blockedReason ?? 'Esperando decisión';
  const dependency=dependencyReason(ctx.db,task);
  if(dependency) return dependency;
  const {usage,leases,runs}=reservations(ctx.db,commandId);
  if(runs.some(r=>r.id===ownRunId&&r.taskId===task.id&&r.provider===provider&&r.state==='running')) usage[provider]--;
  if(checkLeases) {
    const occupied=conflicts(task.leases,leases,task.id);
    if(occupied.length) return leaseWaitReason(occupied);
  }
  if(usage[provider]>=concurrency(readConfig(ctx.dataDir))[provider]) return `Sin hueco en ${provider}`;
  return null;
}
