import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Handler } from '../runner.ts';
import { requireRun, runTree, updateRun, queuePoll, invalidateImplementation } from '../repo/worker.ts';
import { requireTask, moveTask,setTaskWait } from '../repo/tasks.ts';
import type { DatabaseSync } from 'node:sqlite';
import type { Decision } from '../model.ts';
import { filtered, transaction } from '../repo/rows.ts';
import { workerPolicy, decisionGate } from './worker-policy.ts';
import { appendEvent } from '../store.ts';
import { finishRun } from '../repo/runs.ts';
import { dispatchGuard, dispatchBlocked, pauseForDecision } from './worker-decisions.ts';
import { streamMarkers, screenMarkers, markerId, compactMarkerText } from './worker-markers.ts';
import { acquire, release, leaseWaitReason } from '../leases.ts';
import { dependencyReason } from '../scheduler-state.ts';
import { limits, readConfig } from '../config.ts';
import { deliver } from './worker-deliver.ts';
import { reconcileTask } from './reconcile.ts';

export const acceptOption={id:'aceptar',label:'Aceptar y seguir',description:'Dar por buena la implementación con los hallazgos anotados y seguir hacia la integración'};
/** Cada «Revisar» elegido en una Decisión del máximo permite una corrección más a esa tarea (no toca `limits.corrections`). */
export const correctionsGranted=(db:DatabaseSync,taskId:string)=>new Set(filtered<Decision>(db,'decisions',{taskId,state:'resolved'})
  .filter(d=>d.chosenOptionId==='review').flatMap(d=>d.evidence.filter(e=>e.kind==='gate:corrections').map(e=>e.ref))).size;
export const workerSend: Handler=async (cmd,ctx)=>{
  const payload=cmd.payload as any,{db,orca}=ctx;
  let run=requireRun(db,payload.runId);const task=requireTask(db,run.taskId),tree=runTree(db,run);
  const guard=dispatchGuard(db,task);
  const reviewer=run.role==='revisor';
  if (!['running','done'].includes(run.state) || reviewer&&run.state==='done') throw new Error('invalid_worker_state');
  if (typeof payload.text!=='string'||!payload.text.trim()) throw new Error('invalid_worker_text');
  if (run.metadata.deadlineAt && Date.now()>=Date.parse(run.metadata.deadlineAt)) throw new Error('orca: tiempo máximo de 4 horas agotado');
  const limit=limits(readConfig(ctx.dataDir)).corrections,count=run.metadata.correctionCount ?? 0;
  // metras 4.ª vuelta: «commitea lo que quedó» al cerrar no es una corrección; gastaba la única del modo rápido y la tarea se paraba
  // las pasadas del juez de arte (2026-11-11) tampoco: tienen su propio tope, limits.arte
  const correction=run.state==='done',cuenta=correction && payload.cierre!==true && payload.arte!==true,max=limit+correctionsGranted(db,task.id);
  if (cuenta && count>=max) {
    // experimento metras 2026-11-08: tras hallazgos de la revisión de código se puede aceptar lo hecho (con ellos anotados) y seguir
    const findings=/^Correcciones de revisión:/.test(payload.text ?? '');
    decisionGate(ctx,task,'corrections',limit===3 ? 'Máximo de tres correcciones alcanzado' : `Máximo de ${limit} correcciones alcanzado`,
      {runId:run.id,correctionCount:count},[{id:'review',label:'Revisar',description:'Permitir una corrección más y enviarla'},
        ...(findings ? [acceptOption] : []),{id:'cancel',label:'Cancelar',description:'No enviar más correcciones'}],false);
    const decisionId=requireTask(db,task.id).decisionId;
    return decisionId ? {policyBlocked:true,decisionId} : undefined;
  }
  // hito 5b: el bloqueo del límite solo existe por count>=max; si `limits.corrections` ya permite otra, sobra
  if (correction && /^Máximo de (tres|\d+) correcciones alcanzado$/.test(task.blockedReason ?? ''))
    db.prepare('update tasks set blocked_reason=null,updated_at=? where id=? and decision_id is null').run(new Date().toISOString(),task.id);
  if (correction && !await workerPolicy(ctx,task,`correction:${run.id}:${count+1}`)) return;
  if (dispatchBlocked(db,guard) || requireTask(db,task.id).blockedReason) return pauseForDecision(db,task.id,run.id);
  const dependency=dependencyReason(db,requireTask(db,task.id));
  if(dependency) {
    setTaskWait(db,task.id,dependency);updateRun(db,run.id,{waiting:true,question:dependency});
    return {blocked:true,runId:run.id,reason:dependency};
  }
  if (!/^[a-f0-9-]+$/i.test(cmd.id)) throw new Error('invalid_command_id');
  const reservation=acquire(db,run.id,task.id,reviewer ? [] : requireTask(db,task.id).leases);
  if(!reservation.ok) {
    db.prepare('update tasks set wait_reason=?,updated_at=? where id=?')
      .run(leaseWaitReason(reservation.conflicts),new Date().toISOString(),task.id);return;
  }
  db.prepare('update tasks set wait_reason=null where id=?').run(task.id);
  const relative=`.nomos-inbox/${cmd.id}.md`;
  mkdirSync(join(tree.path,'.nomos-inbox'),{recursive:true});writeFileSync(join(tree.path,relative),payload.text);
  // un worktree de antes del hito 11 solo excluye la bandeja con el nombre anterior: la carpeta se ignora sola para que nunca se commitee
  writeFileSync(join(tree.path,'.nomos-inbox','.gitignore'),'*\n');
  invalidateImplementation(db,run.id);
  // hito 18: el HEAD al mandar la corrección; un NOMOS_DONE con commits declarados que no lo mueve es el viejo
  const correctionHead=correction && !reviewer ? await (async()=>ctx.git.head(tree.path))().catch(()=>undefined) : undefined;
  await deliver(db,orca,run,tree.path,`Lee el archivo ${relative} y ejecuta lo que dice.`);
  run=requireRun(db,run.id);
  transaction(db,()=>{
    const previous=run.metadata,lastLines=previous.lastLines ?? [];
    const oldDone=previous.markerFence || previous.seenDoneMarkers!==undefined ? []
      : [...streamMarkers(lastLines,'').found,...screenMarkers(lastLines)].filter(marker=>marker.kind==='DONE');
    const seenDoneMarkers=[...new Set([...(previous.seenDoneMarkers ?? []),...oldDone.map(markerId)])].slice(-32);
    const legacyDoneSummaries=correction && !previous.seenDoneMarkers?.length && run.summary!==null
      ? [...new Set([...(previous.legacyDoneSummaries ?? []),compactMarkerText(run.summary)])].slice(-4)
      : previous.legacyDoneSummaries;
    run=updateRun(db,run.id,{waiting:false,question:undefined,phase:'running',markerBuffer:'',idlePolls:0,
      seenDoneMarkers,legacyDoneSummaries,lastWaitingKey:undefined,...(correction && !reviewer ? {correctionHead} : {}),
      correctionCount:count+(cuenta?1:0),pollGeneration:(run.metadata.pollGeneration ?? 0)+1},
      {state:'running',finishedAt:null,summary:null});
    moveTask(db,run.taskId,reviewer ? 'revisando' : 'implementando');queuePoll(db,run);
    // hito 10: una corrección que el director manda por un mensaje del chat queda enlazada a él
    const messageId=typeof payload.messageId==='string' ? payload.messageId : null;
    appendEvent(db,'worker.message_sent',messageId,{taskId:run.taskId,runId:run.id,provider:run.provider,
      path:relative,commandId:cmd.id,correctionCount:run.metadata.correctionCount,...(messageId ? {messageId} : {})});
    if(dispatchBlocked(db,guard)) pauseForDecision(db,task.id,run.id);
  });
};
/** Hito 13: cancelar deja la run reconciliada (terminal cerrado, árbol retirado, tarea preparada) o pregunta qué hacer con lo que quede. */
export const workerStop: Handler=async (cmd,ctx)=>{
  const run=requireRun(ctx.db,(cmd.payload as any).runId);
  const owns=()=>{
    const task=requireTask(ctx.db,run.taskId);
    const latest=ctx.db.prepare('select id from runs where task_id=? order by rowid desc limit 1').get(run.taskId);
    return task.state!=='done' && latest?.id===run.id && (!task.worktreeId || task.worktreeId===run.metadata.worktreeId);
  };
  const tracking=owns();
  // al reanudarse tras una espera, nada de lo de arriba se repite (cambiaría el contexto de la Decisión abierta)
  if(run.metadata.stopCommandId!==cmd.id) transaction(ctx.db,()=>{
    if(run.state==='running') finishRun(ctx.db,run.id,'cancelled',`Seguimiento detenido; no se confirma terminación del proceso ${run.provider}`);
    release(ctx.db,run.id);
    updateRun(ctx.db,run.id,{waiting:false,phase:'finished',stopCommandId:cmd.id,pollGeneration:(run.metadata.pollGeneration ?? 0)+1});
    if(tracking) {
      moveTask(ctx.db,run.taskId,'preparada');
      ctx.db.prepare('update tasks set wait_reason=? where id=?')
        .run('Seguimiento detenido; reconciliar el worktree conservado antes de continuar',run.taskId);
    }
  });
  if(tracking) return reconcileTask(ctx,cmd,run.taskId);
};
