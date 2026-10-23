import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Handler } from '../runner.ts';
import type { Run } from '../model.ts';
import { filtered } from '../repo/rows.ts';
import { readConfig, type WorkerProvider } from '../config.ts';
import { chooseProvider } from '../scheduler-provider.ts';
import { reviewTarget, reviewSnapshot, reviewCurrent } from '../review.ts';
import { startWorker } from './worker-start.ts';
import { appendEvent } from '../store.ts';
import { updateRun } from '../repo/worker.ts';
import { workerSkillsBrief } from '../brief.ts';

export const reviewStart:Handler=async(cmd,ctx)=>{
  const payload=cmd.payload as any;
  const {task,implementer}=reviewTarget(ctx.db,payload.taskId,payload.implementerRunId);
  const {snapshot,patch}=await reviewSnapshot(ctx,task.id,implementer.id),generation=snapshot.generation;
  if(payload.generation && payload.generation!==generation) throw new Error('invalid_review_generation');
  const history=filtered<Run>(ctx.db,'runs',{taskId:task.id});
  const previous=history.find(r=>r.role==='revisor'&&r.metadata.review?.implementerRunId===implementer.id
    &&r.metadata.review.generation===generation);
  if(previous && !(previous.state==='running'&&previous.metadata.phase==='preparing'&&!previous.sessionRef
    &&!previous.metadata.worktreeId&&!previous.metadata.uncertain&&previous.metadata.startCommandId===cmd.id))
    return {runId:previous.id};
  const choice=chooseProvider('revisor',readConfig(ctx.dataDir),{codex:0,claude:0,opencode:0},implementer.provider as WorkerProvider);
  if(!choice.provider) return {deferred:true,reason:choice.reason};
  if(payload.provider==='opencode') return {deferred:true,reason:'OpenCode sin adaptador disponible'};
  if(payload.provider!==choice.provider) {
    const previousProvider=payload.provider;payload.provider=choice.provider;
    ctx.db.prepare('update commands set payload=?,updated_at=? where id=?')
      .run(JSON.stringify(payload),new Date().toISOString(),cmd.id);
    appendEvent(ctx.db,'review.provider_changed',null,{commandId:cmd.id,taskId:task.id,previousProvider,provider:choice.provider,
      ...(previous ? {runId:previous.id} : {})});
  }
  if(previous && previous.provider!==choice.provider) updateRun(ctx.db,previous.id,{}, {provider:choice.provider});
  if(task.decisionId) return {policyBlocked:true,decisionId:task.decisionId};
  return startWorker({...cmd,payload:{...payload,provider:choice.provider,role:'revisor',skills:[],attempt:1}},ctx,{
    snapshot,valid:()=>reviewCurrent(ctx,task.id,snapshot),
    brief:(path,run)=>{
      mkdirSync(join(path,'.kratos-review'),{recursive:true});writeFileSync(join(path,'.kratos-review','diff.patch'),patch);
      appendEvent(ctx.db,'review.started',null,{taskId:task.id,runId:run.id,provider:run.provider,...snapshot,same_provider:choice.sameProvider});
      return `# Revisión independiente\n\nSolo inspección: no modificar la implementación, crear commits ni hacer merge.\n\n`
        +workerSkillsBrief(run)
        +`## Encargo\n${task.spec}\n\n## Criterios de aceptación\n${task.acceptance.map(s=>'- '+s).join('\n')}\n\n`
        +`Inspecciona .kratos-review/diff.patch (cambios desde la base) y el contexto de este árbol.\n`
        +`Implementación: ${snapshot.commit}. Generación: ${snapshot.generation}.\n`
        +`Termina fuera de bloques de código con una línea: KRATOS_REVIEW {"approved":true,"findings":[]}\n`
        +`Para rechazar usa approved:false y findings con file, line (entero positivo), severity y note.\n`
        +`Si necesitas aclaración: KRATOS_ASK {"question":"Pregunta"}. No uses KRATOS_DONE.\n`;
    }});
};
