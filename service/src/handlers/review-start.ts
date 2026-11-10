import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Handler } from '../runner.ts';
import type { Run } from '../model.ts';
import { filtered } from '../repo/rows.ts';
import { rapido, readConfig, type WorkerProvider } from '../config.ts';
import { chooseProvider } from '../scheduler-provider.ts';
import { reviewTarget, reviewSnapshot, reviewCurrent } from '../review.ts';
import { startWorker } from './worker-start.ts';
import { appendEvent } from '../store.ts';
import { updateRun } from '../repo/worker.ts';
import { capturasBrief, workerSkillsBrief } from '../brief.ts';
import { skillsForRole } from '../skills.ts';
import { qaBrief } from './ui-cycle.ts';
import { askMerge } from '../main-base.ts';

export const reviewStart:Handler=async(cmd,ctx)=>{
  const payload=cmd.payload as any;
  // QA visual (hito 5): un run revisor más, con las capturas de ui.cycle y sin aprobar el código
  const qa=payload.qa && typeof payload.qa.testRunId==='string' ? {testRunId:payload.qa.testRunId as string} : undefined;
  const {task,implementer}=reviewTarget(ctx.db,payload.taskId,payload.implementerRunId);
  // hito 22: revisar una rama sin lo último de main es revisar otra cosa; antes, que el worker la fusione
  if(!qa && await askMerge(ctx,task,implementer)) return {needsMain:true};
  const {snapshot,patch}=await reviewSnapshot(ctx,task.id,implementer.id),generation=snapshot.generation;
  if(payload.generation && payload.generation!==generation) throw new Error('invalid_review_generation');
  const history=filtered<Run>(ctx.db,'runs',{taskId:task.id});
  const previous=history.find(r=>r.role==='revisor'&&r.metadata.review?.implementerRunId===implementer.id
    &&r.metadata.review.generation===generation&&r.metadata.qa?.testRunId===qa?.testRunId);
  if(previous && !(previous.state==='running'&&previous.metadata.phase==='preparing'&&!previous.sessionRef
    &&!previous.metadata.worktreeId&&!previous.metadata.uncertain&&previous.metadata.startCommandId===cmd.id))
    return {runId:previous.id};
  const choice=chooseProvider('revisor',readConfig(ctx.dataDir),{codex:0,claude:0,opencode:0},implementer.provider as WorkerProvider);
  if(!choice.provider) return {deferred:true,reason:choice.reason};
  if(payload.provider!==choice.provider) {
    const previousProvider=payload.provider;payload.provider=choice.provider;
    ctx.db.prepare('update commands set payload=?,updated_at=? where id=?')
      .run(JSON.stringify(payload),new Date().toISOString(),cmd.id);
    appendEvent(ctx.db,'review.provider_changed',null,{commandId:cmd.id,taskId:task.id,previousProvider,provider:choice.provider,
      ...(previous ? {runId:previous.id} : {})});
  }
  if(previous && previous.provider!==choice.provider) updateRun(ctx.db,previous.id,{}, {provider:choice.provider});
  if(task.decisionId) return {policyBlocked:true,decisionId:task.decisionId};
  return startWorker({...cmd,payload:{...payload,provider:choice.provider,role:'revisor',skills:qa ? [...new Set([...skillsForRole('qa',''),'ue-visual-qa'])] : [],attempt:1}},ctx,{
    snapshot,valid:()=>reviewCurrent(ctx,task.id,snapshot),
    brief:(path,run)=>{
      mkdirSync(join(path,'.nomos-review'),{recursive:true});writeFileSync(join(path,'.nomos-review','diff.patch'),patch);
      appendEvent(ctx.db,'review.started',null,{taskId:task.id,runId:run.id,provider:run.provider,...snapshot,same_provider:choice.sameProvider,
        ...(qa ? {qa} : {})});
      if(qa) {updateRun(ctx.db,run.id,{qa});return qaBrief(ctx,task,run,snapshot,qa.testRunId,path);}
      return `# Revisión independiente\n\nSolo inspección: no modificar la implementación, crear commits ni hacer merge.\n\n`
        +workerSkillsBrief(run)
        +`## Encargo\n${task.spec}\n\n## Criterios de aceptación\n${task.acceptance.map(s=>'- '+s).join('\n')}\n\n`
        +`Inspecciona .nomos-review/diff.patch (cambios desde la base) y el contexto de este árbol.\n`
        +`Implementación: ${snapshot.commit}. Generación: ${snapshot.generation}.\n`
        +`Termina fuera de bloques de código con una línea: NOMOS_REVIEW {"approved":true,"findings":[]}\n`
        +`Para rechazar usa approved:false y findings con file, line (entero positivo), severity y note.\n`
        +`Si necesitas aclaración: NOMOS_ASK {"question":"Pregunta"}. No uses NOMOS_DONE.\n`
        // rápido: un rechazo cuesta una vuelta entera (Física, metras: 3 correcciones por un archivo de otra pista)
        +(rapido(readConfig(ctx.dataDir)) ? `\nModo rápido: rechaza solo si un criterio no se cumple, no compila, se cae o rompe otra parte del juego. `
          +`Estilo, tests que faltan o archivos fuera del alcance sin daño: aprueba y anótalo en findings con severity "nota".\n` : '')
        +capturasBrief(path);
    }});
};
