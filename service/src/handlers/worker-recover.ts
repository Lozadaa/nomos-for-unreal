import type { Handler, WorkerContext } from '../runner.ts';
import type { Run } from '../model.ts';
import type { WorkerProvider } from '../config.ts';
import { readConfig, maxWorkerMinutes } from '../config.ts';
import { filtered, transaction } from '../repo/rows.ts';
import { finishRun, startRun } from '../repo/runs.ts';
import { requireRun, runTree, updateRun, queuePoll } from '../repo/worker.ts';
import { getTask, requireTask, setTaskWait } from '../repo/tasks.ts';
import { enqueue } from '../commands.ts';
import { acquire } from '../leases.ts';
import { appendEvent } from '../store.ts';
import { schedulingBlocked } from '../scheduler-admission.ts';
import { isHeavy, machineReason } from '../unreal-turn.ts';
import { probeMachine } from '../machine.ts';
import { briefLine, launchCommand } from './worker-launch.ts';
import { continuationBrief } from './worker-relay.ts';

export const staleCause = 'terminal_handle_stale';
const workers = ['claude', 'codex', 'opencode'];

/**
 * Hito 22: al arrancar el servicio (tras un reinicio del PC), las runs en marcha cuyo terminal ya no existe en Orca
 * pasan a `failed` con `terminal_handle_stale`; si la tarea sigue en `implementando`, se encola su relanzamiento.
 * Orca sin responder lanza y no toca nada: el runner lo reintenta en la siguiente pasada.
 */
export async function recoverDeadRuns(ctx: WorkerContext): Promise<number> {
  const {db, orca} = ctx;
  let dead = 0;
  for (const run of filtered<Run>(db, 'runs').filter(r => r.state === 'running' && r.sessionRef && workers.includes(r.provider))) {
    if (await orca.terminalAlive(run.sessionRef!)) continue;
    transaction(db, () => {
      finishRun(db, run.id, 'failed', staleCause);
      updateRun(db, run.id, {phase: 'finished', waiting: false, terminalClosed: true, pollGeneration: (run.metadata.pollGeneration ?? 0) + 1});
      if (run.role !== 'revisor' && run.metadata.worktreeId && getTask(db, run.taskId)?.state === 'implementando')
        enqueue(db, 'worker.recover', {taskId: run.taskId, runId: run.id}, `worker.recover:${run.id}`);
    });
    dead++;
  }
  return dead;
}

/** Relanza en el mismo worktree con nota de continuación, como el relevo del hito 19; respeta cupos, reservas y la RAM. */
export const workerRecover: Handler = async (cmd, ctx) => {
  const {db, orca, git} = ctx, old = requireRun(db, (cmd.payload as {runId: string}).runId), task = requireTask(db, old.taskId);
  if (task.state !== 'implementando' || filtered<Run>(db, 'runs', {taskId: task.id}).some(r => r.state === 'running')) return {skipped: true};
  const waiting = schedulingBlocked(ctx, task, old.provider as WorkerProvider, cmd.id)
    ?? (isHeavy(task) ? machineReason(db, readConfig(ctx.dataDir), ctx.probe ?? probeMachine, task.id, {slots: true}) : null);
  if (waiting) { setTaskWait(db, task.id, waiting); return {deferred: true, reason: waiting}; }
  const tree = runTree(db, old), head = await git.head(tree.path);
  const subject = (await git.log(tree.path, tree.baseCommit).catch(() => [])).find(c => c.sha === head)?.subject ?? '';
  continuationBrief(tree.path, old, head, subject, '## Continuación tras un reinicio',
    'El PC se reinició mientras otro worker hacía esta tarea en este mismo árbol; su terminal ya no existe.');
  const model = old.metadata.model, title = `nomos-${task.id.slice(0, 8)}`, command = launchCommand(old.provider, model, title);
  if (!orca.terminalCreate) throw new Error('orca: no puede abrir un terminal nuevo para continuar');
  const handle = await orca.terminalCreate(tree.path, title, old.provider === 'opencode' ? command : `${command} "${briefLine}"`);
  const fresh = transaction(db, () => {
    const max = maxWorkerMinutes(readConfig(ctx.dataDir));
    const next = startRun(db, {taskId: task.id, role: old.role, provider: old.provider, sessionRef: handle, attempt: old.attempt, skills: old.skills,
      model: old.model, metadata: {worktreeId: tree.id, recoveredFrom: old.id, phase: 'running', pollGeneration: 0,
        correctionCount: old.metadata.correctionCount ?? 0, deadlineAt: new Date(Date.now() + max * 60_000).toISOString(), ...(model ? {model} : {})}});
    acquire(db, next.id, task.id, task.leases);
    setTaskWait(db, task.id, null);
    appendEvent(db, 'run.recovered', null, {taskId: task.id, oldRun: old.id, newRun: next.id});
    queuePoll(db, next);
    return next;
  });
  return {runId: fresh.id};
};
