import { existsSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import type { Handler, WorkerContext } from '../runner.ts';
import type { Command, Decision, Run, Task, Worktree } from '../model.ts';
import { filtered, read, transaction } from '../repo/rows.ts';
import { blockTask, moveTask, requireTask, setTaskWait } from '../repo/tasks.ts';
import { finishRun } from '../repo/runs.ts';
import { updateRun } from '../repo/worker.ts';
import { listDecisions, openDecision } from '../repo/decisions.ts';
import { enqueue, resumePolicyCommand } from '../commands.ts';
import { release } from '../leases.ts';
import { appendEvent } from '../store.ts';
import { orcaDown, orcaRetryMs } from './orca-down.ts';
import { orcaDownReason } from '../failure-kind.ts';

/** Hito 13: la Decisión que abre `worker.start` ante un worker anterior; las tres opciones hacen algo. */
export const reconcileOptions = [
  {id: 'retry', label: 'Reconciliar y reintentar', description: 'Cerrar el worker anterior, retirar su worktree y volver a arrancar'},
  {id: 'leave', label: 'Reconciliar y dejar preparada', description: 'Cerrar el worker anterior y retirar su worktree; el planificador la arranca cuando haya hueco'},
  {id: 'cancel', label: 'Cancelar la tarea', description: 'Cerrar el worker anterior, retirar su worktree y dejar la tarea bloqueada'},
];
const treeOptions = [
  {id: 'discard', label: 'Descartar', description: 'Borrar los cambios sin registrar y retirar el worktree (queda registrado quién lo eligió)'},
  {id: 'commit', label: 'Commitear al run', description: 'Nomos commitea los cambios en la rama del run y después retira el worktree'},
  {id: 'wait', label: 'Esperar', description: 'No tocar nada; reconcilia más tarde con nomos task reconcile'},
];
export const reconcileStates = ['pendiente', 'preparada', 'implementando'];
const busy = (error: unknown) => /EBUSY|EPERM|busy|in use|being used|locked/i.test(error instanceof Error ? error.message : String(error));

/** Run ya reconciliada (o que nunca tuvo nada que reconciliar): no frena un arranque nuevo. */
export const settled = (r: Run) => r.state !== 'running' && r.metadata.uncertain === false
  && (!!r.metadata.discarded || r.summary === 'lease_conflict' && !r.metadata.worktreeId);
export const unsettled = (db: DatabaseSync, taskId: string) =>
  filtered<Run>(db, 'runs', {taskId}).filter(r => r.provider !== 'unreal' && r.provider !== 'nomos' && !settled(r));

/** `worker.start` encuentra un worker anterior: encola la reconciliación y la deja esperando la Decisión. */
export function askReconcile(db: DatabaseSync, task: Task, startCommandId: string) {
  const command = enqueue(db, 'task.reconcile', {taskId: task.id, startCommandId}, `task.reconcile:start:${startCommandId}`);
  const decision = openDecision(db, {taskId: task.id, reason: 'Reconciliar worker existente antes de continuar', options: reconcileOptions,
    evidence: [{kind: 'command', ref: command.id}, {kind: 'reconcile', ref: 'entry'}, {kind: 'context', ref: task.worktreeId ?? 'sin worktree'}]});
  return {policyBlocked: true, decisionId: decision.id};
}

/**
 * Cierra los terminales de los workers anteriores (esperando a que mueran), comprueba que sus árboles no tengan cambios sin
 * registrar, retira los worktrees y devuelve la tarea a `preparada`. Diferible: lo llaman `task.reconcile` y `worker.stop`.
 */
export async function reconcileTask(ctx: WorkerContext, command: Command, taskId: string, delayMs = 30_000): Promise<object> {
  try { return await reconcile(ctx, command, taskId, delayMs); }
  catch (error) { if (orcaDown(error)) return {deferred: true, reason: orcaDownReason, delayMs: orcaRetryMs}; throw error; }
}
async function reconcile(ctx: WorkerContext, command: Command, taskId: string, delayMs: number): Promise<object> {
  const {db, orca, git} = ctx;
  const decisions = listDecisions(db).filter(d => d.taskId === taskId && d.evidence.some(e => e.kind === 'command' && e.ref === command.id));
  const open = decisions.find(d => d.state === 'open');
  if (open) return {deferred: true, reason: `Esperando decisión: ${open.reason}`};
  const chosen = (kind: string): Decision | undefined =>
    decisions.filter(d => d.state === 'resolved' && d.evidence.some(e => e.kind === 'reconcile' && e.ref === kind)).at(-1);
  const entry = chosen('entry'), tree = chosen('worktree')?.chosenOptionId;
  if (tree === 'wait') { setTaskWait(db, taskId, 'Reconciliación en espera: cambios sin registrar'); return {reconciled: false}; }
  const runs = unsettled(db, taskId);
  for (const run of runs.filter(r => r.sessionRef)) {
    // cerrar el terminal mata el árbol del shell; uno ya cerrado da error y basta con que no siga vivo
    try { await orca.terminalClose(run.sessionRef!); } catch { /* ya cerrado */ }
    if (!await orca.terminalAlive(run.sessionRef!)) continue;
    const attempts = (run.metadata.closeAttempts ?? 0) + 1;
    updateRun(db, run.id, {closeAttempts: attempts});
    if (attempts < 5) {
      setTaskWait(db, taskId, 'El worker sigue vivo: esperando a que su terminal cierre');
      return {deferred: true, reason: 'El worker sigue vivo', delayMs};
    }
    const reason = 'No se pudo cerrar el terminal del worker: ciérralo en Orca y ejecuta nomos task reconcile';
    setTaskWait(db, taskId, reason); return {reconciled: false, reason};
  }
  const task = requireTask(db, taskId);
  const ids = new Set([task.worktreeId, ...runs.map(r => r.metadata.worktreeId)].filter((id): id is string => !!id));
  // un árbol sin fila (anterior al registro de worktrees) se reconoce por el id de Orca: `repo::ruta`
  const trees = [...ids].map(id => read<Worktree>(db, 'worktrees', id) ?? {id, path: id.split('::')[1] ?? '', state: 'active'} as Worktree)
    .filter(t => t.state !== 'closed');
  const live = trees.filter(t => t.path && existsSync(t.path));
  if (tree !== 'discard') {
    const dirty: {path: string; files: string[]}[] = [];
    for (const t of live) if (await git.isRepo(t.path)) { const s = await git.status(t.path); if (!s.clean) dirty.push({path: t.path, files: s.files}); }
    if (dirty.length && tree === 'commit') for (const d of dirty) await git.commitAll(d.path, 'Cambios sin registrar del worker reconciliado (Nomos)');
    else if (dirty.length) {
      const files = dirty.flatMap(d => d.files);
      const reason = `Cambios sin registrar: ${files.slice(0, 5).join(', ')}${files.length > 5 ? '…' : ''}`;
      setTaskWait(db, taskId, reason);
      openDecision(db, {taskId, reason, options: treeOptions, evidence: [{kind: 'command', ref: command.id},
        {kind: 'reconcile', ref: 'worktree'}, ...files.slice(0, 50).map(ref => ({kind: 'file', ref}))]});
      return {deferred: true, reason: 'Esperando decisión: cambios sin registrar'};
    }
  }
  for (const t of trees) {
    try { await orca.worktreeRemove(t.id, tree === 'discard'); }
    catch (error) {
      if (!t.path || !existsSync(t.path)) continue; // Orca ya no lo conoce y no queda carpeta
      if (!busy(error) || !runs.length) throw error;
      const attempts = (runs[0].metadata.removeAttempts ?? 0) + 1;
      updateRun(db, runs[0].id, {removeAttempts: attempts});
      if (attempts < 5) { setTaskWait(db, taskId, 'Archivos en uso'); return {deferred: true, reason: 'Archivos en uso', delayMs}; }
      throw new Error('Archivos en uso: cierra lo que los tenga abiertos y ejecuta nomos task reconcile');
    }
  }
  const by = chosen('worktree')?.resolvedBy;
  transaction(db, () => {
    const now = new Date().toISOString();
    for (const run of runs) {
      if (run.state === 'running') finishRun(db, run.id, 'cancelled', 'Worker cerrado al reconciliar');
      updateRun(db, run.id, {uncertain: false, discarded: true, waiting: false, phase: 'finished', pollGeneration: (run.metadata.pollGeneration ?? 0) + 1});
      release(db, run.id);
    }
    for (const t of trees) db.prepare("update worktrees set state='closed',closed_reason=?,updated_at=? where id=?")
      .run(tree === 'discard' ? `Descartado por ${by}` : 'Reconciliada', now, t.id);
    db.prepare('update tasks set worktree_id=null,updated_at=? where id=?').run(now, taskId);
    // el bloqueo que dejó el fallo de una run de la tarea (arranque o sondeo) ya está atendido; el de una Decisión, no
    const failures = filtered<Run>(db, 'runs', {taskId}).filter(r => r.state === 'failed').map(r => r.summary).filter((s): s is string => !!s);
    db.prepare(`update tasks set blocked_reason=null where id=? and decision_id is null and blocked_reason in (${failures.map(() => '?').join(',') || "''"})`)
      .run(taskId, ...failures);
    if (requireTask(db, taskId).state === 'implementando') moveTask(db, taskId, 'preparada', 'Worker reconciliado');
    closeReconcileDecisions(db, taskId);
    setTaskWait(db, taskId, null);
    appendEvent(db, 'task.reconciled', null, {taskId, runIds: runs.map(r => r.id), worktreeIds: trees.map(t => t.id)});
    if (entry?.chosenOptionId === 'cancel') blockTask(db, taskId, 'Tarea cancelada por el director');
  });
  const start = (command.payload as {startCommandId?: string}).startCommandId;
  if (entry?.chosenOptionId === 'retry' && start) resumePolicyCommand(db, start, entry.id);
  return {reconciled: true, runIds: runs.map(r => r.id), worktreeIds: trees.map(t => t.id)};
}

/** La Decisión «Reconciliar worker existente» que quedara abierta (también la de antes del hito 13) ya está atendida. */
function closeReconcileDecisions(db: DatabaseSync, taskId: string) {
  const now = new Date().toISOString();
  for (const d of listDecisions(db, 'open').filter(d => d.taskId === taskId && d.evidence.some(e => e.kind === 'gate:reconcile' || e.kind === 'reconcile'))) {
    db.prepare("update decisions set state='resolved',chosen_option_id=?,resolved_by='nomos',resolved_at=?,updated_at=? where id=?")
      .run(d.options.some(o => o.id === 'leave') ? 'leave' : d.options[0].id, now, now, d.id);
    db.prepare('update tasks set decision_id=null,blocked_reason=case when blocked_reason=? then null else blocked_reason end where id=? and decision_id=?')
      .run(d.reason, taskId, d.id);
    appendEvent(db, 'decision.resolved', null, {taskId, decisionId: d.id, optionId: 'leave', by: 'nomos'});
  }
}

export const taskReconcile: Handler = (command, ctx) => {
  const taskId = (command.payload as {taskId?: unknown}).taskId;
  if (typeof taskId !== 'string') throw new Error('invalid_command_payload');
  if (!reconcileStates.includes(requireTask(ctx.db, taskId).state)) throw new Error('invalid_transition');
  return reconcileTask(ctx, command, taskId);
};
