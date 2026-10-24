import type { DatabaseSync } from 'node:sqlite';
import type { WorkerContext } from './runner.ts';
import type { SchedulerConfig,WorkerProvider } from './config.ts';
import { listTasks,requireTask,setTaskWait } from './repo/tasks.ts';
import { enqueue } from './commands.ts';
import { automaticReason,conflicts,dependencyReason,nextAttempt,reservations } from './scheduler-state.ts';
import { chooseProvider } from './scheduler-provider.ts';
import { leaseWaitReason } from './leases.ts';
import { normalizedPaths } from './handlers/worker-policy.ts';
import { transaction } from './repo/rows.ts';
import { appendEvent } from './store.ts';

export type PlanDecision = {taskId:string;action:'start'|'wait';reason:string;provider?:WorkerProvider};
export function plan(db:DatabaseSync,config:SchedulerConfig): PlanDecision[] {
  const {usage,leases,runs}=reservations(db);
  // hito 13: la prioridad del director manda; a igual prioridad, la más antigua (orden estable por rowid)
  return listTasks(db,{state:'preparada'}).sort((a,b)=>b.priority-a.priority).map(task=>{
    const wait=(reason:string):PlanDecision=>({taskId:task.id,action:'wait',reason});
    const reason=automaticReason(db,task) ?? dependencyReason(db,task);
    if(reason) return wait(reason);
    const occupied=conflicts(task.leases,leases,task.id);
    if(occupied.length) return wait(leaseWaitReason(occupied));
    const implementation=runs.filter(r=>r.taskId===task.id&&r.role!=='revisor').at(-1);
    const implementer=['codex','claude','opencode'].includes(implementation?.provider ?? '') ? implementation!.provider as WorkerProvider : undefined;
    const selected=chooseProvider(task.assigneeRole ?? 'implementacion',config,usage,implementer,
      task.assigneeProvider==='codex'||task.assigneeProvider==='claude'||task.assigneeProvider==='opencode' ? task.assigneeProvider : undefined);
    if(!selected.provider) return wait(selected.reason);
    usage[selected.provider]++;
    leases.push(...normalizedPaths(task.leases).map(path=>({path,taskId:task.id,runId:`plan:${task.id}`})));
    return {taskId:task.id,action:'start',reason:selected.reason,provider:selected.provider};
  });
}
/** Director en pausa (hito 6): no se encolan arranques nuevos; integraciones y cierres en curso siguen. */
function paused(db:DatabaseSync):boolean {
  if(!db.prepare('select paused from director where id=1').get()?.paused) return false;
  const since=Number(db.prepare("select coalesce(max(seq),0) seq from events where type='director.paused'").get()!.seq);
  if(!db.prepare("select 1 from events where type='scheduler.paused' and seq>?").get(since)) appendEvent(db,'scheduler.paused',null,{});
  return true;
}
export function tick(db:DatabaseSync,config:SchedulerConfig,ctx:WorkerContext):void {
  transaction(db,()=>{
    const pause=paused(db);
    for(const decision of plan(db,config)) {
      const task=requireTask(db,decision.taskId);
      const reason=decision.action==='wait' ? decision.reason : pause ? 'Director en pausa' : null;
      setTaskWait(db,task.id,reason);
      if(decision.action!=='start' || pause) continue;
      // La revisión real tiene un protocolo independiente, que incorpora la tarea siguiente.
      if(task.assigneeRole==='revisor') continue;
      const attempt=nextAttempt(db,task.id);
      enqueue(db,'worker.start',{taskId:task.id,provider:decision.provider,role:task.assigneeRole ?? 'implementacion',skills:[],attempt},
        `worker.start:${task.id}:${attempt}`);
    }
  });
}
