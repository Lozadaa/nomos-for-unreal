import type { DatabaseSync } from 'node:sqlite';
import type { Run,Task } from './model.ts';
import { filtered } from './repo/rows.ts';
import { getTask } from './repo/tasks.ts';
import { listLeases,type LeaseConflict } from './leases.ts';
import { normalizedPaths } from './handlers/worker-policy.ts';
import { concurrency,type SchedulerConfig,type WorkerProvider } from './config.ts';
import { taskCode } from './play.ts';
import { unsettled } from './handlers/reconcile.ts';

export type Usage=Record<WorkerProvider|'revisor',number>;
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
  // tiempo muerto: revisores y QA (role `revisor`) tienen cupo propio y no ocupan el de los implementadores
  const runs=filtered<Run>(db,'runs'),usage:Usage={codex:0,claude:0,opencode:0,revisor:0},leases:LeaseConflict[]=[...listLeases(db)];
  const slot=(run:Pick<Run,'role'|'provider'>)=>run.role==='revisor' ? 'revisor' : run.provider as 'codex'|'claude';
  for(const run of runs) if(run.state==='running' && run.role!=='director' && (run.provider==='codex'||run.provider==='claude')) usage[slot(run)]++;
  for(const run of lingering(db,runs)) usage[slot(run)]++;
  for(const intent of startIntents(db,beforeId)) {
    if(intent.provider==='opencode') continue;
    if(runs.some(r=>intent.review ? r.metadata.startCommandId===intent.id && (r.state==='running'
      || r.metadata.review?.generation===intent.generation)
      : r.role!=='revisor'&&r.taskId===intent.taskId&&r.attempt===intent.attempt)) continue;
    usage[intent.review ? 'revisor' : intent.provider]++;
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
    // hito 30: la dependencia cuenta integrada (cerrando o done), no solo con la revisión aprobada: B nace de la main que ya trae A
    if(dep.state!=='cerrando' && dep.state!=='done') return `Depende de ${dep.title} (${dep.reviewApproved===1 ? 'aprobada, sin integrar' : dep.state})`;
  }
  return null;
}
export function nextAttempt(db:DatabaseSync,taskId:string):number {
  const history=filtered<Run>(db,'runs',{taskId});
  // hito 13: un arranque que no llegó a crear run (Decisión de reconciliar) también gasta su número
  const started=db.prepare("select payload from commands where type='worker.start' and json_extract(payload,'$.taskId')=?").all(taskId)
    .map(row=>JSON.parse(row.payload as string).attempt ?? 1);
  if(history.length||started.length) return Math.max(...history.map(r=>r.attempt),...started)+1;
  // continuación después de DONE (hito 6): el run nuevo sigue la numeración del responsable original
  const parent=getTask(db,taskId)?.parentTaskId;
  const previous=parent ? filtered<Run>(db,'runs',{taskId:parent}).filter(r=>r.provider==='codex'||r.provider==='claude') : [];
  return previous.length ? Math.max(...previous.map(r=>r.attempt))+1 : 1;
}
export function automaticReason(db:DatabaseSync,task:Task):string|null {
  if(task.blockedReason||task.decisionId) return task.blockedReason ?? 'Esperando decisión';
  const history=filtered<Run>(db,'runs',{taskId:task.id});
  const active=history.find(r=>r.state==='running');
  if(active) return active.metadata.phase==='preparing'&&active.metadata.waiting
    ? active.metadata.question ?? 'Preparación en espera' : 'Worker en ejecución';
  // hito 5b: una run de assets terminada (migración, character.setup) no es un worker que reconciliar
  // hito 12: una run de OpenCode descartada (no pudo arrancar) tampoco deja nada que reconciliar
  // hito 13: una run cancelada y reconciliada (terminal cerrado, árbol retirado) tampoco
  if(task.assigneeRole!=='revisor' && (task.worktreeId || unsettled(db,task.id).length))
    return 'Requiere reconciliar worker existente';
  if(startIntents(db).some(i=>i.taskId===task.id)) return 'Arranque pendiente';
  // el arranque que se paró en la Decisión de reconciliar ya no exige uno explícito una vez reconciliada
  const reconciled=db.prepare("select max(created_at) at from events where type='task.reconciled' and json_extract(payload,'$.taskId')=?").get(task.id)?.at ?? '';
  const terminal=db.prepare("select payload from commands where type='worker.start' and state in ('done','failed') and json_extract(payload,'$.taskId')=? and updated_at>?")
    .all(task.id,reconciled);
  if(terminal.some(row=>!history.some(run=>run.attempt===(JSON.parse(row.payload as string).attempt ?? 1))))
    return 'Requiere arranque explícito';
  return null;
}
/** Hito 17: runs terminadas cuyo worker sigue vivo (terminal ocupado o corrección encolada); un terminal cuenta una vez. */
export function lingering(db:DatabaseSync,runs:Run[]):Run[] {
  const sends=new Set(db.prepare("select json_extract(payload,'$.runId') id from commands where type='worker.send' and state in ('pending','running')")
    .all().map(r=>r.id as string));
  const seen=new Set(runs.filter(r=>r.state==='running').map(r=>r.sessionRef));
  return runs.filter(r=>{
    if(r.state==='running' || (r.provider!=='codex'&&r.provider!=='claude') || !r.sessionRef || seen.has(r.sessionRef)) return false;
    if(!(r.metadata.terminalBusy&&!r.metadata.terminalClosed) && !sends.has(r.id)) return false;
    seen.add(r.sessionRef);return true;
  });
}
/** «Cupo lleno: J1.10 corrigiendo» cuando el hueco de `provider` lo ocupa un worker terminado que sigue trabajando. */
export function busyReason(db:DatabaseSync,provider:string):string|null {
  const busy=lingering(db,filtered<Run>(db,'runs')).filter(r=>r.provider===provider);
  return busy.length ? `Cupo lleno: ${busy.map(r=>`${label(db,r.taskId)} corrigiendo`).join(', ')}` : null;
}
const label=(db:DatabaseSync,taskId:string)=>{const title=getTask(db,taskId)?.title ?? taskId;return taskCode(title) ?? title;};
/** Para `nomos status`: el cupo lleno por workers terminados que siguen trabajando, o `null`. */
export function capacityNote(db:DatabaseSync,config:SchedulerConfig):string|null {
  const {usage}=reservations(db),limits=concurrency(config);
  const full=(['codex','claude'] as const).filter(p=>usage[p]>=limits[p]).map(p=>busyReason(db,p)).filter(Boolean) as string[];
  return full.length ? full.join('; ').replace(/^Cupo/,'cupo') : null;
}
