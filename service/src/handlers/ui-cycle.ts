import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { umgCapture, type UmgOptions } from '../checks/umg.ts';
import { checkRun, implementerOf, sendCorrection, treeOf } from './checks.ts';

export const uiCycleKey = (run: Run) => `ui.cycle:${run.id}:${run.metadata.pollGeneration ?? 0}`;

/** ui.cycle: capturas con y sin UI a cada resolución y, si la UI aparece, revisión de QA visual con Claude. */
export function createUiCycle(deps: CheckDeps = {}): Handler {
  return async (command, ctx) => {
    const payload = command.payload as {taskId?: unknown; runId?: unknown} & UmgOptions;
    if (typeof payload.taskId !== 'string') throw new Error('invalid_command_payload');
    const task = requireTask(ctx.db, payload.taskId), implementer = implementerOf(ctx, task, payload.runId);
    const {tree, project} = treeOf(ctx, implementer);
    const run = checkRun(ctx, command, task, implementer);
    const input = {task, run, implementer, project, files: [], worktree: tree?.path ?? project.dir};
    const outcome = await withEditor(ctx, project, run,
      () => runCheck('umg', umgCapture({resolutions: payload.resolutions, map: payload.map, widgets: payload.widgets}), ctx, input, deps));
    if ('deferred' in outcome) return outcome;
    if (outcome.result === 'failed') {
      finishRun(ctx.db, run.id, 'failed', 'La comprobación umg falló');
      const event = ctx.db.prepare(`select payload from events where type='test.failed' and json_extract(payload,'$.testRunId')=?`).get(outcome.id);
      sendCorrection(ctx, task, implementer, outcome, event ? JSON.parse(event.payload as string).summary.split('\n') : [], run.id);
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
  const dir = join(path, '.kratos-review');
  mkdirSync(dir, {recursive: true});
  const shots = filtered<Artifact>(ctx.db, 'artifacts', {taskId: task.id, kind: 'screenshot'})
    .filter(a => (a.provenance as Record<string, JsonValue>)?.testRunId === testRunId);
  const lines = shots.map(shot => {
    const p = shot.provenance as Record<string, string>;
    copyFileSync(shot.path, join(dir, basename(shot.path)));
    if (p.control && existsSync(p.control)) copyFileSync(p.control, join(dir, basename(p.control)));
    return `- \`.kratos-review/${basename(shot.path)}\` · ${p.resolution} · mapa ${p.map ?? 'por defecto'} · control \`.kratos-review/${basename(p.control ?? '')}\``;
  });
  const test = filtered<TestRun>(ctx.db, 'test_runs', {id: testRunId})[0];
  const direction = join(ctx.projectDir, 'docs', 'ui-direction.md');
  const values: Record<string, string> = {title: task.title, spec: task.spec, skills: workerSkillsBrief(run),
    acceptance: task.acceptance.map((s, i) => `${i + 1}. ${s}`).join('\n'), captures: lines.join('\n') || '(sin capturas)',
    commit: test?.commit ?? snapshot.commit, generation: snapshot.generation,
    direction: existsSync(direction) ? readFileSync(direction, 'utf8') : 'El juego no tiene docs/ui-direction.md: revisa contra los criterios mínimos.'};
  const template = readFileSync(fileURLToPath(new URL('../../../skills/kratos/references/brief-qa-visual.md', import.meta.url)), 'utf8');
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? '');
}
