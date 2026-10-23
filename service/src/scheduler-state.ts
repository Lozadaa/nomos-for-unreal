import type { DatabaseSync } from 'node:sqlite';
import type { Run,Task } from './model.ts';
import { filtered } from './repo/rows.ts';
import { getTask } from './repo/tasks.ts';
import { listLeases,type LeaseConflict } from './leases.ts';
import { normalizedPaths } from './handlers/worker-policy.ts';
import type { WorkerProvider } from './config.ts';

export type StartIntent={id:string;taskId:string;provider:WorkerProvider;attempt:number;review?:boolean;generation?:string};
export function startIntents(db:DatabaseSync,beforeId?:string):StartIntent[] {
  const rows=db.prepare("select rowid,id,type,payload,state from commands where type in ('worker.start','review.start') order by rowid").all();
  const cutoff=beforeId ? db.prepare('select rowid from commands where id=?').get(beforeId)?.rowid : undefined;
  const previous=cutoff===undefined ? rows : rows.filter(r=>Number(r.rowid)<Number(cutoff));
  return previous.filter(r=>r.state==='pending'||r.state==='running').flatMap(r=>{
    const payload=JSON.parse(r.payload as string);
    return ['codex','claude','opencode'].includes(payload.provider)
      ? [{id:r.id as string,...payload,attempt:payload.attempt ?? 1,review:r.type==='review.start'}] : [];
  });
}
export function reservations(db:DatabaseSync,beforeId?:string) {
  const runs=filtered<Run>(db,'runs'),usage={codex:0,claude:0,opencode:0},leases:LeaseConflict[]=[...listLeases(db)];
  for(const run of runs) if(run.state==='running' && (run.provider==='codex'||run.provider==='claude')) usage[run.provider]++;
  for(const intent of startIntents(db,beforeId)) {
    if(intent.provider==='opencode') continue;
    if(runs.some(r=>intent.review ? r.metadata.startCommandId===intent.id && (r.state==='running'
      || r.metadata.review?.generation===intent.generation)
      : r.role!=='revisor'&&r.taskId===intent.taskId&&r.attempt===intent.attempt)) continue;
    usage[intent.provider]++;
    const task=getTask(db,intent.taskId);
    for(const path of task && !intent.review ? normalizedPaths(task.leases) : []) leases.push({path,taskId:intent.taskId,runId:intent.id});
  }
  return {usage,leases,runs};
}
export function conflicts(paths:string[],leases:LeaseConflict[],taskId?:string):LeaseConflict[] {
  const folded=normalizedPaths(paths).map(p=>p.toLowerCase());
  return leases.filter(l=>l.taskId!==taskId && folded.includes(l.path.toLowerCase()));
}
export function dependencyReason(db:DatabaseSync,task:Task):string|null {
  for(const id of task.dependsOn) {
    const dep=getTask(db,id);
    if(!dep) return `Depende de ${id} (desconocida)`;
    if(dep.blockedReason||dep.decisionId) return `Depende de ${dep.title} (bloqueada)`;
    if(dep.state!=='done' && !(dep.state==='revisando'&&dep.reviewApproved===1)) return `Depende de ${dep.title} (${dep.state})`;
  }
  return null;
}
export function nextAttempt(db:DatabaseSync,taskId:string):number {
  const history=filtered<Run>(db,'runs',{taskId});
  return history.length ? Math.max(...history.map(r=>r.attempt))+1 : 1;
}
export function automaticReason(db:DatabaseSync,task:Task):string|null {
  if(task.blockedReason||task.decisionId) return task.blockedReason ?? 'Esperando decisión';
  const history=filtered<Run>(db,'runs',{taskId:task.id});
  const active=history.find(r=>r.state==='running');
  if(active) return active.metadata.phase==='preparing'&&active.metadata.waiting
    ? active.metadata.question ?? 'Preparación en espera' : 'Worker en ejecución';
  if(task.assigneeRole!=='revisor' && (task.worktreeId || history.some(r=>
    r.state!=='failed'||r.summary!=='lease_conflict'||r.metadata.uncertain!==false||r.metadata.worktreeId)))
    return 'Requiere reconciliar worker existente';
  if(startIntents(db).some(i=>i.taskId===task.id)) return 'Arranque pendiente';
  const terminal=db.prepare("select payload from commands where type='worker.start' and state in ('done','failed') and json_extract(payload,'$.taskId')=?")
    .all(task.id);
  if(terminal.some(row=>!history.some(run=>run.attempt===(JSON.parse(row.payload as string).attempt ?? 1))))
    return 'Requiere arranque explícito';
  return null;
}
