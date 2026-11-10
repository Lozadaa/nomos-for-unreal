import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Handler, WorkerContext } from '../runner.ts';
import type { Command, Decision, Run, Task, TestRun, Worktree } from '../model.ts';
import { filtered, read } from '../repo/rows.ts';
import { moveTask, requireTask } from '../repo/tasks.ts';
import { finishRun, startRun } from '../repo/runs.ts';
import { requireRun, updateRun } from '../repo/worker.ts';
import { recordTestRun, updateTestRun } from '../repo/artifacts.ts';
import { listDecisions, openDecision, refreshPendingDecision } from '../repo/decisions.ts';
import { enqueue } from '../commands.ts';
import { appendEvent } from '../store.ts';
import { withEditor } from '../editor/queue.ts';
import { targetProject, type Project } from './asset-run.ts';
import { targetBranch } from '../integration/workspace.ts';
import { createEditorMcpHandlers } from './editor-mcp.ts';
import { createUiCycle, uiCycleKey } from './ui-cycle.ts';
import { selectChecks, type CheckId } from '../checks/select.ts';
import { runCheck, type CheckDeps, type Executor } from '../checks/run.ts';
import { checkGate, retryOption, waiverOption } from '../checks/gate.ts';
import { cppCheck } from '../checks/cpp.ts';
import { blueprintCheck } from '../checks/blueprint.ts';
import { assetCheck } from '../checks/asset.ts';
import { mapCheck } from '../checks/map.ts';
import { buildCheck } from '../checks/build.ts';
import { acabadoCheck, touchesVisible } from '../checks/acabado.ts';
import { animationCheck, characterOf } from '../checks/animation.ts';
import { readConfig } from '../config.ts';
import { integrateIfFree } from '../routes/task-closing.ts';

const executors: Partial<Record<CheckId, Executor>> = {acabado: acabadoCheck, cpp: cppCheck, blueprint: blueprintCheck, asset: assetCheck, animation: animationCheck(), map: mapCheck, build: buildCheck};
/** `"acabado": false` en .nomos/config.json la apaga (prototipos de usar y tirar); por defecto, encendida. */
const acabadoOn = (ctx: WorkerContext) => readConfig(ctx.dataDir).acabado !== false;
const returnOption = {id: 'return', label: 'Devolver al responsable', description: 'Enviar la lista al implementador para que lo corrija'};

/** El run implementador cuyo diff se prueba: el indicado o el último terminado que no es revisión ni prueba. */
export function implementerOf(ctx: WorkerContext, task: Task, runId?: unknown): Run {
  if (typeof runId === 'string') return requireRun(ctx.db, runId);
  const run = filtered<Run>(ctx.db, 'runs', {taskId: task.id}).filter(r => r.role !== 'revisor' && r.provider !== 'unreal' && r.provider !== 'nomos' && r.role !== 'qa'
    && r.state === 'done').at(-1);
  if (!run) throw new Error('invalid_checks_target');
  return run;
}
export function treeOf(ctx: WorkerContext, run: Run): {tree: Worktree | undefined; project: Project} {
  const tree = run.metadata.worktreeId ? read<Worktree>(ctx.db, 'worktrees', run.metadata.worktreeId) : undefined;
  let project: Project;
  try { project = targetProject(ctx, tree?.path); } catch { project = targetProject(ctx); }
  return {tree, project};
}
/** Run de pruebas (qa · unreal) de una orden: un diferido o reintento de la misma orden reutiliza el suyo. */
export function checkRun(ctx: WorkerContext, command: Command, task: Task, implementer: Run, role = 'qa'): Run {
  const row = ctx.db.prepare(`select id from runs where json_extract(metadata,'$.commandId')=? order by rowid desc limit 1`).get(command.id);
  const last = row ? read<Run>(ctx.db, 'runs', row.id as string) : undefined;
  if (last?.state === 'running') return last;
  return startRun(ctx.db, {taskId: task.id, role, provider: 'unreal', attempt: (last?.attempt ?? 0) + 1,
    metadata: {commandId: command.id, implementerRunId: implementer.id}});
}
/** Pasa a integrando si la tarea está en probando y la puerta de pruebas lo permite. */
export function advance(ctx: WorkerContext, taskId: string): boolean {
  const task = requireTask(ctx.db, taskId);
  if (task.state !== 'probando' || task.decisionId || !checkGate(ctx.db, taskId).ok) return false;
  moveTask(ctx.db, taskId, 'integrando', 'Pruebas en verde');
  // jam 2026-11-10: sin esperar al barrido de atascos (10 min) ni a la Decisión automática
  if (task.reviewApproved === 1) integrateIfFree(ctx.db, taskId);
  return true;
}
const commandDecision = (ctx: WorkerContext, task: Task, command: Command): Decision | undefined =>
  listDecisions(ctx.db).filter(d => d.taskId === task.id && d.evidence.some(e => e.kind === 'command' && e.ref === command.id)).at(-1);

function failureOf(ctx: WorkerContext, row: TestRun): {summary: string; blocking?: string[]} {
  const event = ctx.db.prepare(`select payload from events where type='test.failed' and json_extract(payload,'$.testRunId')=?`).get(row.id);
  return event ? JSON.parse(event.payload as string) : {summary: ''};
}
export function sendCorrection(ctx: WorkerContext, task: Task, implementer: Run, row: TestRun, lines: string[], key: string): void {
  const text = `La comprobación ${row.checkId} falló. Log completo: ${row.reportPath}\n${lines.slice(0, 30).join('\n')}`;
  enqueue(ctx.db, 'worker.send', {runId: implementer.id, text}, `checks.correction:${key}`);
  if (['probando', 'revisando'].includes(requireTask(ctx.db, task.id).state)) moveTask(ctx.db, task.id, 'implementando', `Falló ${row.checkId}`);
}

export function createChecksRun(deps: CheckDeps = {}): Handler {
  return async (command, ctx) => {
    const payload = command.payload as {taskId?: unknown; runId?: unknown; files?: unknown; dir?: unknown};
    if (typeof payload.taskId !== 'string') throw new Error('invalid_command_payload');
    const task = requireTask(ctx.db, payload.taskId), implementer = implementerOf(ctx, task, payload.runId);
    const {tree, project} = treeOf(ctx, implementer);
    // hito 6: el integrador recomprueba sobre su workspace (`dir`), no sobre el worktree del responsable
    const dir = typeof payload.dir === 'string' ? payload.dir : undefined;
    const target = dir ? targetProject(ctx, dir) : project;
    const decision = commandDecision(ctx, task, command);
    // caducada (otro run escribió en la tarea): se regenera y se sigue esperando; solo «Reintentar» relanza el lote
    if (decision?.state === 'stale') refreshPendingDecision(ctx.db, task.id);
    if (decision?.state === 'open' || decision?.state === 'stale') return {deferred: true, reason: `Esperando decisión: ${decision.reason}`};
    if (decision?.state === 'resolved' && decision.chosenOptionId === waiverOption.id) return {passed: true, advanced: advance(ctx, task.id)};
    if (decision?.state === 'resolved' && decision.chosenOptionId === returnOption.id) {
      const failed = filtered<TestRun>(ctx.db, 'test_runs', {taskId: task.id, result: 'failed'}).at(-1)!;
      sendCorrection(ctx, task, implementer, failed, failureOf(ctx, failed).summary.split('\n'), command.id);
      return {passed: false, returned: true};
    }
    const files = Array.isArray(payload.files) ? payload.files.filter((f): f is string => typeof f === 'string')
      // Herbalist H2.2: contra la rama objetivo (merge-base), no contra el fork: lo fusionado desde main no es de la tarea
      : tree ? await ctx.git.changedFiles!(tree.path, await targetBranch(ctx).catch(() => tree.baseCommit)) : [];
    // recomprobar al integrar no vuelve a empaquetar: build ya pasó en la rama y cuesta minutos y RAM (metras 2026-11-08: 12 min)
    const worktree = dir ?? tree?.path ?? project.dir, selected = selectChecks(files, task.scope).filter(id => !(payload.recheck === true && id === 'build'));
    // los archivos borrados cuentan para elegir comprobaciones, no para validar ni compilar assets que ya no existen
    const present = files.filter(file => existsSync(join(worktree, file)));
    // Esquina J1.2: montajes sin personaje montado ni malla en el diff; animation no tiene qué reproducir, no aplica
    // acabado (2026-11-10): lo primero, sin Unreal y en segundos; también en modo rápido, que solo se salta recomprobar al integrar
    const ids: CheckId[] = [...(touchesVisible(present) && deps.acabado !== false && acabadoOn(ctx) ? ['acabado' as const] : []),
      ...selected.filter(id => id !== 'animation' || characterOf(worktree, present))];
    const note = ids.filter(id => id !== 'acabado').length < selected.length ? 'animation no aplica: no hay personaje montado ni malla con clips en el diff' : null;
    let commit: string | null;
    try { commit = await ctx.git.head(worktree); } catch { commit = null; }
    const run = updateRun(ctx.db, checkRun(ctx, command, task, implementer).id, {checks: ids, checksCommit: commit});
    if (!ids.length) {
      const row = recordTestRun(ctx.db, {taskId: task.id, runId: run.id, checkId: 'none', result: 'skipped', commit});
      appendEvent(ctx.db, 'test.skipped', null, {testRunId: row.id, taskId: task.id, runId: run.id, check: 'none', summary: note ?? 'el diff no toca Unreal'});
      finishRun(ctx.db, run.id, 'done', note ? `Sin comprobaciones: ${note}` : 'El diff no toca Unreal');
      return {testRunIds: [row.id], passed: true, advanced: advance(ctx, task.id)};
    }
    // tras un reinicio, la fila que se estaba ejecutando vuelve a la cola del lote
    for (const row of filtered<TestRun>(ctx.db, 'test_runs', {runId: run.id, result: 'running'})) updateTestRun(ctx.db, row.id, {result: 'pending'});
    let rows = filtered<TestRun>(ctx.db, 'test_runs', {runId: run.id});
    if (!rows.length) rows = ids.map(id => recordTestRun(ctx.db, {taskId: task.id, runId: run.id, checkId: id, result: 'pending', commit}));
    const input = {task, run, implementer, project: target, files: present, worktree, acceptNewBase: (payload as {acceptNewBase?: unknown}).acceptNewBase === true};
    // hito 5b: el editor y el empaquetado escriben en el árbol (mapa de prueba, clips retargeteados, Build/); lo que el lote
    // cambió se deshace al terminar, para que no entre en la revisión ni frene el cierre. Nunca en el checkout del usuario
    const own = worktree !== ctx.projectDir, before = own ? new Set((await ctx.git.status(worktree)).files) : new Set<string>();
    const outcome = await withEditor(ctx, target, run, async () => {
      try {
        for (const row of rows) {
          const execute = executors[row.checkId as CheckId];
          if (row.result !== 'pending' || !execute) continue;
          if ((await runCheck(row.checkId as CheckId, execute, ctx, input, deps, row)).result === 'failed') break;
        }
      } finally { if (own) await ctx.git.discard(worktree, (await ctx.git.status(worktree)).files.filter(f => !before.has(f))); }
    });
    if (outcome && typeof outcome === 'object' && 'deferred' in outcome) return outcome;
    rows = filtered<TestRun>(ctx.db, 'test_runs', {runId: run.id});
    const umg = rows.find(r => r.checkId === 'umg' && r.result === 'pending');
    if (umg && !rows.some(r => r.result === 'failed')) umgStep(ctx, task, implementer, umg, commit);
    rows = filtered<TestRun>(ctx.db, 'test_runs', {runId: run.id});
    const failed = rows.find(r => r.result === 'failed'), missing = rows.filter(r => ['skipped', 'unavailable'].includes(r.result));
    finishRun(ctx.db, run.id, failed ? 'failed' : 'done', failed ? `Falló ${failed.checkId}` : `Comprobaciones terminadas${note ? ` · ${note}` : ''}`);
    const result = {testRunIds: rows.map(r => r.id), passed: !failed && !missing.length && rows.every(r => r.result === 'passed')};
    if (failed) {
      const detail = failureOf(ctx, failed);
      if (detail.blocking?.length) {
        openDecision(ctx.db, {taskId: task.id, reason: `Assets rotos o sin guardar antes de jugar el mapa (${detail.blocking.length})`,
          evidence: [{kind: 'command', ref: command.id}, ...detail.blocking.slice(0, 50).map(ref => ({kind: 'asset', ref}))],
          options: [retryOption, returnOption]});
        return {...result, deferred: true, reason: 'Esperando decisión: assets rotos'};
      }
      sendCorrection(ctx, task, implementer, failed, detail.summary.split('\n'), run.id);
      return result;
    }
    if (missing.length) {
      openDecision(ctx.db, {taskId: task.id, reason: `Comprobación no disponible: ${missing.map(r => r.checkId).join(', ')}`,
        evidence: [{kind: 'command', ref: command.id}, {kind: 'gate:checks', ref: JSON.stringify(missing.map(r => r.id))}],
        options: [waiverOption, retryOption]});
      return {...result, deferred: true, reason: 'Esperando decisión: comprobación no disponible'};
    }
    return {...result, advanced: advance(ctx, task.id)};
  };
}

/** UMG: vale un ciclo UMG aprobado sobre el mismo commit; si no lo hay, se encola `ui.cycle` y la fila queda pendiente. */
function umgStep(ctx: WorkerContext, task: Task, implementer: Run, row: TestRun, commit: string | null): void {
  const cycles = filtered<TestRun>(ctx.db, 'test_runs', {taskId: task.id, checkId: 'umg'}).filter(r => r.id !== row.id && r.commit === commit);
  const approved = cycles.filter(r => r.result === 'passed').at(-1);
  if (approved) { updateTestRun(ctx.db, row.id, {result: 'passed', reportPath: approved.reportPath, config: approved.config}); return; }
  if (cycles.some(r => r.result === 'running' || r.result === 'pending')) return; // el ciclo de este commit aún espera al QA
  // clave por commit y lanzamiento: la del NOMOS_DONE puede existir ya, terminada
  const n = ctx.db.prepare("select count(*) n from commands where type='ui.cycle' and json_extract(payload,'$.taskId')=?").get(task.id)!.n;
  enqueue(ctx.db, 'ui.cycle', {taskId: task.id, runId: implementer.id}, `ui.cycle:${task.id}:${commit ?? 'sin-commit'}:${n}`);
}

export function createCheckHandlers(deps: CheckDeps = {}): Record<string, Handler> {
  return {'checks.run': createChecksRun(deps), 'ui.cycle': createUiCycle(deps), ...createEditorMcpHandlers()};
}
