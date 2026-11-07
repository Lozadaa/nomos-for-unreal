import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { locatedPath } from '../data-paths.ts';
import { nomosSkills } from '../skills-install.ts';
import type { Handler, WorkerContext } from '../runner.ts';
import type { Artifact, JsonValue, Run, Task, TestRun } from '../model.ts';
import type { ReviewSnapshot } from '../review.ts';
import { filtered } from '../repo/rows.ts';
import { requireTask } from '../repo/tasks.ts';
import { finishRun } from '../repo/runs.ts';
import { enqueue } from '../commands.ts';
import { workerSkillsBrief } from '../brief.ts';
import { withEditor } from '../editor/queue.ts';
import { runCheck, type CheckDeps } from '../checks/run.ts';
import { umgAttempt, umgCapture, type UmgAttempt, type UmgOptions } from '../checks/umg.ts';
import { listDecisions, openDecision, refreshPendingDecision } from '../repo/decisions.ts';
import { appendEvent } from '../store.ts';
import { limits, readConfig } from '../config.ts';
import { selectChecks } from '../checks/select.ts';
import { checkRun, implementerOf, sendCorrection, treeOf } from './checks.ts';

export const uiCycleKey = (run: Run) => `ui.cycle:${run.id}:${run.metadata.pollGeneration ?? 0}`;
export const umgStuckReason = 'QA de UI sin mejora medible';

/** Tras `limits.umgRetries` fallos umg seguidos sin mejora, no hay otra vuelta a ciegas: Decisión con el resumen de esos intentos,
 *  atada a la orden ui.cycle (`commandId`) que la espera. Devuelve si se paró. */
export function umgStuck(ctx: WorkerContext, task: Task, attempt: UmgAttempt, commandId: () => string): boolean {
  if (attempt.stalled < limits(readConfig(ctx.dataDir)).umgRetries) return false;
  const attempts = ctx.db.prepare(`select payload from events where type='umg.attempt' and json_extract(payload,'$.taskId')=? order by seq desc limit ?`)
    .all(task.id, attempt.stalled).map(r => JSON.parse(r.payload as string) as UmgAttempt).reverse();
  openDecision(ctx.db, {taskId: task.id, reason: umgStuckReason,
    evidence: [{kind: 'command', ref: commandId()}, ...attempts.map(a => ({kind: `intento ${a.attempt}`,
      ref: a.findings.slice(0, 3).map(f => `${f.rule} · ${f.where}: ${f.measured}`).join(' · ') + (a.findings.length > 3 ? ` (+${a.findings.length - 3})` : '')}))],
    options: [{id: 'return', label: 'Devolver al responsable', description: 'Enviarle el diagnóstico para otro intento; el contador vuelve a empezar'},
      {id: 'retry', label: 'Reintentar el QA', description: 'Volver a capturar y pasar el QA visual sin cambios (p. ej. tras arreglarlo a mano)'}]});
  return true;
}

/** ui.cycle: capturas con y sin UI a cada resolución y, si la UI aparece, revisión de QA visual con Claude. */
export function createUiCycle(deps: CheckDeps = {}): Handler {
  return async (command, ctx) => {
    const payload = command.payload as {taskId?: unknown; runId?: unknown} & UmgOptions;
    if (typeof payload.taskId !== 'string') throw new Error('invalid_command_payload');
    const task = requireTask(ctx.db, payload.taskId), implementer = implementerOf(ctx, task, payload.runId);
    // tope de reintentos (docs/x10/umg-bucles.md): esta orden espera la Decisión; «Devolver» reenvía el diagnóstico y «Reintentar» vuelve a capturar
    const decision = listDecisions(ctx.db).filter(d => d.taskId === task.id && d.evidence.some(e => e.kind === 'command' && e.ref === command.id)).at(-1);
    if (decision?.state === 'stale') refreshPendingDecision(ctx.db, task.id);
    if (decision && decision.state !== 'resolved') return {deferred: true, reason: `Esperando decisión: ${decision.reason}`};
    if (decision && !ctx.db.prepare(`select 1 from events where type='umg.reset' and json_extract(payload,'$.decisionId')=?`).get(decision.id)) {
      appendEvent(ctx.db, 'umg.reset', null, {taskId: task.id, decisionId: decision.id, optionId: decision.chosenOptionId});
      if (decision.chosenOptionId === 'return') {
        const last = ctx.db.prepare(`select payload from events where type='umg.attempt' and json_extract(payload,'$.taskId')=? order by seq desc limit 1`).get(task.id);
        const attempt = JSON.parse(last!.payload as string) as UmgAttempt;
        sendCorrection(ctx, task, implementer, filtered<TestRun>(ctx.db, 'test_runs', {id: attempt.testRunId})[0] ?? {checkId: 'umg', reportPath: null} as TestRun,
          [attempt.head, ...attempt.diagnosis, ...attempt.comparison], decision.id);
        return {returned: true};
      }
    }
    const {tree, project} = treeOf(ctx, implementer);
    // una tarea ui que no toca Unreal (la dirección de arte escribe docs/ui-direction.md) no tiene pantalla que capturar
    const files = tree ? await ctx.git.changedFiles!(tree.path, tree.baseCommit) : undefined;
    if (files && !selectChecks(files).length) return {skipped: 'el diff no toca Unreal'};
    const run = checkRun(ctx, command, task, implementer);
    const input = {task, run, implementer, project, files: [], worktree: tree?.path ?? project.dir};
    const outcome = await withEditor(ctx, project, run,
      () => runCheck('umg', umgCapture({resolutions: payload.resolutions, map: payload.map, widgets: payload.widgets}), ctx, input, deps));
    if ('deferred' in outcome) return outcome;
    if (outcome.result === 'failed') {
      finishRun(ctx.db, run.id, 'failed', 'La comprobación umg falló');
      const event = ctx.db.prepare(`select payload from events where type='test.failed' and json_extract(payload,'$.testRunId')=?`).get(outcome.id);
      // docs/x10/umg-bucles.md: al worker, el diagnóstico medido y la comparación con su intento anterior, no el resumen en bruto
      const attempt = umgAttempt(ctx.db, task.id, outcome.id, event ? JSON.parse(event.payload as string).summary : '');
      if (umgStuck(ctx, task, attempt, () => command.id)) return {deferred: true, reason: `Esperando decisión: ${umgStuckReason}`};
      sendCorrection(ctx, task, implementer, outcome, [attempt.head, ...attempt.diagnosis, ...attempt.comparison], run.id);
      return {testRunId: outcome.id, passed: false};
    }
    finishRun(ctx.db, run.id, 'done', 'Capturas listas para el QA visual');
    const review = enqueue(ctx.db, 'review.start', {taskId: task.id, implementerRunId: implementer.id, provider: 'claude', qa: {testRunId: outcome.id}},
      `review.qa:${outcome.id}`);
    return {testRunId: outcome.id, reviewCommandId: review.id};
  };
}

/** Brief del run revisor de QA visual: copia las capturas al árbol de revisión y rellena references/brief-qa-visual.md. */
export function qaBrief(ctx: WorkerContext, task: Task, run: Run, snapshot: ReviewSnapshot, testRunId: string, path: string): string {
  const dir = join(path, '.nomos-review');
  mkdirSync(dir, {recursive: true});
  const shots = filtered<Artifact>(ctx.db, 'artifacts', {taskId: task.id, kind: 'screenshot'})
    .filter(a => (a.provenance as Record<string, JsonValue>)?.testRunId === testRunId);
  const lines = shots.map(shot => {
    const p = shot.provenance as Record<string, string>;
    copyFileSync(locatedPath(join(ctx.dataDir, 'artifacts'), shot.path), join(dir, basename(shot.path)));
    if (p.control && existsSync(p.control)) copyFileSync(p.control, join(dir, basename(p.control)));
    return `- \`.nomos-review/${basename(shot.path)}\` · ${p.resolution} · mapa ${p.map ?? 'por defecto'} · control \`.nomos-review/${basename(p.control ?? '')}\``;
  });
  const test = filtered<TestRun>(ctx.db, 'test_runs', {id: testRunId})[0];
  const direction = join(ctx.projectDir, 'docs', 'ui-direction.md');
  const values: Record<string, string> = {title: task.title, spec: task.spec, skills: workerSkillsBrief(run),
    acceptance: task.acceptance.map((s, i) => `${i + 1}. ${s}`).join('\n'), captures: lines.join('\n') || '(sin capturas)',
    commit: test?.commit ?? snapshot.commit, generation: snapshot.generation,
    direction: existsSync(direction) ? readFileSync(direction, 'utf8') : 'El juego no tiene docs/ui-direction.md: revisa contra los criterios mínimos.'};
  const template = readFileSync(join(nomosSkills, 'nomos', 'references', 'brief-qa-visual.md'), 'utf8');
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? '');
}
