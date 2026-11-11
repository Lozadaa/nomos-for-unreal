import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkerContext } from '../runner.ts';
import type { Run } from '../model.ts';
import type { Marker } from './worker-markers.ts';
import { reviewCurrent, reviewGeneration } from '../review.ts';
import { requireRun, updateRun } from '../repo/worker.ts';
import { requireTask, moveTask } from '../repo/tasks.ts';
import { finishRun } from '../repo/runs.ts';
import { transaction } from '../repo/rows.ts';
import { addArtifact, updateTestRun } from '../repo/artifacts.ts';
import { advance } from './checks.ts';
import { appendEvent } from '../store.ts';
import { enqueue } from '../commands.ts';
import { attribute } from '../attribution.ts';
import { finishReviewApproval, pendingApproval } from '../approvals.ts';
import { integrateIfFree } from '../routes/task-closing.ts';
import { limits, readConfig } from '../config.ts';
import { fallosArte, lineaFallo, pendienteVisual } from '../checks/arte.ts';
import { filtered, read } from '../repo/rows.ts';
import type { TestRun, Worktree } from '../model.ts';
import { umgAttempt } from '../checks/umg.ts';
import { umgStuck } from './ui-cycle.ts';
import { pideLote } from '../checks/select.ts';

export async function finishReview(ctx:WorkerContext,run:Run,marker:Extract<Marker,{kind:'REVIEW'}>):Promise<void> {
  const {db}=ctx,snapshot=run.metadata.review;
  const current=!!snapshot && await reviewCurrent(ctx,run.taskId,snapshot);
  // juez de arte: pasada n de limits.arte; en la última, lo que queda por debajo de 2 se integra y se anota antes de integrar
  const arte=run.metadata.arte,fallos=arte ? fallosArte(marker.notas,marker.findings) : [],limite=limits(readConfig(ctx.dataDir)).arte;
  const pasada=filtered<TestRun>(db,'test_runs',{taskId:run.taskId,checkId:'arte'}).filter(r=>r.result==='failed').length+1;
  const ultima=!!arte && fallos.length>0 && pasada>=limite;
  if(ultima && current) {
    const tree=read<Worktree>(db,'worktrees',requireRun(db,snapshot!.implementerRunId).metadata.worktreeId ?? '');
    if(tree) await pendienteVisual(ctx,tree.path,fallos).catch(()=>{});
  }
  transaction(db,()=>{
    run=requireRun(db,run.id);if(run.state!=='running') return;
    const task=requireTask(db,run.taskId),implementer=snapshot ? requireRun(db,snapshot.implementerRunId) : undefined;
    const stale=!current || !implementer || implementer.state!=='done'
      || reviewGeneration(task,implementer)!==snapshot!.inputGeneration || !!task.decisionId || !!task.blockedReason;
    const report={...marker,runId:run.id,provider:run.provider,...snapshot,stale};
    const path=`review-${run.id}.json`;mkdirSync(join(ctx.dataDir,'artifacts'),{recursive:true});
    writeFileSync(join(ctx.dataDir,'artifacts',path),JSON.stringify(report,null,2)+'\n');
    finishRun(db,run.id,'done',stale ? 'Revisión desactualizada' : marker.approved ? 'Aprobado' : 'Correcciones requeridas');
    updateRun(db,run.id,{waiting:false,phase:'finished',markerBuffer:''});
    addArtifact(db,{taskId:run.taskId,runId:run.id,kind:'report',path,
      provenance:{...report,label:run.metadata.qa ? 'QA visual · informe' : arte ? 'Juez de arte · informe' : 'Revisión · informe'}});
    appendEvent(db,'review.finished',null,{taskId:run.taskId,...report});
    if(stale) {
      // TrompoArte: el responsable commiteó tras entregar y nada más lo para; se revisa lo nuevo (antes quedaba en revisando)
      if(!current && implementer?.state==='done' && !task.decisionId && !task.blockedReason && task.state==='revisando' && !arte && !run.metadata.qa)
        enqueue(db,'review.start',{taskId:run.taskId,implementerRunId:implementer.id},`review.restale:${run.id}`);
      return;
    }
    if(arte) {
      const ok=!fallos.length,result=ok || ultima ? 'passed' : 'failed',lineas=fallos.map(lineaFallo);
      updateTestRun(db,arte.testRunId,{result});
      appendEvent(db,`test.${result}`,null,{testRunId:arte.testRunId,taskId:run.taskId,runId:run.id,check:'arte',notas:marker.notas ?? {},pasada,
        summary:ok ? 'Juez de arte: todos los criterios en 2 o más'
          : ultima ? [`Juez de arte: se integra con pendientes visuales (pasada ${pasada} de ${limite}, en docs/hecho.md)`,...lineas].join('\n') : lineas.join('\n')});
      if(result==='passed') { advance(ctx,run.taskId); return; }
      // no gasta la corrección del modo rápido (worker-send: arte); el siguiente NOMOS_DONE repite revisión, lote y juez
      const text=`Juez de arte (pasada ${pasada} de ${limite}): por debajo de 2, qué cambiar:\n${lineas.join('\n')}\n\n`
        +'Arréglalo con el arsenal (ue-oficio/references/arsenal-visual.md), vuelve a sacar Scripts/capturar.ps1 -Demo, mira los detalle-*.png, commitea y entrega con NOMOS_DONE.';
      enqueue(db,'worker.send',{runId:implementer!.id,text,arte:true},`arte.correction:${run.id}`);
      moveTask(db,run.taskId,'implementando');
      return;
    }
    const qa=run.metadata.qa;
    if(qa) {
      // QA visual: decide la prueba umg; la aprobación del código sigue siendo de la revisión independiente
      const result=marker.approved ? 'passed' : 'failed';
      updateTestRun(db,qa.testRunId,{result});
      const findings=marker.findings.map(f=>`${f.file}:${f.line} [${f.severity}] ${f.note}`);
      appendEvent(db,`test.${result}`,null,{testRunId:qa.testRunId,taskId:run.taskId,runId:run.id,check:'umg',
        summary:marker.approved ? 'QA visual aprobado' : findings.slice(0,30).join('\n')});
      if(marker.approved) {
        // hito 7: tras el QA la revisión de código la encola el servicio; clave por QA porque la de la run ya existe tras una corrección
        if(!advance(ctx,run.taskId) && task.state==='revisando' && !task.reviewApproved)
          enqueue(db,'review.start',{taskId:run.taskId,implementerRunId:implementer!.id},`review.after-qa:${run.id}`);
        return;
      }
      // docs/x10/umg-bucles.md: los hallazgos y, debajo, qué cambió desde el intento anterior
      const attempt=umgAttempt(db,run.taskId,qa.testRunId,findings.slice(0,30).join('\n'));
      // tope: la Decisión la espera un ui.cycle nuevo, que reenvía el diagnóstico o vuelve a capturar según se elija
      if(umgStuck(ctx,task,attempt,()=>enqueue(db,'ui.cycle',{taskId:run.taskId,runId:implementer!.id},`ui.cycle:atasco:${qa.testRunId}`).id)) return;
      const text=`Correcciones de QA visual:\n${findings.join('\n')}\n\n${[attempt.head.replace(/:$/,''),...attempt.comparison].join('\n')}`;
      enqueue(db,'worker.send',{runId:implementer!.id,text},`review.correction:${run.id}`);
      moveTask(db,run.taskId,'implementando');
      return;
    } else {
      db.prepare('update tasks set review_approved=? where id=?').run(marker.approved ? 1 : 0,run.taskId);
      attribute(db,run.taskId,'reviso',run);
    }
    if(marker.approved) afterApproval(ctx,run.taskId,implementer!.id,`checks:review:${run.id}`,marker.focus);
    else {
      const text='Correcciones de revisión:\n'+marker.findings.map(f=>`${f.file}:${f.line} [${f.severity}] ${f.note}`).join('\n');
      enqueue(db,'worker.send',{runId:implementer!.id,text},`review.correction:${run.id}`);
      moveTask(db,run.taskId,'implementando');
    }
  });
}

/** Revisión de código aprobada (o aceptada con hallazgos): aprobación del usuario si toca, comprobaciones o integración. */
export function afterApproval(ctx:WorkerContext,taskId:string,implementerId:string,checksKey:string,focus?:string[]):void {
  const {db}=ctx,task=requireTask(db,taskId);
  // hito 22: lo que se ve y se juega lo aprueba el usuario («Por aprobar»); mientras, la tarea queda retenida
  finishReviewApproval(db,task,readConfig(ctx.dataDir),focus);
  if(pideLote(task)) {
    moveTask(db,taskId,'probando');
    // hito 5: la puerta probando → integrando la abren las comprobaciones del diff
    enqueue(db,'checks.run',{taskId,runId:implementerId},checksKey);
  } else integrateIfFree(db,taskId);
}
