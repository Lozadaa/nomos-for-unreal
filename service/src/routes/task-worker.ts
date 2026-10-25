import { randomUUID } from 'node:crypto';
import { body, json } from '../http.ts';
import { requireTask, moveTask } from '../repo/tasks.ts';
import { filtered, transaction } from '../repo/rows.ts';
import { enqueue } from '../commands.ts';
import { normalizedPaths } from '../handlers/worker-policy.ts';
import { areas, choice, id, text, type Context } from './context.ts';
import type { Run } from '../model.ts';
import { resumeWorkerStart } from './worker-resume.ts';
import { reconcileStates } from '../handlers/reconcile.ts';
import { nextAttempt } from '../scheduler-state.ts';

export function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(text);
}
export function taskSpec(data: Record<string,unknown>) {
  const area=choice(typeof data.area==='string' ? data.area : '',areas);
  if (!text(data.spec) || !strings(data.acceptance) || !data.acceptance.length) throw new Error('invalid_worker_spec');
  const scope=normalizedPaths(data.scope);
  if (!scope.length) throw new Error('invalid_worker_scope');
  return {spec:data.spec,acceptance:data.acceptance,area:area!,scope};
}
/**
 * Hito 21: sin intento explícito, el último si sigue vivo o no llegó a arrancar (repetirlo es idempotente);
 * si su run ya terminó o la orden falló, el siguiente. Nunca el `worker.start` de un intento cerrado.
 */
function currentAttempt(db: Context['db'],taskId:string):number {
  const last=db.prepare(`select id,state,json_extract(payload,'$.attempt') attempt from commands where type='worker.start'
    and json_extract(payload,'$.taskId')=? order by json_extract(payload,'$.attempt') desc limit 1`).get(taskId);
  const ended=!last || last.state==='failed' || db.prepare(`select 1 from runs where task_id=? and state!='running'
    and json_extract(metadata,'$.startCommandId')=?`).get(taskId,last.id);
  return ended ? nextAttempt(db,taskId) : Number(last.attempt ?? 1);
}
export async function taskWorker({db,req,res,url}: Context): Promise<boolean> {
  const match=/^\/tasks\/([^/]+)\/(spec|worker|reconcile)$/.exec(url.pathname);
  if (req.method!=='POST' || !match) return false;
  const taskId=id(match[1]);requireTask(db,taskId);
  const data=match[2]==='reconcile' ? {} : await body(req);
  if (match[2]==='reconcile') {
    // hito 13: la orden viva de la tarea, o una nueva (una tarea puede reconciliarse más de una vez)
    const commandId=transaction(db,()=>{
      if (!reconcileStates.includes(requireTask(db,taskId).state)) throw new Error('invalid_transition');
      const live=db.prepare(`select id from commands where type='task.reconcile' and state in ('pending','running')
        and json_extract(payload,'$.taskId')=?`).get(taskId);
      return live ? live.id : enqueue(db,'task.reconcile',{taskId},`task.reconcile:${taskId}:${randomUUID()}`).id;
    });
    json(res,202,{commandId});return true;
  }
  if (match[2]==='spec') {
    const spec=taskSpec(data);
    const prepared=transaction(db,()=>{
      const task=requireTask(db,taskId);
      if (task.state==='done' || filtered<Run>(db,'runs',{taskId:task.id}).some(r=>r.state==='running'))
        throw new Error('invalid_transition');
      db.prepare('update tasks set review_approved=0,spec=?,acceptance=?,area=?,scope=? where id=?')
        .run(spec.spec,JSON.stringify(spec.acceptance),spec.area,JSON.stringify(spec.scope),task.id);
      return moveTask(db,task.id,'preparada');
    });
    json(res,200,prepared);return true;
  }
  const attempt=data.attempt===undefined ? currentAttempt(db,taskId) : data.attempt;
  if (!['codex','claude','opencode'].includes(data.provider as string) || !text(data.role) || !strings(data.skills)
    || !Number.isSafeInteger(attempt) || (attempt as number)<1)
    throw new Error('invalid_worker_payload');
  const commandId=transaction(db,()=>{
    const task=requireTask(db,taskId);taskSpec(task);
    const key=`worker.start:${task.id}:${attempt}`;
    const previous=db.prepare('select id from commands where idempotency_key=?').get(key);
    if (previous) {resumeWorkerStart(db,previous.id as string);return previous.id;}
    if (task.state!=='preparada') throw new Error('invalid_transition');
    return enqueue(db,'worker.start',{taskId:task.id,provider:data.provider,role:data.role,skills:data.skills,attempt},key).id;
  });
  json(res,202,{commandId});return true;
}
