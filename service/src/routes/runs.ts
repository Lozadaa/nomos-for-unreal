import { randomUUID } from 'node:crypto';
import { body, json } from '../http.ts';
import { enqueue } from '../commands.ts';
import { listEvents } from '../store.ts';
import { linkedMessage } from '../chat.ts';

const withMessage=(messageId: string | null)=>messageId ? {messageId} : {};
import { requireRun, invalidateImplementation } from '../repo/worker.ts';
import { requireTask } from '../repo/tasks.ts';
import { filtered, read, transaction } from '../repo/rows.ts';
import { createGit } from '../adapters/git.ts';
import { id, text, type Context } from './context.ts';
import type { Run, Worktree } from '../model.ts';

function treeFor(db: Context['db'],run: Run): Worktree | null {
  const task=requireTask(db,run.taskId);
  const treeId=run.metadata.worktreeId ?? (filtered<Run>(db,'runs',{taskId:task.id}).length===1 ? task.worktreeId : null);
  const tree=treeId ? read<Worktree>(db,'worktrees',treeId) : null;
  return tree && tree.taskId===run.taskId ? tree : null;
}
export async function runs({db,req,res,url}: Context): Promise<boolean> {
  const match=/^\/runs\/([^/]+)(?:\/(output|diff|message|stop))?$/.exec(url.pathname);
  if (!match) return false;
  const run=requireRun(db,id(match[1])),action=match[2];
  if (req.method==='GET' && !action) {
    const task=requireTask(db,run.taskId),waiting=!!run.metadata.waiting;
    json(res,200,{run,worktree:treeFor(db,run),latestStatus:{
      state:task.blockedReason ? 'bloqueada' : waiting ? 'esperando_worker' : run.state,
      waiting,question:run.metadata.question ?? null,blockedReason:task.blockedReason}});return true;
  }
  if (req.method==='GET' && action==='output') {
    const value=url.searchParams.get('since'),since=value===null ? 0 : Number(value);
    if (value!==null && !/^\d+$/.test(value) || !Number.isSafeInteger(since) || since<0) throw new Error('invalid_seq');
    json(res,200,listEvents(db,since).filter(e=>e.type==='worker.output' && e.payload.runId===run.id));return true;
  }
  if (req.method==='GET' && action==='diff') {
    if ([...url.searchParams].length) throw new Error('invalid_diff_query');
    const tree=treeFor(db,run);
    if (!tree) throw new Error('unknown_worktree');
    if (!tree.baseCommit || !run.sessionRef) throw new Error('invalid_transition');
    const git=createGit();
    if (!await git.isRepo(tree.path)) throw new Error('unknown_worktree');
    const diff=await git.diff(tree.path,tree.baseCommit),commits=await git.log(tree.path,tree.baseCommit);
    json(res,200,{...diff,commits});return true;
  }
  if (req.method==='POST' && (action==='message' || action==='stop')) {
    const data=await body(req);
    if (action==='message') {
      if (!text(data.text) || data.idempotencyKey!==undefined && !text(data.idempotencyKey)) throw new Error('invalid_worker_message');
    }
    const key=action==='stop' ? `worker.stop:${run.id}` : `worker.send:${run.id}:${data.idempotencyKey ?? randomUUID()}`;
    const commandId=transaction(db,()=>{
      const current=requireRun(db,run.id);
      const previous=db.prepare('select id from commands where idempotency_key=?').get(key);
      if (previous) return previous.id;
      if (action==='message' && (!['running','done'].includes(current.state) || current.role==='revisor'&&current.state!=='running'))
        throw new Error('invalid_transition');
      if(action==='message') invalidateImplementation(db,current.id);
      return enqueue(db,action==='stop' ? 'worker.stop' : 'worker.send',
        action==='stop' ? {runId:current.id} : {runId:current.id,text:data.text,...withMessage(linkedMessage(db,data.messageId))},key).id;
    });
    json(res,202,{commandId});return true;
  }
  return false;
}
