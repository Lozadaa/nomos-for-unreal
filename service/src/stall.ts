import type { DatabaseSync } from 'node:sqlite';
import type { Decision, Run } from './model.ts';
import type { WorkerContext } from './runner.ts';
import { openDecision } from './repo/decisions.ts';
import { decode, filtered, transaction } from './repo/rows.ts';
import { requireRun } from './repo/worker.ts';
import { reviewTarget } from './review.ts';
import { requestReview } from './review-request.ts';
import { terminalBusy } from './sweep.ts';
import { appendEvent } from './store.ts';
import { activeHold } from './hold.ts';
import { moveTask, requireTask } from './repo/tasks.ts';
import { resumePolicyCommand } from './commands.ts';
import { afterApproval } from './handlers/review-finish.ts';
import { requestIntegration } from './routes/task-closing.ts';

/** Estados en los que el servicio (o el director) siempre tiene un paso siguiente encolado o en marcha. */
const active = ['implementando', 'revisando', 'probando', 'integrando', 'cerrando'];
/** El paso que la retoma, como lo pide el director. */
export const resume: Record<string, string> = {implementando: 'worker send <run> --file <corrección>', revisando: 'task review',
  probando: 'task check', integrando: 'task integrate', cerrando: 'task finalize'};
export type Stall = {taskId: string; title: string; state: string; quietSeconds: number};
/** Hito 21: con la revisión aprobada, esperar la integración es a menudo deliberado (un Unreal pesado a la vez). */
export const approvedQuietMs = 30 * 60_000;

/**
 * Hito 7: tarea en estado activo, sin Decisión, bloqueo ni espera, sin run viva ni comando pendiente
 * y sin cambios desde hace `quietMs`. Nada la va a mover: es un atasco.
 */
export function stalledTasks(db: DatabaseSync, now = Date.now(), quietMs = 10 * 60_000): Stall[] {
  const rows = db.prepare(`select t.id,t.title,t.state,t.hold,t.review_approved,max(t.updated_at,coalesce((select max(coalesce(finished_at,updated_at)) from runs where task_id=t.id),'')) at
    from tasks t where t.state in (${active.map(() => '?').join(',')}) and t.decision_id is null and t.blocked_reason is null and t.wait_reason is null
    and not exists (select 1 from runs where task_id=t.id and state='running')
    and not exists (select 1 from commands c where c.state in ('pending','running') and (json_extract(c.payload,'$.taskId')=t.id
      or json_extract(c.payload,'$.runId') in (select id from runs where task_id=t.id)))`).all(...active);
  return rows.flatMap(r => {
    const quiet = now - Date.parse(r.at as string);
    // hito 21: la espera marcada por el director (`nomos task hold`) no es un atasco mientras dure
    if (r.hold && activeHold(db, {hold: JSON.parse(r.hold as string)}, now)) return [];
    const threshold = r.state === 'revisando' && r.review_approved ? Math.max(quietMs, approvedQuietMs) : quietMs;
    return quiet >= threshold ? [{taskId: r.id as string, title: r.title as string, state: r.state as string, quietSeconds: Math.round(quiet / 1000)}] : [];
  });
}

type Step = {wait: true} | {review: string} | {reason: string; step?: {id: string; label: string; description: string; ref: string}};
const cancel = {id: 'cancelar', label: 'Cancelar', description: 'Dejar la tarea sin terminar'};

/**
 * Hito 18: qué falta exactamente. En «revisando», si el responsable hizo commits tras su NOMOS_DONE sin repetir la marca,
 * se pide la revisión del último commit en cuanto su terminal está quieto (ocupado: se espera); sin commits nuevos, la
 * Decisión nombra el commit. En «implementando» sin marca, leer su terminal. Lo demás, el paso del director de siempre.
 */
async function nextStep(ctx: WorkerContext, s: Stall): Promise<Step> {
  // hito 21: revisión aprobada (o pruebas superadas) y nadie pidió la integración: ese es el paso, no otra revisión
  const task = requireTask(ctx.db, s.taskId);
  if (s.state === 'integrando' || s.state === 'revisando' && task.reviewApproved === 1) {
    return {reason: `${s.state === 'revisando' ? 'Revisión aprobada' : 'Lista para integrar'}: falta pedir la integración`,
      step: {id: 'integrar', label: 'Pedir la integración', description: 'Nomos pide la integración (nomos task integrate)', ref: s.taskId}};
  }
  const runs = filtered<Run>(ctx.db, 'runs', {taskId: s.taskId}), last = runs.filter(r => r.role !== 'revisor' && r.provider !== 'unreal').at(-1);
  if (s.state === 'implementando' && last?.sessionRef && last.state !== 'done') return {reason: 'El worker no dio NOMOS_DONE: leer su terminal',
    step: {id: 'leer_terminal', label: 'Leer su terminal', description: 'Nomos lee la pantalla del worker y la deja en la actividad de la tarea', ref: last.id}};
  if (s.state === 'revisando') {
    let target: ReturnType<typeof reviewTarget> | undefined;
    try { target = reviewTarget(ctx.db, s.taskId); } catch { /* sin responsable revisable: el paso genérico */ }
    const head = target && await ctx.git.head(target.tree.path).catch(() => undefined);
    if (target && head && !runs.some(r => r.role === 'revisor' && r.metadata.review?.implementerRunId === target.implementer.id && r.metadata.review.commit === head)) {
      const doneCommit = target.implementer.metadata.doneCommit, ref = target.implementer.sessionRef;
      if (doneCommit && doneCommit !== head) {
        // Orca sin respuesta cuenta como ocupado: se vuelve a mirar en la siguiente pasada
        if (ref && await terminalBusy(ctx.orca, ref).catch(() => true)) return {wait: true};
        return {review: head};
      }
      return {reason: `Pedir la revisión del commit ${head.slice(0, 7)}`,
        step: {id: 'pedir_revision', label: 'Pedir la revisión', description: `Nomos pide la revisión independiente del commit ${head.slice(0, 7)}`, ref: head}};
    }
  }
  return {reason: `Tarea parada en «${s.state}» sin ningún paso en marcha: falta nomos ${resume[s.state]}`};
}

/** Máximo de correcciones: «Revisar» reenvía la corrección parada (ya cabe una más); «Aceptar» da por buena la implementación
 *  con los hallazgos anotados en `review.accepted_with_findings` y sigue como tras una revisión aprobada. */
function correctionsStep(ctx: WorkerContext, d: Decision): void {
  const {db} = ctx;
  const row = db.prepare(`select json_extract(payload,'$.commandId') id from events where type='command.done'
    and json_extract(payload,'$.result.decisionId')=? order by seq desc limit 1`).get(d.id);
  const command = row ? db.prepare("select id,payload from commands where id=? and type='worker.send'").get(row.id as string) : undefined;
  if (!command) throw new Error('sin la corrección parada');
  if (d.chosenOptionId === 'review') return resumePolicyCommand(db, command.id as string, d.id);
  const {runId, text} = JSON.parse(command.payload as string) as {runId: string; text: string};
  transaction(db, () => {
    db.prepare('update tasks set review_approved=1,updated_at=? where id=?').run(new Date().toISOString(), d.taskId);
    if (requireTask(db, d.taskId).state === 'implementando') moveTask(db, d.taskId, 'revisando', 'Aceptada con hallazgos anotados');
    appendEvent(db, 'review.accepted_with_findings', null, {taskId: d.taskId, runId, decisionId: d.id, findings: text});
    afterApproval(ctx, d.taskId, runId, `checks:aceptada:${d.id}`);
  });
}

/** El paso de la opción recomendada, una vez por Decisión resuelta con ella. */
async function runChosenSteps(ctx: WorkerContext): Promise<void> {
  const {db} = ctx;
  const chosen = db.prepare(`select * from decisions d where state='resolved' and chosen_option_id in ('pedir_revision','leer_terminal','integrar','review','aceptar')
    and not exists (select 1 from events where type='stall.step_done' and json_extract(payload,'$.decisionId')=d.id)`).all().map(r => decode<Decision>(r))
    // «Revisar» y «Aceptar» solo son pasos en la Decisión del máximo de correcciones
    .filter(d => !['review', 'aceptar'].includes(d.chosenOptionId!) || d.evidence[0]?.kind === 'gate:corrections');
  for (const d of chosen) {
    const ref = d.evidence.find(e => e.kind === 'paso')?.ref ?? '';
    try {
      if (d.chosenOptionId === 'review' || d.chosenOptionId === 'aceptar') correctionsStep(ctx, d);
      else if (d.chosenOptionId === 'integrar') requestIntegration(db, d.taskId);
      else if (d.chosenOptionId === 'pedir_revision') {
        const commandId = await requestReview(db, ctx.dataDir, ctx.git, d.taskId);
        const commit = await ctx.git.head(reviewTarget(db, d.taskId).tree.path).catch(() => ref);
        appendEvent(db, 'review.auto_requested', null, {taskId: d.taskId, commit, reason: 'decisión', decisionId: d.id, commandId});
      } else {
        const run = requireRun(db, ref), page = await ctx.orca.terminalRead(run.sessionRef!);
        appendEvent(db, 'worker.output', null, {runId: run.id, taskId: run.taskId, provider: run.provider, lines: page.text.split('\n').slice(-50),
          source: page.source ?? 'screen', snapshot: true, historyComplete: false, decisionId: d.id});
      }
      appendEvent(db, 'stall.step_done', null, {taskId: d.taskId, decisionId: d.id, step: d.chosenOptionId});
    } catch (error) {
      appendEvent(db, 'stall.step_done', null, {taskId: d.taskId, decisionId: d.id, step: d.chosenOptionId,
        error: error instanceof Error ? error.message : String(error)});
    }
  }
}

/** Una pasada (cada 5 s, con el planificador): ejecuta lo elegido y, por atasco, pide la revisión sola, espera o abre una Decisión. */
export async function sweepStalls(ctx: WorkerContext, now = Date.now()): Promise<number> {
  const {db} = ctx;
  await runChosenSteps(ctx);
  const stalls = stalledTasks(db, now);
  for (const s of stalls) {
    const step = await nextStep(ctx, s);
    if ('wait' in step) continue;
    if ('review' in step) {
      await requestReview(db, ctx.dataDir, ctx.git, s.taskId);
      appendEvent(db, 'review.auto_requested', null, {taskId: s.taskId, commit: step.review, reason: 'commits tras DONE'});
      continue;
    }
    appendEvent(db, 'task.stalled', null, {taskId: s.taskId, state: s.state, quietSeconds: s.quietSeconds});
    openDecision(db, {taskId: s.taskId, reason: step.reason,
      evidence: [{kind: 'estado', ref: s.state}, ...(step.step ? [{kind: 'paso', ref: step.step.ref}] : [])],
      options: step.step ? [{id: step.step.id, label: step.step.label, description: step.step.description, recommended: true}, cancel]
        : [{id: 'retomar', label: 'Retomar', description: `Nomos no ejecuta nada: el director pide el paso que falta (nomos ${resume[s.state]})`}, cancel]});
  }
  return stalls.length;
}
