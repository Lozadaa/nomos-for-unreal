import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Handler } from '../runner.ts';
import { requireTask, moveTask } from '../repo/tasks.ts';
import { filtered, insert, transaction } from '../repo/rows.ts';
import type { Run, Worktree } from '../model.ts';
import { startRun } from '../repo/runs.ts';
import { updateRun, queuePoll } from '../repo/worker.ts';
import { renderBrief } from '../brief.ts';
import { workerPolicy, decisionGate } from './worker-policy.ts';
import { OrcaError } from '../adapters/orca.ts';
import { dispatchGuard, dispatchBlocked, pauseForDecision } from './worker-decisions.ts';

export const workerStart: Handler=async (cmd,ctx)=>{
  const {db,git,orca,projectDir}=ctx,payload=cmd.payload as any;
  const task=requireTask(db,payload.taskId);
  const guard=dispatchGuard(db,task);
  if (payload.provider !== 'codex' || typeof payload.role !== 'string' || !payload.role.trim()
    || !Array.isArray(payload.skills) || !payload.skills.every((s:unknown)=>typeof s==='string'&&s.trim())
    || payload.attempt!==undefined && (!Number.isSafeInteger(payload.attempt)||payload.attempt<1)) throw new Error('invalid_worker_payload');
  if (!task.title.trim() || !task.spec.trim() || !task.acceptance.length
    || !task.acceptance.every(s=>typeof s==='string'&&s.trim())) throw new Error('invalid_worker_spec');
  const history=filtered<Run>(db,'runs',{taskId:task.id});
  if (history.some(r=>r.state==='running')) throw new Error('worker_exists');
  if (task.worktreeId || history.some(r=>r.metadata.uncertain)) {
    decisionGate(ctx,task,'reconcile','Reconciliar worker existente antes de continuar',
      {worktreeId:task.worktreeId,runs:filtered<Run>(db,'runs',{taskId:task.id})},undefined,false);return;
  }
  if (!await workerPolicy(ctx,task,`start:${payload.attempt ?? 1}`,true)) {
    return {policyBlocked:true,decisionId:requireTask(db,task.id).decisionId};
  }
  if (dispatchBlocked(db,guard)) return pauseForDecision(db,task.id);
  const short=task.id.slice(0,8);
  let run=startRun(db,{taskId:task.id,role:payload.role,provider:'codex',skills:payload.skills,attempt:payload.attempt ?? 1,
    metadata:{phase:'preparing',deadlineAt:new Date(Date.now()+4*3600_000).toISOString(),pollGeneration:0,correctionCount:0}});
  try {
  const {repoId}=await orca.repoAdd(projectDir);
  const created=await orca.worktreeCreate(repoId,'kratos-'+short,'codex');
  transaction(db,()=>{
    run=updateRun(db,run.id,{worktreeId:created.worktreeId},{sessionRef:created.terminalHandle});
    insert<Worktree>(db,'worktrees',{id:created.worktreeId,taskId:task.id,path:created.path,branch:created.branch,
      baseCommit:'',state:'active',closedReason:null});
    db.prepare('update tasks set worktree_id=?,updated_at=? where id=?').run(created.worktreeId,new Date().toISOString(),task.id);
  });
  const baseCommit=await git.head(created.path);
  db.prepare('update worktrees set base_commit=?,updated_at=? where id=?').run(baseCommit,new Date().toISOString(),created.worktreeId);
  await git.renameBranch(created.path,'kratos/'+short);
  const branch=await git.currentBranch(created.path);
  db.prepare('update worktrees set branch=?,updated_at=? where id=?').run(branch,new Date().toISOString(),created.worktreeId);
  const contextFile=join(projectDir,'.agents','ue-project-context.md');
  writeFileSync(join(created.path,'.kratos-brief.md'),renderBrief(task,run,
    {projectContext:existsSync(contextFile) ? readFileSync(contextFile,'utf8') : undefined}));
  await git.excludeLocal(created.path);
  await orca.terminalSend(created.terminalHandle,'codex --yolo --no-daemon');
  if (!await orca.terminalWaitIdle(created.terminalHandle,90_000)) throw new Error('orca: Codex no estuvo listo antes de 90 s');
  if (dispatchBlocked(db,guard)) {queuePoll(db,run);return pauseForDecision(db,task.id,run.id);}
  const {cursor,text}=await orca.terminalRead(created.terminalHandle);
  run=updateRun(db,run.id,{cursor,lastLines:text.split('\n').slice(-20)});
  if (dispatchBlocked(db,guard)) {queuePoll(db,run);return pauseForDecision(db,task.id,run.id);}
  await orca.terminalSend(created.terminalHandle,'Lee el archivo .kratos-brief.md de esta carpeta y ejecuta lo que dice.');
  transaction(db,()=>{
    run=updateRun(db,run.id,{phase:'running'});
    if(!dispatchBlocked(db,guard)) db.prepare('update tasks set blocked_reason=null where id=? and decision_id is null').run(task.id);
    moveTask(db,task.id,'implementando');queuePoll(db,run);
    if(dispatchBlocked(db,guard)) pauseForDecision(db,task.id,run.id);
  });
  return {runId:run.id,worktreeId:created.worktreeId};
  } catch(error) {
    if(error instanceof OrcaError) throw error;
    throw new OrcaError('cli_error',`Preparación del worker: ${error instanceof Error ? error.message : String(error)}`);
  }
};
