import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Handler } from '../runner.ts';
import { requireRun, runTree, updateRun, queuePoll } from '../repo/worker.ts';
import { requireTask, moveTask } from '../repo/tasks.ts';
import { transaction } from '../repo/rows.ts';
import { workerPolicy, decisionGate } from './worker-policy.ts';
import { appendEvent } from '../store.ts';
import { finishRun } from '../repo/runs.ts';
import { dispatchGuard, dispatchBlocked, pauseForDecision } from './worker-decisions.ts';
import { streamMarkers, screenMarkers, markerId, compactMarkerText } from './worker-markers.ts';
import { acquire, release, leaseWaitReason } from '../leases.ts';

export const workerSend: Handler=async (cmd,ctx)=>{
  const payload=cmd.payload as any,{db,orca}=ctx;
  let run=requireRun(db,payload.runId);const task=requireTask(db,run.taskId),tree=runTree(db,run);
  const guard=dispatchGuard(db,task);
  if (!['running','done'].includes(run.state)) throw new Error('invalid_worker_state');
  if (typeof payload.text!=='string'||!payload.text.trim()) throw new Error('invalid_worker_text');
  if (run.metadata.deadlineAt && Date.now()>=Date.parse(run.metadata.deadlineAt)) throw new Error('orca: tiempo máximo de 4 horas agotado');
  const correction=run.state==='done',count=run.metadata.correctionCount ?? 0;
  if (correction && count>=3) {
    decisionGate(ctx,task,'corrections','Máximo de tres correcciones alcanzado',
      {runId:run.id,correctionCount:count},[{id:'review',label:'Revisar',description:'El director decide cómo continuar'},
        {id:'cancel',label:'Cancelar',description:'No enviar más correcciones'}],false);return;
  }
  if (correction && !await workerPolicy(ctx,task,`correction:${run.id}:${count+1}`)) return;
  if (dispatchBlocked(db,guard) || requireTask(db,task.id).blockedReason) return pauseForDecision(db,task.id,run.id);
  if (!/^[a-f0-9-]+$/i.test(cmd.id)) throw new Error('invalid_command_id');
  const reservation=acquire(db,run.id,task.id,requireTask(db,task.id).leases);
  if(!reservation.ok) {
    db.prepare('update tasks set wait_reason=?,updated_at=? where id=?')
      .run(leaseWaitReason(reservation.conflicts),new Date().toISOString(),task.id);return;
  }
  db.prepare('update tasks set wait_reason=null where id=?').run(task.id);
  const relative=`.kratos-inbox/${cmd.id}.md`;
  mkdirSync(join(tree.path,'.kratos-inbox'),{recursive:true});writeFileSync(join(tree.path,relative),payload.text);
  await orca.terminalSend(run.sessionRef!,`Lee el archivo ${relative} y ejecuta lo que dice.`);
  transaction(db,()=>{
    const previous=run.metadata,lastLines=previous.lastLines ?? [];
    const oldDone=previous.markerFence || previous.seenDoneMarkers!==undefined ? []
      : [...streamMarkers(lastLines,'').found,...screenMarkers(lastLines)].filter(marker=>marker.kind==='DONE');
    const seenDoneMarkers=[...new Set([...(previous.seenDoneMarkers ?? []),...oldDone.map(markerId)])].slice(-32);
    const legacyDoneSummaries=correction && !previous.seenDoneMarkers?.length && run.summary!==null
      ? [...new Set([...(previous.legacyDoneSummaries ?? []),compactMarkerText(run.summary)])].slice(-4)
      : previous.legacyDoneSummaries;
    run=updateRun(db,run.id,{waiting:false,question:undefined,phase:'running',markerBuffer:'',idlePolls:0,
      seenDoneMarkers,legacyDoneSummaries,
      correctionCount:count+(correction?1:0),pollGeneration:(run.metadata.pollGeneration ?? 0)+1},
      {state:'running',finishedAt:null,summary:null});
    moveTask(db,run.taskId,'implementando');queuePoll(db,run);
    appendEvent(db,'worker.message_sent',null,{taskId:run.taskId,runId:run.id,path:relative,commandId:cmd.id,correctionCount:run.metadata.correctionCount});
    if(dispatchBlocked(db,guard)) pauseForDecision(db,task.id,run.id);
  });
};
export const workerStop: Handler=async (cmd,ctx)=>{
  const run=requireRun(ctx.db,(cmd.payload as any).runId);
  transaction(ctx.db,()=>{
    if(run.state==='running') finishRun(ctx.db,run.id,'cancelled','Seguimiento detenido; no se confirma terminación del proceso Codex');
    release(ctx.db,run.id);
    updateRun(ctx.db,run.id,{waiting:false,phase:'finished',pollGeneration:(run.metadata.pollGeneration ?? 0)+1});
    const task=requireTask(ctx.db,run.taskId);
    const latest=ctx.db.prepare('select id from runs where task_id=? order by rowid desc limit 1').get(run.taskId);
    const ownsTracking=latest?.id===run.id && (!task.worktreeId || task.worktreeId===run.metadata.worktreeId);
    if(task.state!=='done' && ownsTracking) {
      moveTask(ctx.db,task.id,'preparada');
      ctx.db.prepare('update tasks set wait_reason=? where id=?')
        .run('Seguimiento detenido; reconciliar el worktree conservado antes de continuar',task.id);
    }
  });
};
