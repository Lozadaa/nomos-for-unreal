import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Handler, WorkerContext } from '../runner.ts';
import { requireTask, moveTask,setTaskWait } from '../repo/tasks.ts';
import { filtered, insert, read, transaction } from '../repo/rows.ts';
import type { Run, Worktree, Command } from '../model.ts';
import type { ReviewSnapshot } from '../review.ts';
import { startRun } from '../repo/runs.ts';
import { updateRun, queuePoll } from '../repo/worker.ts';
import { renderBrief } from '../brief.ts';
import { capabilityList } from '../capability-checks.ts';
import { createUnrealCmd } from '../adapters/unreal-cmd.ts';
import { assetConfig } from '../catalog/paths.ts';
import { workerPolicy, decisionGate } from './worker-policy.ts';
import { OrcaError } from '../adapters/orca.ts';
import { dispatchGuard, dispatchBlocked, pauseForDecision } from './worker-decisions.ts';
import { requireGameProject } from '../project-root.ts';
import { acquire,release,listLeases } from '../leases.ts';
import { holderReason, peerLeaseWait } from '../team.ts';
import { appendEvent } from '../store.ts';
import { workerFailure } from './worker-failure.ts';
import { schedulingBlocked } from '../scheduler-admission.ts';
import { rapido, readConfig, roleModel, opencodeModel, maxWorkerMinutes, orcaCreateTimeoutMs } from '../config.ts';
import { launchPlan, briefLine } from './worker-launch.ts';
import { skillsForRole, skillSplit } from '../skills.ts';
import { installSkills } from '../skills-install.ts';
import { continuationBrief } from './continue.ts';
import { orcaDeferral, orcaDown } from './orca-down.ts';
import { askReconcile } from './reconcile.ts';
import { fromMain } from '../main-base.ts';

/** Contexto del brief: el del proyecto, la dirección de arte (solo UI) y las 30 últimas líneas de lo aprendido en el juego. */
export function briefContext(projectDir:string,worktree:string,area:string):string {
  const contextFile=join(projectDir,'.agents','ue-project-context.md'),uiFile=join(projectDir,'docs','ui-direction.md'),learned=join(worktree,'docs','aprendido.md');
  return [existsSync(contextFile) ? readFileSync(contextFile,'utf8') : '',
    // la dirección de arte de la UI (game-ui-art-director) acompaña a todo worker de UI
    area==='ui' && existsSync(uiFile) ? `## Dirección de arte de la UI (docs/ui-direction.md)\n\n${readFileSync(uiFile,'utf8')}` : '',
    // jam: lo que el equipo aprendió viaja con el juego (merge=union); lo último es lo más útil
    existsSync(learned) ? `## Aprendido en este juego (docs/aprendido.md)\n\n${readFileSync(learned,'utf8').trimEnd().split(/\r?\n/).slice(-30).join('\n')}\n` : ''].filter(Boolean).join('\n\n');
}
export const workerStart: Handler=(cmd,ctx)=>startWorker(cmd,ctx);
export async function startWorker(cmd:Command,ctx:WorkerContext,review?:{
  snapshot:ReviewSnapshot;valid:()=>Promise<boolean>;brief:(path:string,run:Run)=>string;
}) {
  const {db,git,orca,projectDir}=ctx,payload=cmd.payload as any;
  const task=requireTask(db,payload.taskId);
  const guard=dispatchGuard(db,task);
  if (!['codex','claude','opencode'].includes(payload.provider) || typeof payload.role !== 'string' || !payload.role.trim()
    || !Array.isArray(payload.skills) || !payload.skills.every((s:unknown)=>typeof s==='string'&&s.trim())
    || payload.attempt!==undefined && (!Number.isSafeInteger(payload.attempt)||payload.attempt<1)) throw new Error('invalid_worker_payload');
  if (!task.title.trim() || !task.spec.trim() || !task.acceptance.length
    || !task.acceptance.every(s=>typeof s==='string'&&s.trim())) throw new Error('invalid_worker_spec');
  const config=readConfig(ctx.dataDir),model=payload.provider==='opencode' ? opencodeModel(config) : roleModel(config,payload.role,!!(payload.qa||payload.arte));
  const history=filtered<Run>(db,'runs',{taskId:task.id});
  const reusable=history.find(r=>r.state==='running'&&r.provider===payload.provider&&r.attempt===(payload.attempt ?? 1)
    &&r.metadata.startCommandId===cmd.id&&r.metadata.phase==='preparing'
    && !r.sessionRef&&!r.metadata.worktreeId&&!r.metadata.uncertain);
  if(task.decisionId) return {policyBlocked:true,decisionId:task.decisionId};
  if (history.some(r=>r.state==='running'&&r.id!==reusable?.id)) throw new Error('worker_exists');
  // hito 13: la Decisión ofrece reconciliar (y reintentar o dejar preparada) o cancelar; ninguna opción es decorativa
  if (!review && (task.worktreeId || history.some(r=>r.metadata.uncertain))) return askReconcile(db,task,cmd.id);
  const waiting=schedulingBlocked(ctx,task,payload.provider,cmd.id,false,reusable?.id,payload.role);
  if(waiting) return {deferred:true,reason:waiting};
  await requireGameProject(projectDir);
  if (!await workerPolicy(ctx,task,review ? `review:${review.snapshot.generation}` : `start:${payload.attempt ?? 1}`,true)) {
    return {policyBlocked:true,decisionId:requireTask(db,task.id).decisionId};
  }
  if (dispatchBlocked(db,guard)) return pauseForDecision(db,task.id);
  if(review && !await review.valid()) throw new Error('invalid_review_snapshot');
  if(review && requireTask(db,task.id).decisionId) return {policyBlocked:true,decisionId:requireTask(db,task.id).decisionId};
  const changed=schedulingBlocked(ctx,requireTask(db,task.id),payload.provider,cmd.id,false,reusable?.id,payload.role);
  if(changed) return {deferred:true,reason:changed};
  const short=task.id.slice(0,8);
  // jam 2026-11-10: en modo rápido, solo las tres del núcleo; el brief lista las demás «si las necesitas»
  const skills=[...new Set([...payload.skills,...rapido(config) ? skillSplit(payload.role,task.area).core : skillsForRole(payload.role,task.area)])];
  let run=reusable ?? startRun(db,{taskId:task.id,role:payload.role,provider:payload.provider,skills,attempt:payload.attempt ?? 1,
    metadata:{...(review ? {review:review.snapshot} : {}),startCommandId:cmd.id,phase:'preparing',deadlineAt:new Date(Date.now()+maxWorkerMinutes(config)*60_000).toISOString(),pollGeneration:0,correctionCount:0}});
  if(reusable) run=updateRun(db,run.id,{waiting:false,question:undefined});
  const reservation=acquire(db,run.id,task.id,review ? [] : requireTask(db,task.id).leases);
  if(!reservation.ok) {
    workerFailure(db,{...payload,runId:run.id,conflicts:reservation.conflicts},'lease_conflict');return;
  }
  db.prepare('update tasks set wait_reason=null where id=?').run(task.id);
  // hito 29: en equipo, mis reservas se publican y se comparan con las de los peers antes de arrancar
  const mine=review ? [] : listLeases(db).filter(l=>l.runId===run.id);
  const peer=await peerLeaseWait(db,ctx.dataDir,projectDir,mine.map(l=>l.path),mine.map(l=>l.acquiredAt).sort()[0] ?? '');
  if(peer) {
    const reason=holderReason(peer);
    workerFailure(db,{...payload,runId:run.id,conflicts:[]},'lease_conflict');
    db.prepare('update tasks set wait_reason=? where id=?').run(reason,task.id);
    appendEvent(db,'lease.conflict',null,{taskId:task.id,runId:run.id,peer:peer.name,path:peer.path,until:peer.until,reason});
    return;
  }
  try {
  let repoId:string;
  try {({repoId}=await orca.repoAdd(projectDir));} catch(error) {
    if(!orcaDown(error)) throw error;
    // Orca cerrado: nada se creó todavía; el mismo run se reutiliza al reintentar
    release(db,run.id);
    const waiting=await orcaDeferral(ctx,cmd,task.id);
    if(waiting) return waiting;
    ({repoId}=await orca.repoAdd(projectDir));
  }
  if(review && !await review.valid()) throw new Error('invalid_review_snapshot');
  const beforeTree=schedulingBlocked(ctx,requireTask(db,task.id),payload.provider,cmd.id,!review,run.id,payload.role);
  if(beforeTree) {
    release(db,run.id);updateRun(db,run.id,{waiting:true,question:beforeTree});setTaskWait(db,task.id,beforeTree);
    return {deferred:true,reason:beforeTree};
  }
  if(dispatchBlocked(db,guard)) {release(db,run.id);return pauseForDecision(db,task.id,run.id);}
  const currentReservation=acquire(db,run.id,task.id,review ? [] : requireTask(db,task.id).leases);
  if(!currentReservation.ok) {
    workerFailure(db,{...payload,runId:run.id,conflicts:currentReservation.conflicts},'lease_conflict');return;
  }
  const suffix=review ? '-review-'+run.id.slice(0,8) : '';
  const created=await orca.worktreeCreate(repoId,'nomos-'+short+suffix,payload.provider,orcaCreateTimeoutMs(config));
  transaction(db,()=>{
    run=updateRun(db,run.id,{worktreeId:created.worktreeId},{sessionRef:created.terminalHandle});
    // hito 13: Orca da a un worktree nuevo en la misma ruta el mismo id que al retirado; su fila cerrada se reutiliza
    if(read<Worktree>(db,'worktrees',created.worktreeId)) db.prepare(`update worktrees set task_id=?,path=?,branch=?,base_commit='',
      state='active',closed_reason=null,updated_at=? where id=?`).run(task.id,created.path,created.branch,new Date().toISOString(),created.worktreeId);
    else insert<Worktree>(db,'worktrees',{id:created.worktreeId,taskId:task.id,path:created.path,branch:created.branch,
      baseCommit:'',state:'active',closedReason:null});
    if(!review) db.prepare('update tasks set worktree_id=?,updated_at=? where id=?').run(created.worktreeId,new Date().toISOString(),task.id);
  });
  // hito 22: un worker nuevo nace de la punta de main aunque Orca creara el árbol desde una base vieja
  if(!review) await fromMain(ctx,task.id,created.path);
  const baseCommit=await git.head(created.path);
  db.prepare('update worktrees set base_commit=?,updated_at=? where id=?').run(baseCommit,new Date().toISOString(),created.worktreeId);
  // hito 13: la rama de un worker reconciliado sigue en el repositorio (con lo commiteado); la nueva no la pisa
  const name='nomos/'+short+suffix;
  await git.renameBranch(created.path,await git.branchExists(projectDir,name) ? name+'-'+run.id.slice(0,8) : name);
  const branch=await git.currentBranch(created.path);
  db.prepare('update worktrees set branch=?,updated_at=? where id=?').run(branch,new Date().toISOString(),created.worktreeId);
  const context=briefContext(projectDir,created.path,task.area);
  writeFileSync(join(created.path,'.nomos-brief.md'),review ? review.brief(created.path,run) : renderBrief(task,run,
    {projectContext:context || undefined,continuation:continuationBrief(db,task,ctx.dataDir),
      rapido:rapido(config),capacidades:capabilityList(ctx.dataDir,db).filter(c=>c.state==='detectado'||c.state==='comprobado').map(c=>c.id),engine:createUnrealCmd({bin:assetConfig(ctx.dataDir).unrealPath}).engineVersion() ?? undefined,turn:`node "${join(import.meta.dirname,'..','cli.ts')}" worker turn ${task.id} --data "${ctx.dataDir}"`}));
  await git.excludeLocal(created.path);
  // el árbol nace de Git: las skills de UI del juego no están versionadas y se copian (excluidas del diff)
  installSkills(created.path);
  // hito 24: la sesión fija de Claude Code da la transcripción de la que salen los tokens de la run
  if(run.provider!=='codex') run=updateRun(db,run.id,{model,...(run.provider==='claude' ? {sessionId:randomUUID()} : {})});
  // hito 12: ningún subproceso de OpenCode hereda el modelo por defecto (caro) del usuario
  if(run.provider==='opencode') writeFileSync(join(created.path,'opencode.json'),JSON.stringify({$schema:'https://opencode.ai/config.json',model},null,2)+'\n');
  const plan=launchPlan(run.provider,model,short,run.metadata.sessionId);
  if(!plan.briefInCommand) {
    await orca.terminalSend(created.terminalHandle,plan.command);
    if (!await orca.terminalWaitIdle(created.terminalHandle,90_000,plan.ready))
      throw new Error(`orca: ${run.provider} no estuvo listo antes de 90 s`);
  }
  const pauseDispatch=()=>{
    if(dispatchBlocked(db,guard)) {queuePoll(db,run);return pauseForDecision(db,task.id,run.id);}
    const reason=schedulingBlocked(ctx,requireTask(db,task.id),payload.provider,cmd.id,!review,run.id,payload.role);
    if(!reason) return;
    setTaskWait(db,task.id,reason);
    decisionGate(ctx,requireTask(db,task.id),'dispatch',reason,{runId:run.id,reason});
    queuePoll(db,run);return pauseForDecision(db,task.id,run.id);
  };
  const afterIdle=pauseDispatch();if(afterIdle) return afterIdle;
  const {cursor,text}=await orca.terminalRead(created.terminalHandle);
  run=updateRun(db,run.id,{cursor,lastLines:text.split('\n').slice(-20)});
  const beforeBrief=pauseDispatch();if(beforeBrief) return beforeBrief;
  if(review && !await review.valid()) throw new Error('invalid_review_snapshot');
  const finalGuard=pauseDispatch();if(finalGuard) return finalGuard;
  await orca.terminalSend(created.terminalHandle,plan.briefInCommand ? plan.command : briefLine);
  transaction(db,()=>{
    run=updateRun(db,run.id,{phase:'running'});
    if(!dispatchBlocked(db,guard)) db.prepare('update tasks set blocked_reason=null where id=? and decision_id is null').run(task.id);
    moveTask(db,task.id,review ? 'revisando' : 'implementando');queuePoll(db,run);
    if(dispatchBlocked(db,guard)) pauseForDecision(db,task.id,run.id);
  });
  return {runId:run.id,worktreeId:created.worktreeId};
  } catch(error) {
    if(error instanceof OrcaError) throw error;
    throw new OrcaError('cli_error',`Preparación del worker: ${error instanceof Error ? error.message : String(error)}`);
  }
};
