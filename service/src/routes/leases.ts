import { body, json } from '../http.ts';
import { listLeases } from '../leases.ts';
import { requireTask } from '../repo/tasks.ts';
import { filtered, transaction } from '../repo/rows.ts';
import { normalizedPaths } from '../handlers/worker-policy.ts';
import type { Run } from '../model.ts';
import { id, type Context } from './context.ts';

export async function leases({db,req,res,url}: Context): Promise<boolean> {
  if(req.method==='GET' && url.pathname==='/leases') {
    json(res,200,listLeases(db));return true;
  }
  const match=/^\/tasks\/([^/]+)\/leases$/.exec(url.pathname);
  if(req.method!=='POST' || !match) return false;
  const taskId=id(match[1]);requireTask(db,taskId);
  const data=await body(req),paths=normalizedPaths(data.leases);
  const task=transaction(db,()=>{
    const current=requireTask(db,taskId);
    if(!['pendiente','preparada'].includes(current.state)
      || filtered<Run>(db,'runs',{taskId}).some(run=>run.state==='running')
      || listLeases(db).some(lease=>lease.taskId===taskId)) throw new Error('invalid_transition');
    db.prepare('update tasks set leases=?,wait_reason=null,updated_at=? where id=?')
      .run(JSON.stringify(paths),new Date().toISOString(),taskId);
    return requireTask(db,taskId);
  });
  json(res,200,task);return true;
}
