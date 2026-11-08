import type { Handler } from '../runner.ts';
import { requireRun, runTree, updateRun, queuePoll } from '../repo/worker.ts';
import { transaction } from '../repo/rows.ts';
import { finishRun } from '../repo/runs.ts';
import { moveTask, requireTask } from '../repo/tasks.ts';
import { appendEvent } from '../store.ts';
import { pauseForDecision } from './worker-decisions.ts';
import { refreshPendingDecision } from '../repo/decisions.ts';
import { createHash } from 'node:crypto';
import { streamMarkers, screenMarkers, markerId, compactMarkerText, inboxMarkers } from './worker-markers.ts';
import { finishReview } from './review-finish.ts';
import { permissionPrompt, opencodeFatal, asksForInput } from './worker-launch.ts';
import { discardOpencode } from './worker-opencode.ts';
import { enqueue } from '../commands.ts';
import { uiCycleKey } from './ui-cycle.ts';
import { attribute } from '../attribution.ts';
import { relayStep } from './worker-relay.ts';
export const workerPoll: Handler=async (cmd,ctx)=>{
  const {db,orca}=ctx,payload=cmd.payload as any;
  let run=requireRun(db,payload.runId);
  if (run.state!=='running' || (payload.generation ?? 0)!==(run.metadata.pollGeneration ?? 0)) return;
  const inbox=inboxMarkers(runTree(db,run).path);
  if (run.metadata.deadlineAt && Date.now()>=Date.parse(run.metadata.deadlineAt)) throw new Error('orca: tiempo máximo de 4 horas agotado');
  const task=requireTask(db,run.taskId);
  if(task.decisionId || task.blockedReason) {
    transaction(db,()=>{pauseForDecision(db,run.taskId,run.id);queuePoll(db,run);});return;
  }
  // hito 19: 15 min antes del límite de Orca, relevo por un worker nuevo en el mismo árbol
  if(await relayStep(ctx,run)) return;
  run=requireRun(db,run.id);
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
  const observed=[...inbox.found,...snapshot ? changed ? screenMarkers(screenLines) : [] : parsed.found];
  const seen=run.metadata.seenDoneMarkers ?? [],legacy=run.metadata.legacyDoneSummaries ?? [];
  // Una pregunta en pantalla sigue visible tras contestarla: en snapshots solo cuenta la primera vez.
  const seenAsk=run.metadata.seenAskMarkers ?? [],asks=observed.flatMap(m=>m.kind==='ASK' ? [compactMarkerText(m.question)] : []);
  const fresh=observed.filter(marker=>marker.kind==='ASK' ? !snapshot || !seenAsk.includes(compactMarkerText(marker.question))
    : marker.kind!=='DONE' || !seen.includes(markerId(marker)) && !legacy.includes(compactMarkerText(marker.summary)));
  const seenDoneMarkers=[...new Set([...seen,...observed.flatMap(marker=>marker.kind==='DONE' ? [markerId(marker)] : [])])].slice(-32);
  const fatal=run.provider==='opencode' ? opencodeFatal(lines) : undefined;
  if(fatal) return discardOpencode(ctx,run,fatal);
  const idlePolls=lines.length ? 0 : (run.metadata.idlePolls ?? 0)+1;
  // hito 18: «espera instrucciones» solo tras 30 s sin salida (6 sondeos), con Orca en reposo y una pregunta o un prompt al final
  const idle=!lines.length && idlePolls>=6 && !run.metadata.waiting && !blockedNow() && asksForInput(run.metadata.lastLines ?? [])
    ? await orca.terminalIsIdle(run.sessionRef!) : false;
  // hito 18: el HEAD de la marca; si después aparecen commits sin otra marca, el barrido de atascos pide la revisión
  const doneCommit=run.role!=='revisor' && fresh.some(m=>m.kind==='DONE')
    ? await (async()=>ctx.git.head(runTree(db,run).path))().catch(()=>undefined) : undefined;
  let review:Extract<(typeof fresh)[number],{kind:'REVIEW'}>|undefined;
  transaction(db,()=>{
    const previous=run.metadata,lastLines=snapshot ? screenLines.slice(-20) : [...(previous.lastLines ?? []),...lines].slice(-20);
    const cursor=stream.source==='screen' ? previous.cursor ?? '0' : stream.cursor;
    run=updateRun(db,run.id,{cursor,lastLines,idlePolls,markerBuffer:parsed.buffer,markerFence:parsed.fence,seenDoneMarkers,
      ...(snapshot && asks.length ? {seenAskMarkers:[...new Set([...seenAsk,...asks])].slice(-32)} : {}),
      ...(snapshot ? {screenFingerprint:fingerprint} : {}),
      ...(lines.length ? {lastOutputAt:new Date().toISOString(),waiting:false,question:undefined,
        phase:previous.phase==='preparing' ? 'preparing' : 'running'} : {})});
    if (lines.length) appendEvent(db,'worker.output',null,{runId:run.id,taskId:run.taskId,provider:run.provider,lines,
      source:snapshot ? 'screen' : stream.source ?? 'stream',snapshot,...(snapshot ? {historyComplete:false} : {}),
      ...(page.limited!==undefined ? {limited:page.limited} : {}),...(page.truncated!==undefined ? {truncated:page.truncated} : {})});
    if (stream.oldestCursor) appendEvent(db,'worker.output_gap',null,
      {runId:run.id,taskId:run.taskId,provider:run.provider,requestedCursor:previous.cursor ?? '0',oldestCursor:stream.oldestCursor});
    // hito 18: la misma espera (misma pregunta, misma última línea) se avisa una vez, aunque entre medias haya salida
    const waiting=(question:string)=>{
      const key=JSON.stringify([question,lastLines.filter(l=>l.trim()).at(-1) ?? '']);
      run=updateRun(db,run.id,{waiting:true,question,lastWaitingKey:key,phase:run.metadata.phase==='preparing' ? 'preparing' : 'waiting'});
      if (previous.lastWaitingKey!==key && (!previous.waiting || previous.question!==question)) appendEvent(db,'worker.waiting',null,
        {runId:run.id,taskId:run.taskId,provider:run.provider,question,lastLines});
    };
    for(const marker of fresh) if(marker.kind==='SKILLS') {
      const changed=JSON.stringify(run.metadata.confirmedSkills)!==JSON.stringify(marker.skills);
      run=updateRun(db,run.id,{confirmedSkills:marker.skills});
      const missing=run.skills.filter(skill=>!marker.skills.includes(skill));
      if(changed && missing.length) appendEvent(db,'worker.skills_missing',null,
        {runId:run.id,taskId:run.taskId,provider:run.provider,required:run.skills,confirmed:marker.skills,missing});
    }
    for (const marker of fresh) {
      if(marker.kind==='SKILLS') continue;
      if (marker.kind==='DONE') {
        if(run.role==='revisor') continue;
        // hito 18: tras una corrección, una marca con commits declarados solo cuenta si HEAD avanzó desde el envío
        if(run.metadata.correctionHead && marker.commits.length && doneCommit===run.metadata.correctionHead) {
          appendEvent(db,'worker.done_ignored',null,{runId:run.id,taskId:run.taskId,provider:run.provider,reason:'sin commit tras la corrección'});
          continue;
        }
        finishRun(db,run.id,'done',marker.summary);updateRun(db,run.id,{waiting:false,phase:'finished',markerBuffer:'',...(doneCommit ? {doneCommit} : {}),...(marker.focus ? {focus:marker.focus} : {})});
        moveTask(db,run.taskId,'revisando');attribute(db,run.taskId,'implemento',run);refreshPendingDecision(db,run.taskId);
        // hito 5: toda pantalla UMG pasa por capturas y QA visual antes de cerrarse
        if(task.area==='ui') enqueue(db,'ui.cycle',{taskId:run.taskId,runId:run.id},uiCycleKey(run));
        return;
      }
      if(marker.kind==='REVIEW') {if(run.role==='revisor'&&!blockedNow()) {review=marker;break;}continue;}
      waiting(marker.question);
    }
    // experimento metras 2026-11-08: un hook (p. ej. Second Brain «Memoria ocupada») rechazó el mensaje y el worker se
    // queda parado sin pregunta: se le reenvía el mismo mensaje, hasta 3 veces por run
    const original=lines.findIndex(l=>/^Original prompt: /.test(l));
    if(original>=0 && lines.some(l=>/operation blocked by hook/.test(l)) && (run.metadata.hookRetries ?? 0)<3) {
      const n=(run.metadata.hookRetries ?? 0)+1;
      run=updateRun(db,run.id,{hookRetries:n});
      enqueue(db,'worker.send',{runId:run.id,text:lines.slice(original).join(String.fromCharCode(10)).replace(/^Original prompt: /,'')},`hook-bloqueado:${run.id}:${n}`);
      appendEvent(db,'worker.hook_retry',null,{runId:run.id,taskId:run.taskId,provider:run.provider,attempt:n});
    }
    const permission=permissionPrompt(run.provider,lines);
    if(permission) waiting(permission);
    if (idle) waiting(`${run.provider} espera instrucciones`);
    queuePoll(db,run);
    const current=requireTask(db,run.taskId);
    if(current.decisionId || current.blockedReason) pauseForDecision(db,run.taskId,run.id);
  });
  inbox.consume();
  if(review) await finishReview(ctx,run,review);
};
