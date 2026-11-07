import { body, json } from '../http.ts';
import { listLeases } from '../leases.ts';
import { requireTask } from '../repo/tasks.ts';
import { filtered, transaction } from '../repo/rows.ts';
import { normalizedPaths } from '../handlers/worker-policy.ts';
import type { Run } from '../model.ts';
import { id, type Context } from './context.ts';
import { projectInfo } from '../project-root.ts';
import { agentLabel } from '../editor/queue.ts';
import { noteWarm, releaseTurn, requestTurn, warmToClose } from '../unreal-turn.ts';

/** Editor por proyecto: el juego del servicio más cualquier proyecto con reserva `editor/<nombre>`. */
function editors(db: Context['db'], dataDir: string | undefined) {
  const held=listLeases(db).filter(lease=>lease.path.startsWith('editor/'));
  const names=[...new Set([projectInfo(dataDir)?.name,...held.map(lease=>lease.path.slice(7))].filter((n): n is string=>!!n))];
  return names.map(project=>{
    const lease=held.find(l=>l.path.slice(7).toLowerCase()===project.toLowerCase());
    const run=lease ? filtered<Run>(db,'runs',{id:lease.runId})[0] : undefined;
    return {project,busy:lease ? {runId:lease.runId,taskId:lease.taskId,since:lease.acquiredAt,agent:agentLabel(run),
      provider:run?.provider ?? null,role:run?.role ?? null} : null};
  });
}

export async function leases({db,req,res,url,dataDir}: Context): Promise<boolean> {
  if(req.method==='GET' && url.pathname==='/editors') {json(res,200,editors(db,dataDir));return true;}
  if(req.method==='GET' && url.pathname==='/leases') {
    json(res,200,listLeases(db));return true;
  }
  // hito 22: `nomos worker turn --wait|--release` (el worker pide Unreal desde su terminal)
  const turn=/^\/tasks\/([^/]+)\/turn(\/release)?$/.exec(url.pathname);
  if(req.method==='POST' && turn && dataDir) {
    // x10: `ue py --tarea` manda su .uproject (`uproject` al pedir, `caliente` al soltar con el editor caliente abierto);
    // a quien recibe el turno se le dicen los calientes de otros que debe cerrar antes de abrir Unreal (`cerrar`)
    const taskId=id(turn[1]),data=await body(req) as {uproject?:unknown;caliente?:unknown};
    if(turn[2]) {
      const released=releaseTurn(db,dataDir,taskId);
      if(released.released && typeof data.caliente==='string') noteWarm(db,data.caliente,taskId);
      json(res,200,released);return true;
    }
    const answer=requestTurn(db,dataDir,taskId),cerrar=answer.granted ? warmToClose(db,typeof data.uproject==='string' ? data.uproject : undefined) : [];
    json(res,200,cerrar.length ? {...answer,cerrar} : answer);return true;
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
