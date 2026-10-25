import type { WorkerContext } from '../runner.ts';
import type { Run } from '../model.ts';
import type { Project } from '../handlers/asset-run.ts';
import { acquire, release } from '../leases.ts';
import { read } from '../repo/rows.ts';
import { setTaskWait } from '../repo/tasks.ts';
import { appendEvent } from '../store.ts';
import { machineReason } from '../unreal-turn.ts';
import { probeMachine } from '../machine.ts';
import { readConfig } from '../config.ts';

export type Deferred = {deferred: true; reason: string};
export const editorLease = (project: Pick<Project, 'name'>) => `editor/${project.name}`;
export const agentLabel = (run: Pick<Run, 'role' | 'provider'> | undefined) => run ? `${run.role} · ${run.provider}` : 'otro agente';

/** Un solo editor por proyecto: reserva `editor/<proyecto>`, ejecuta y libera siempre; ocupado → diferido con motivo. */
export async function withEditor<T>(ctx: Pick<WorkerContext, 'db'> & Partial<Pick<WorkerContext, 'dataDir' | 'probe'>>, project: Project, run: Run,
  fn: () => Promise<T>): Promise<T | Deferred> {
  const {db} = ctx;
  // hito 22: abrir Unreal pide RAM libre y ningún editor ajeno, aunque la reserva esté libre
  const machine = ctx.dataDir ? machineReason(db, readConfig(ctx.dataDir), ctx.probe ?? probeMachine, run.taskId) : null;
  if (machine) { setTaskWait(db, run.taskId, machine); return {deferred: true, reason: machine}; }
  const lease = acquire(db, run.id, run.taskId, [editorLease(project)]);
  if (!lease.ok) {
    const holder = read<Run>(db, 'runs', lease.conflicts[0].runId);
    const reason = `Editor de ${project.name}: ocupado por ${agentLabel(holder)}`;
    setTaskWait(db, run.taskId, reason);
    return {deferred: true, reason};
  }
  setTaskWait(db, run.taskId, null);
  appendEvent(db, 'editor.busy', null, {project: project.name, runId: run.id, taskId: run.taskId, agent: agentLabel(run)});
  try { return await fn(); } finally {
    release(db, run.id);
    appendEvent(db, 'editor.free', null, {project: project.name, runId: run.id, taskId: run.taskId});
  }
}
