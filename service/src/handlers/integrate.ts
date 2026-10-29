import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Handler, WorkerContext } from '../runner.ts';
import type { Command, Decision, Run, Task, Worktree } from '../model.ts';
import { read } from '../repo/rows.ts';
import { moveTask, requireTask, setTaskWait } from '../repo/tasks.ts';
import { finishRun } from '../repo/runs.ts';
import { updateRun } from '../repo/worker.ts';
import { addArtifact } from '../repo/artifacts.ts';
import { listDecisions, openDecision } from '../repo/decisions.ts';
import { acquire, leaseWaitReason, release } from '../leases.ts';
import { enqueue } from '../commands.ts';
import { appendEvent } from '../store.ts';
import { checkGate } from '../checks/gate.ts';
import { attribute, attributionText } from '../attribution.ts';
import { integrationWorkspace } from '../integration/workspace.ts';
import { isLfsDecision, lfsGate, onlyAttributes } from '../integration/lfs.ts';
import { commandRun } from './asset-run.ts';
import { implementerOf } from './checks.ts';
import { queueGraph } from '../graph.ts';

const resolveOption = {id: 'resolve', label: 'Resolver en el worktree', description: 'El responsable integra la rama objetivo en su rama y resuelve el conflicto'};
const discardOption = {id: 'discard', label: 'Descartar la integración', description: 'La tarea vuelve a probando sin integrar'};
const short = (sha: string | null) => sha ? sha.slice(0, 7) : 'ninguna';

/** Run integrador vivo de esta orden, si lo hay (un diferido lo reutiliza). */
function liveRun(ctx: WorkerContext, command: Command): Run | undefined {
  const row = ctx.db.prepare(`select id from runs where json_extract(metadata,'$.commandId')=? and state='running' order by rowid desc limit 1`).get(command.id);
  return row ? read<Run>(ctx.db, 'runs', row.id as string) : undefined;
}
const commandDecision = (ctx: WorkerContext, task: Task, command: Command): Decision | undefined =>
  listDecisions(ctx.db).filter(d => d.taskId === task.id && d.evidence.some(e => e.kind === 'command' && e.ref === command.id)).at(-1);

/** Quién integró antes ese archivo: la atribución de la otra tarea, si la hay. */
function touchedBy(ctx: WorkerContext, taskId: string, path: string): string | null {
  const row = ctx.db.prepare(`select json_extract(payload,'$.taskId') taskId from events where type='integration.completed'
    and json_extract(payload,'$.taskId')!=? and exists(select 1 from json_each(json_extract(payload,'$.files')) where value=?)
    order by seq desc limit 1`).get(taskId, path);
  const other = row ? read<Task>(ctx.db, 'tasks', row.taskId as string) : undefined;
  return other ? `${other.title}${attributionText(other) ? ` (${attributionText(other)})` : ''}` : null;
}

/** Conflicto: se aborta el merge sin resolver nada y se abre la Decisión con las dos versiones. */
async function conflict(ctx: WorkerContext, command: Command, task: Task, run: Run, ws: {dir: string; branch: string}, tree: Worktree) {
  const kinds = await ctx.git.conflictKinds(ws.dir);
  const texts = await Promise.all(kinds.text.map(async file => `### ${file}\n${await ctx.git.conflictText(ws.dir, file)}`));
  await ctx.git.abortMerge(ws.dir);
  // el workspace vuelve limpio: mientras se decide, otras integraciones pueden usarlo
  release(ctx.db, run.id);
  const path = `integracion-${run.id}.txt`;
  mkdirSync(join(ctx.dataDir, 'artifacts'), {recursive: true});
  const versions = Object.entries(kinds.versions).map(([file, v]) =>
    `${file}: ${ws.branch} ${short(v.ours)} · ${tree.branch} ${short(v.theirs)}${touchedBy(ctx, task.id, file) ? ` · antes: ${touchedBy(ctx, task.id, file)}` : ''}`);
  writeFileSync(join(ctx.dataDir, 'artifacts', path), [...versions, '', ...texts].join('\n') + '\n');
  const artifact = addArtifact(ctx.db, {taskId: task.id, runId: run.id, kind: 'report', path,
    provenance: {label: 'Integración · conflicto', binary: kinds.binary, text: kinds.text}});
  const binary = kinds.binary.length > 0;
  // el evento va antes que la Decisión: lo posterior con taskId la dejaría obsoleta
  appendEvent(ctx.db, 'integration.conflict', null, {taskId: task.id, runId: run.id, binary: kinds.binary, text: kinds.text});
  openDecision(ctx.db, {taskId: task.id,
    reason: `${binary ? 'Conflicto binario' : 'Conflicto'} al integrar en ${ws.branch}: ${[...kinds.binary, ...kinds.text].map(f => f.split('/').at(-1)).join(', ')}`,
    evidence: [{kind: 'command', ref: command.id}, {kind: 'artifact', ref: artifact.id}, ...versions.map(ref => ({kind: 'version', ref}))],
    options: [resolveOption, discardOption]});
  return {deferred: true, reason: `Esperando decisión: conflicto al integrar`};
}

/** Tras la Decisión: el responsable resuelve en su worktree, o la integración se descarta. */
function afterConflict(ctx: WorkerContext, task: Task, run: Run, decision: Decision) {
  if (decision.chosenOptionId === resolveOption.id) {
    const implementer = implementerOf(ctx, task);
    enqueue(ctx.db, 'worker.send', {runId: implementer.id, text: `${decision.reason}.\nIntegra la rama objetivo en tu rama, resuelve el conflicto sin perder `
      + `ninguno de los dos lados (en binarios, pregunta antes de elegir versión), commitea y termina con NOMOS_DONE.`}, `integrate.resolve:${decision.id}`);
    finishRun(ctx.db, run.id, 'cancelled', 'Conflicto devuelto al responsable');
    return {returned: true};
  }
  finishRun(ctx.db, run.id, 'cancelled', 'Integración descartada');
  moveTask(ctx.db, task.id, 'probando', 'Integración descartada');
  return {discarded: true};
}

/** Archivos sin seguir del checkout del usuario que el avance sobrescribiría (git los lista sangrados con tabulador). */
const localFiles = (error: unknown) => {
  const text = error instanceof Error ? error.message : String(error);
  return /untracked working tree files would be overwritten/.test(text) ? text.split(/\r?\n/).filter(l => l.startsWith('\t')).map(l => l.trim()) : [];
};
/** Nunca se tocan: el responsable los saca de su commit sin borrarlos y la tarea vuelve a pasar revisión y pruebas. */
function localFilesBack(ctx: WorkerContext, task: Task, run: Run, files: string[]) {
  release(ctx.db, run.id);
  const reason = `Archivos locales del usuario en el commit: ${files.join(', ')}`;
  enqueue(ctx.db, 'worker.send', {runId: implementerOf(ctx, task).id, text: `${reason}.\nEstán sin seguir a propósito en el checkout del usuario `
    + `(pueden tener secretos) y no van en tus commits. Sácalos con git rm --cached <archivo> sin borrarlos del disco, consigue lo mismo `
    + `sin ellos si hace falta, commitea y termina con NOMOS_DONE.`}, `integrate.local:${run.id}`);
  appendEvent(ctx.db, 'integration.failed', null, {taskId: task.id, runId: run.id, reason});
  finishRun(ctx.db, run.id, 'cancelled', reason);
  return {returned: true};
}

export const integrateRun: Handler = async (command, ctx) => {
  const payload = command.payload as {taskId?: unknown};
  if (typeof payload.taskId !== 'string') throw new Error('invalid_command_payload');
  let task = requireTask(ctx.db, payload.taskId);
  const tree = task.worktreeId ? read<Worktree>(ctx.db, 'worktrees', task.worktreeId) : undefined;
  if (!tree) throw new Error('invalid_integration_target');
  if (!liveRun(ctx, command) && (task.state !== 'integrando' || task.reviewApproved !== 1)) throw new Error('invalid_transition');
  let {run} = commandRun(ctx, command, {title: `Integrar ${task.title}`, provider: 'nomos', role: 'integrador', taskId: task.id});
  const decision = commandDecision(ctx, task, command);
  if (decision?.state === 'open') { release(ctx.db, run.id); return {deferred: true, reason: `Esperando decisión: ${decision.reason}`}; }
  if (decision?.state === 'resolved' && !isLfsDecision(decision)) return afterConflict(ctx, task, run, decision);
  const ws0 = await integrationWorkspace(ctx, false);
  // una integración a la vez por proyecto: la segunda espera y, al entrar, encuentra la base cambiada
  const lease = acquire(ctx.db, run.id, task.id, [`integration/${ws0.name}`]);
  if (!lease.ok) { setTaskWait(ctx.db, task.id, leaseWaitReason(lease.conflicts)); return {deferred: true, reason: leaseWaitReason(lease.conflicts)}; }
  setTaskWait(ctx.db, task.id, null);
  let state = run.metadata.integration;
  const ws = state ? ws0 : await integrationWorkspace(ctx, true);
  if (!state) {
    // hito 5b: contenido pesado sin LFS → Decisión antes de meterlo en la historia
    const gated = await lfsGate(ctx, command, task, run, ws, tree, decision);
    if (gated) return gated;
    const base = await ctx.git.head(ws.dir);
    const merged = await ctx.git.merge(ws.dir, tree.branch, {noFf: true, message: `Integrar ${task.title} (${tree.branch})`});
    if (!merged.ok) return conflict(ctx, command, task, run, ws, tree);
    state = {base, commit: merged.commit, files: await ctx.git.filesBetween(ws.dir, base, merged.commit)};
    run = updateRun(ctx.db, run.id, {integration: state});
  }
  // la rama objetivo cambió desde que nació el worktree: recomprobar el resultado integrado antes de publicarlo
  // (no si lo único nuevo es el .gitattributes de LFS)
  const moved = state.base !== tree.baseCommit && !await onlyAttributes(ctx, ws.dir, tree.baseCommit, state.base);
  if (moved && !state.checked) {
    const checks = enqueue(ctx.db, 'checks.run', {taskId: task.id, runId: implementerOf(ctx, task).id, files: state.files, dir: ws.dir},
      `integrate.checks:${run.id}:${state.commit}`);
    const current = read<Command>(ctx.db, 'commands', checks.id)!;
    if (current.state === 'pending' || current.state === 'running') return {deferred: true, reason: 'Recomprobando sobre la rama objetivo'};
    const gate = checkGate(ctx.db, task.id);
    if (current.state === 'failed' || !gate.ok) {
      await ctx.git.checkout(ws.dir, ws.branch);
      finishRun(ctx.db, run.id, 'failed', 'Falló la recomprobación sobre la rama objetivo');
      appendEvent(ctx.db, 'integration.failed', null, {taskId: task.id, runId: run.id, reason: gate.ok ? current.error : gate.reason});
      if (requireTask(ctx.db, task.id).state === 'integrando') moveTask(ctx.db, task.id, 'probando', gate.ok ? 'Falló la recomprobación' : gate.reason);
      return {integrated: false};
    }
    run = updateRun(ctx.db, run.id, {integration: {...state, checked: true}});
  }
  try { await ctx.git.advanceBranch(ctx.projectDir, ws.branch, state.commit, state.base); }
  catch (error) {
    await ctx.git.checkout(ws.dir, ws.branch);
    updateRun(ctx.db, run.id, {integration: undefined});
    // hito 7: un archivo sin seguir del usuario (p. ej. Config con secretos) no se arregla reintentando: sale del commit del responsable
    const local = localFiles(error);
    if (local.length) return localFilesBack(ctx, task, run, local);
    // la rama objetivo avanzó por fuera de Nomos (o el checkout del usuario tiene cambios): se rehace sobre la nueva punta
    const reason = `No se pudo avanzar ${ws.branch}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`;
    appendEvent(ctx.db, 'integration.retry', null, {taskId: task.id, runId: run.id, reason});
    return {deferred: true, reason};
  }
  task = requireTask(ctx.db, task.id);
  appendEvent(ctx.db, 'integration.completed', null, {taskId: task.id, runId: run.id, commit: state.commit, base: state.base,
    branch: ws.branch, sourceBranch: tree.branch, files: state.files, rechecked: moved});
  // hito 23: main cambió, el grafo del juego se pone al día (uno a la vez)
  try { queueGraph(ctx.db, ctx.dataDir, ctx.projectDir); } catch { /* sin grafo la integración sigue */ }
  attribute(ctx.db, task.id, 'integro', run);
  moveTask(ctx.db, task.id, 'cerrando', `Integrado en ${ws.branch}@${short(state.commit)}`);
  finishRun(ctx.db, run.id, 'done', `Integrado en ${ws.branch}@${short(state.commit)}`);
  return {integrated: true, commit: state.commit};
};
