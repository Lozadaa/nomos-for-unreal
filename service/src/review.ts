import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Task, Run } from './model.ts';
import type { WorkerContext } from './runner.ts';
import { requireRun, runTree } from './repo/worker.ts';
import { requireTask } from './repo/tasks.ts';
import { filtered } from './repo/rows.ts';

export type ReviewSnapshot={implementerRunId:string;generation:string;inputGeneration:string;commit:string;diffHash:string};
export const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function reviewGeneration(task:Task,run:Run):string {
  return hash(JSON.stringify([run.metadata.implementationGeneration ?? 0,run.metadata.pollGeneration ?? 0,task.spec,task.acceptance,task.scope]));
}
export function reviewTarget(db:DatabaseSync,taskId:string,runId?:string) {
  const task=requireTask(db,taskId);
  const history=filtered<Run>(db,'runs',{taskId});
  const implementer=runId ? requireRun(db,runId) : history.filter(r=>r.role!=='revisor'&&r.provider!=='unreal'&&r.state==='done').at(-1);
  if(!implementer || implementer.taskId!==taskId || implementer.role==='revisor' || implementer.state!=='done'
    || !['revisando','probando'].includes(task.state) || task.worktreeId!==implementer.metadata.worktreeId)
    throw new Error('invalid_review_target');
  if(db.prepare("select id from commands where type='worker.send' and state in ('pending','running') and json_extract(payload,'$.runId')=?")
    .get(implementer.id)) throw new Error('invalid_review_pending_correction');
  const tree=runTree(db,implementer);
  if(tree.taskId!==taskId || !tree.baseCommit) throw new Error('invalid_review_tree');
  return {task,implementer,tree,generation:reviewGeneration(task,implementer)};
}
export async function reviewSnapshot(ctx:Pick<WorkerContext,'db'|'git'>,taskId:string,runId:string) {
  const target=reviewTarget(ctx.db,taskId,runId);
  const commit=await ctx.git.head(target.tree.path),diff=await ctx.git.diff(target.tree.path,target.tree.baseCommit);
  const diffHash=diff.fingerprint ?? hash(diff.patch),inputGeneration=target.generation;
  return {snapshot:{implementerRunId:runId,inputGeneration,generation:hash(JSON.stringify([inputGeneration,commit,diffHash])),commit,diffHash},patch:diff.patch};
}
export async function reviewCurrent(ctx:WorkerContext,taskId:string,snapshot:ReviewSnapshot):Promise<boolean> {
  try {
    const current=await reviewSnapshot(ctx,taskId,snapshot.implementerRunId);
    return JSON.stringify(current.snapshot)===JSON.stringify(snapshot)
      && reviewTarget(ctx.db,taskId,snapshot.implementerRunId).generation===snapshot.inputGeneration;
  } catch {return false;}
}
