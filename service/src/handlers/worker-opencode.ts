import type { WorkerContext } from '../runner.ts';
import type { Run } from '../model.ts';
import { transaction } from '../repo/rows.ts';
import { finishRun } from '../repo/runs.ts';
import { moveTask } from '../repo/tasks.ts';
import { updateRun } from '../repo/worker.ts';
import { release } from '../leases.ts';
import { appendEvent } from '../store.ts';

/**
 * Hito 12: OpenCode salió sin tocar nada (sin PATH o credencial rechazada). Se descarta su árbol y la tarea vuelve a
 * `preparada` asignada a Claude, sin Decisión de reconciliar. Si el árbol no se puede quitar, falla como cualquier worker.
 */
export async function discardOpencode(ctx: WorkerContext, run: Run, reason: string): Promise<void> {
  const {db, orca} = ctx;
  try { await orca.terminalClose(run.sessionRef!); } catch { /* ya cerrado */ }
  try { await orca.worktreeRemove(run.metadata.worktreeId!, true); } catch { throw new Error(`orca: ${reason}`); }
  transaction(db, () => {
    finishRun(db, run.id, 'failed', reason);
    updateRun(db, run.id, {waiting: false, phase: 'finished', uncertain: false, discarded: true,
      pollGeneration: (run.metadata.pollGeneration ?? 0) + 1});
    release(db, run.id);
    const now = new Date().toISOString();
    db.prepare("update worktrees set state='closed',closed_reason=?,updated_at=? where id=?").run(reason, now, run.metadata.worktreeId);
    db.prepare("update tasks set worktree_id=null,assignee_provider='claude',blocked_reason=null,wait_reason=?,updated_at=? where id=?")
      .run(reason, now, run.taskId);
    moveTask(db, run.taskId, 'preparada', reason);
    appendEvent(db, 'worker.failed', null, {runId: run.id, taskId: run.taskId, provider: 'opencode', reason, reassignedTo: 'claude'});
  });
}
