import type { Handler } from '../runner.ts';
import { requireRun, runTree, updateRun, queuePoll } from '../repo/worker.ts';
import { transaction } from '../repo/rows.ts';
import { finishRun } from '../repo/runs.ts';
import { moveTask, requireTask } from '../repo/tasks.ts';
import { appendEvent } from '../store.ts';
import { pauseForDecision } from './worker-decisions.ts';
import { refreshPendingDecision } from '../repo/decisions.ts';
import { createHash } from 'node:crypto';
import { streamMarkers, screenMarkers, markerId, compactMarkerText } from './worker-markers.ts';
export const workerPoll: Handler=async (cmd,ctx)=>{
  const {db,orca}=ctx,payload=cmd.payload as any;
  let run=requireRun(db,payload.runId);
  if (run.state!=='running' || (payload.generation ?? 0)!==(run.metadata.pollGeneration ?? 0)) return;
  runTree(db,run);
  if (run.metadata.deadlineAt && Date.now()>=Date.parse(run.metadata.deadlineAt)) throw new Error('orca: tiempo máximo de 4 horas agotado');
  const task=requireTask(db,run.taskId);
  if(task.decisionId || task.blockedReason) {
    transaction(db,()=>{pauseForDecision(db,run.taskId,run.id);queuePoll(db,run);});return;
  }
  const stream=await orca.terminalRead(run.sessionRef!,run.metadata.cursor ?? '0');
  const blockedNow=()=>{const current=requireTask(db,run.taskId);return !!current.decisionId || !!current.blockedReason;};
  let page=stream;
  if(!stream.text && stream.source!=='screen' && !blockedNow()) {
    const fallback=await orca.terminalRead(run.sessionRef!);
    if(fallback.source==='screen') page=fallback;
  }
  const snapshot=page.source==='screen';
  const frame=page.text ? page.text.split('\n') : [];
  const screenLines=frame.slice(-50);
  const fingerprint=snapshot ? createHash('sha256').update(screenLines.join('\n')).digest('hex') : undefined;
  const changed=!snapshot || fingerprint!==run.metadata.screenFingerprint;
  const lines=changed ? snapshot ? screenLines : frame : [];
  const parsed=streamMarkers(snapshot ? [] : lines,stream.oldestCursor ? '' : run.metadata.markerBuffer ?? '',run.metadata.markerFence ?? '');
  const observed=snapshot ? changed ? screenMarkers(screenLines) : [] : parsed.found;
  const seen=run.metadata.seenDoneMarkers ?? [],legacy=run.metadata.legacyDoneSummaries ?? [];
  const fresh=observed.filter(marker=>marker.kind!=='DONE' || !seen.includes(markerId(marker)) && !legacy.includes(compactMarkerText(marker.summary)));
  const seenDoneMarkers=[...new Set([...seen,...observed.flatMap(marker=>marker.kind==='DONE' ? [markerId(marker)] : [])])].slice(-32);
  const idlePolls=lines.length ? 0 : (run.metadata.idlePolls ?? 0)+1;
  const idle=!lines.length && idlePolls>=2 && !run.metadata.waiting && !blockedNow() ? await orca.terminalIsIdle(run.sessionRef!) : false;
  transaction(db,()=>{
    const previous=run.metadata,lastLines=snapshot ? screenLines.slice(-20) : [...(previous.lastLines ?? []),...lines].slice(-20);
    const cursor=stream.source==='screen' ? previous.cursor ?? '0' : stream.cursor;
    run=updateRun(db,run.id,{cursor,lastLines,idlePolls,markerBuffer:parsed.buffer,markerFence:parsed.fence,seenDoneMarkers,
      ...(snapshot ? {screenFingerprint:fingerprint} : {}),
      ...(lines.length ? {lastOutputAt:new Date().toISOString(),waiting:false,question:undefined,
        phase:previous.phase==='preparing' ? 'preparing' : 'running'} : {})});
    if (lines.length) appendEvent(db,'worker.output',null,{runId:run.id,taskId:run.taskId,lines,
      source:snapshot ? 'screen' : stream.source ?? 'stream',snapshot,...(snapshot ? {historyComplete:false} : {}),
      ...(page.limited!==undefined ? {limited:page.limited} : {}),...(page.truncated!==undefined ? {truncated:page.truncated} : {})});
    if (stream.oldestCursor) appendEvent(db,'worker.output_gap',null,
      {runId:run.id,taskId:run.taskId,requestedCursor:previous.cursor ?? '0',oldestCursor:stream.oldestCursor});
    const waiting=(question:string)=>{
      run=updateRun(db,run.id,{waiting:true,question,phase:run.metadata.phase==='preparing' ? 'preparing' : 'waiting'});
      if (!previous.waiting || previous.question!==question) appendEvent(db,'worker.waiting',null,
        {runId:run.id,taskId:run.taskId,question,lastLines});
    };
    for (const marker of fresh) {
      if (marker.kind==='DONE') {
        finishRun(db,run.id,'done',marker.summary);updateRun(db,run.id,{waiting:false,phase:'finished',markerBuffer:''});
        moveTask(db,run.taskId,'revisando');refreshPendingDecision(db,run.taskId);return;
      }
      waiting(marker.question);
    }
    if (idle) waiting('Codex espera instrucciones');
    queuePoll(db,run);
    const current=requireTask(db,run.taskId);
    if(current.decisionId || current.blockedReason) pauseForDecision(db,run.taskId,run.id);
  });
};
