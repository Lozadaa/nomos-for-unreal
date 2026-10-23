import { body, json } from '../http.ts';
import { requireTask, moveTask } from '../repo/tasks.ts';
import { filtered, transaction } from '../repo/rows.ts';
import { enqueue } from '../commands.ts';
import { normalizedPaths } from '../handlers/worker-policy.ts';
import { areas, choice, id, text, type Context } from './context.ts';
import type { Run } from '../model.ts';
import { resumeWorkerStart } from './worker-resume.ts';

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
export async function taskWorker({db,req,res,url}: Context): Promise<boolean> {
  const match=/^\/tasks\/([^/]+)\/(spec|worker)$/.exec(url.pathname);
  if (req.method!=='POST' || !match) return false;
  const taskId=id(match[1]);requireTask(db,taskId);
  const data=await body(req);
  if (match[2]==='spec') {
    const spec=taskSpec(data);
    const prepared=transaction(db,()=>{
      const task=requireTask(db,taskId);
      if (task.state==='done' || filtered<Run>(db,'runs',{taskId:task.id}).some(r=>r.state==='running'))
        throw new Error('invalid_transition');
      db.prepare('update tasks set spec=?,acceptance=?,area=?,scope=? where id=?')
        .run(spec.spec,JSON.stringify(spec.acceptance),spec.area,JSON.stringify(spec.scope),task.id);
      return moveTask(db,task.id,'preparada');
    });
    json(res,200,prepared);return true;
  }
  const attempt=data.attempt===undefined ? 1 : data.attempt;
  if (data.provider!=='codex' || !text(data.role) || !strings(data.skills) || !Number.isSafeInteger(attempt) || (attempt as number)<1)
    throw new Error('invalid_worker_payload');
  const commandId=transaction(db,()=>{
    const task=requireTask(db,taskId);taskSpec(task);
    const key=`worker.start:${task.id}:${attempt}`;
    const previous=db.prepare('select id from commands where idempotency_key=?').get(key);
    if (previous) {resumeWorkerStart(db,previous.id as string);return previous.id;}
    if (task.state!=='preparada') throw new Error('invalid_transition');
    return enqueue(db,'worker.start',{taskId:task.id,provider:'codex',role:data.role,skills:data.skills,attempt},key).id;
  });
  json(res,202,{commandId});return true;
}
