import type { Handler, WorkerContext } from '../runner.ts';
import type { Run } from '../model.ts';
import { requestReview } from '../review-request.ts';
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
import { relayStep, replaceWorker } from './worker-relay.ts';
import { workerFailure } from './worker-failure.ts';
import { processPrefix } from '../adapters/process-terminal.ts';
import { readConfig, silentMinutes } from '../config.ts';
import { probeMachine } from '../machine.ts';
import { transcriptDir } from '../transcript.ts';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const nudgeText='Tu turno terminó sin la marca. Si acabaste, commitea y escribe `.nomos-inbox/done.json`. Si no, continúa donde ibas.';
const endedLimit=3;
const reviewerNudgeText='Tu turno terminó sin el veredicto. Escribe una línea NOMOS_REVIEW con el JSON, o el mismo JSON (sin el marcador) en `.nomos-inbox/review.json`.';
const invalidReviewText='Tu NOMOS_REVIEW no es JSON válido y no cuenta. Escribe el mismo veredicto como JSON válido en `.nomos-inbox/review.json` '
  +'(sin el marcador). Dentro de `note` no uses comillas rectas: usa «» o comillas simples.';
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
  // jam 2026-11-10: `claude -p` que ya salió (antes de leer, para no perder sus últimas líneas)
  const exited=run.sessionRef?.startsWith(processPrefix) ? await orca.terminalIsIdle(run.sessionRef) : false;
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
  let review:Extract<(typeof fresh)[number],{kind:'REVIEW'}>|undefined,finished=false,restart=false,sent=false;
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
        finished=task.area!=='ui';
        return;
      }
      // jam 2026-11-10: con varias, manda la última (un ejemplo de aprobación en un bloque no gana al veredicto real)
      if(marker.kind==='REVIEW') {if(run.role==='revisor'&&!blockedNow()) review=marker;continue;}
      // Candela 2026-11-10: aprobó con JSON roto y quedó «esperando» 8 min; se le pide repetirlo en el archivo, dos veces
      if(marker.kind==='INVALID_REVIEW' && run.role==='revisor' && (run.metadata.reviewRetries ?? 0)<2) {
        const n=(run.metadata.reviewRetries ?? 0)+1;
        run=updateRun(db,run.id,{reviewRetries:n});
        enqueue(db,'worker.send',{runId:run.id,text:invalidReviewText},`review-invalida:${run.id}:${n}`);
        sent=true;
      }
      waiting(marker.question);
    }
    // una marca cierra la racha de finales sin marca
    if(observed.some(m=>m.kind!=='SKILLS') && (run.metadata.nudges ?? 0)>0) run=updateRun(db,run.id,{nudges:0});
    // experimento metras 2026-11-08: un hook (p. ej. Second Brain «Memoria ocupada») rechazó el mensaje y el worker se
    // queda parado sin pregunta: se le reenvía el mismo mensaje, hasta 3 veces por run
    const original=lines.findIndex(l=>/^Original prompt: /.test(l));
    if(original>=0 && lines.some(l=>/operation blocked by hook/.test(l)) && (run.metadata.hookRetries ?? 0)<3) {
      const n=(run.metadata.hookRetries ?? 0)+1;
      run=updateRun(db,run.id,{hookRetries:n});
      enqueue(db,'worker.send',{runId:run.id,text:lines.slice(original).join(String.fromCharCode(10)).replace(/^Original prompt: /,'')},`hook-bloqueado:${run.id}:${n}`);
      sent=true;
      appendEvent(db,'worker.hook_retry',null,{runId:run.id,taskId:run.taskId,provider:run.provider,attempt:n});
    }
    const permission=permissionPrompt(run.provider,lines);
    if(permission) waiting(permission);
    if (idle) waiting(`${run.provider} espera instrucciones`);
    // jam 2026-11-10: el turno de `claude -p` acabó sin DONE, ASK ni REVIEW: se le reenvía al momento; al tercero, worker nuevo
    if(exited && !review && !sent && !permission && !run.metadata.waiting && !blockedNow() && Number(cursor)>0 && cursor!==previous.nudgedCursor) {
      const nudges=(run.metadata.nudges ?? 0)+1, reviewer=run.role==='revisor';
      run=updateRun(db,run.id,{nudges,nudgedCursor:cursor});
      appendEvent(db,'worker.ended_without_marker',null,{runId:run.id,taskId:run.taskId,nudges});
      if(nudges<endedLimit) enqueue(db,'worker.send',{runId:run.id,text:reviewer ? reviewerNudgeText : nudgeText},`nudge:${run.id}:${nudges}`);
      // el revisor no se releva (la run nueva no traería la instantánea de la revisión): espera al director
      else if(reviewer) waiting(`El revisor terminó ${endedLimit} turnos sin NOMOS_REVIEW`);
      else restart=true;
    }
    queuePoll(db,run);
    const current=requireTask(db,run.taskId);
    if(current.decisionId || current.blockedReason) pauseForDecision(db,run.taskId,run.id);
  });
  inbox.consume();
  if(restart) return endedThreeTimes(ctx,run);
  if(review) await finishReview(ctx,run,review);
  if(!finished) await silenceStep(ctx,requireRun(db,run.id));
  if(finished && doneCommit) await autoReview(ctx,run,doneCommit);
};
/** Experimento metras 2026-11-08: NOMOS_DONE con commit nuevo y nada pendiente pide la revisión al momento, sin esperar al
 *  director (la UI la pide su QA visual). Si no procede ahora, el barrido de atascos la retoma. */
async function autoReview(ctx:WorkerContext,run:Run,commit:string):Promise<void> {
  const task=requireTask(ctx.db,run.taskId);
  if(task.decisionId || task.blockedReason || commit===runTree(ctx.db,run).baseCommit) return;
  try {
    const commandId=await requestReview(ctx.db,ctx.dataDir,ctx.git,run.taskId,run.id);
    appendEvent(ctx.db,'review.auto_requested',null,{taskId:run.taskId,commit,reason:'NOMOS_DONE',commandId});
  } catch { /* p. ej. otra corrección en cola o una revisión en marcha */ }
}

/** Tres turnos sin marca: un worker nuevo en el mismo árbol, una sola vez; si el relevo tampoco entrega, la tarea se bloquea. */
async function endedThreeTimes(ctx:WorkerContext,run:Run):Promise<void> {
  const cause=`El worker terminó ${endedLimit} turnos sin entregar`;
  if(run.metadata.restartOf) return workerFailure(ctx.db,{runId:run.id},cause);
  await replaceWorker(ctx,run,{state:'failed',note:cause,title:'## Continuación tras un reinicio',mark:{restartOf:run.id},
    why:`Otro worker empezó esta tarea en este mismo árbol y terminó ${endedLimit} turnos sin entregar.`});
}

const skipped=new Set(['.git','Intermediate','Binaries','Saved','DerivedDataCache','node_modules','Empaquetado','.vs','.nomos']);
/** El archivo modificado más reciente (ms); sin las carpetas que genera Unreal. */
function newest(dir:string,depth=0):number {
  let max=0;
  let entries;
  try { entries=readdirSync(dir,{withFileTypes:true}); } catch { return 0; }
  for(const e of entries) {
    if(skipped.has(e.name)) continue;
    const path=join(dir,e.name);
    try { max=Math.max(max,e.isDirectory() ? depth<8 ? newest(path,depth+1) : 0 : statSync(path).mtimeMs); } catch { /* borrado entre medias */ }
  }
  return max;
}
/** Señal de vida: lo más reciente entre la salida, la transcripción de la sesión y los archivos del árbol. */
function lifeAt(ctx:WorkerContext,run:Run,warnMs:number,now:number):number {
  const quick=Math.max(Date.parse(run.metadata.lastOutputAt ?? run.startedAt) || 0,Date.parse(run.startedAt) || 0);
  if(now-quick<warnMs) return quick;
  const tree=runTree(ctx.db,run).path,transcripts=transcriptDir(tree);
  return Math.max(quick,existsSync(transcripts) ? newest(transcripts) : 0,newest(tree));
}
/** Jam 2026-11-10: vivo y mudo. A los `warn` min, `worker.silent` una vez; a los `act`, sin Unreal ni compilación en el PC
 *  (empaquetar calla minutos), se mata el turno y se reenvía. Como mucho una vez por minuto. */
export async function silenceStep(ctx:WorkerContext,run:Run,now=Date.now()):Promise<void> {
  if(run.state!=='running' || run.metadata.waiting || now-(run.metadata.silenceCheckedAt ?? 0)<60_000) return;
  const {warn,act}=silentMinutes(readConfig(ctx.dataDir)),last=lifeAt(ctx,run,warn*60_000,now);
  const minutes=Math.floor((now-last)/60_000);
  run=updateRun(ctx.db,run.id,{silenceCheckedAt:now,silentMinutes:minutes>=warn ? minutes : 0});
  if(minutes<warn) return;
  if(run.metadata.silentWarnedAt!==last) {
    updateRun(ctx.db,run.id,{silentWarnedAt:last});
    appendEvent(ctx.db,'worker.silent',null,{runId:run.id,taskId:run.taskId,minutes});
  }
  if(minutes<act || run.metadata.silentKilledAt===last || !ctx.orca.terminalKill || !run.sessionRef?.startsWith(processPrefix)) return;
  const m=(ctx.probe ?? probeMachine)();
  if(m.editors+(m.tools ?? 0)>0) return;
  await ctx.orca.terminalKill(run.sessionRef);
  updateRun(ctx.db,run.id,{silentKilledAt:last,nudgedCursor:run.metadata.cursor});
  enqueue(ctx.db,'worker.send',{runId:run.id,text:nudgeText},`silent:${run.id}:${last}`);
}
