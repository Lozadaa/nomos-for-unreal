import type { DatabaseSync } from 'node:sqlite';
import type { TaskState, TestRun } from './model.ts';
import { fail } from './commands.ts';
import { appendEvent } from './store.ts';
import { filtered, transaction } from './repo/rows.ts';
import { finishRun } from './repo/runs.ts';
import { updateTestRun } from './repo/artifacts.ts';
import { getTask, moveTask, setTaskWait } from './repo/tasks.ts';
import { release } from './leases.ts';
import { workerFailure } from './handlers/worker-failure.ts';

/** Sin latido durante más de esto, el dueño del comando se da por muerto. */
export const staleHeartbeatMs = 60_000;
const resumable = ['worker.poll', 'review.poll', 'worker.stop'];
// estado al que vuelve la tarea cuando el resultado de su orden larga queda incierto
const home: Record<string, TaskState> = {'checks.run': 'probando', 'ui.cycle': 'probando', 'integrate.run': 'integrando', 'integrate.lfs': 'integrando', 'finalize.run': 'cerrando'};
export const uncertainCause = 'orca: resultado incierto tras reinicio';

/** Runs propios de la orden (pruebas, integración): terminan como fallidos, sueltan reservas y sus pruebas en curso fallan. */
function closeRuns(db: DatabaseSync, commandId: string, cause: string): void {
  const runs = db.prepare(`select id from runs where state='running' and provider in ('unreal','kratos')
    and json_extract(metadata,'$.commandId')=?`).all(commandId).map(r => r.id as string);
  for (const id of runs) {
    for (const row of filtered<TestRun>(db, 'test_runs', {runId: id, result: 'running'})) updateTestRun(db, row.id, {result: 'failed'});
    finishRun(db, id, 'failed', cause);
    release(db, id);
  }
}

/** El dueño `runner:<pid>:<nonce>` sigue vivo si su proceso existe; cualquier otro formato se da por muerto. */
function ownerAlive(owner: unknown): boolean {
  const pid = Number(/^runner:(\d+):/.exec(String(owner))?.[1]);
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

/**
 * Comandos `running` sin dueño vivo: los de un proceso que ya no existe, o los de otro dueño cuyo latido tiene más de 60 s.
 * Sondeos y paradas vuelven a la cola una sola vez; el resto falla con «resultado incierto» y la tarea
 * vuelve a su estado con motivo, sin repetir efectos (nunca un worktree duplicado).
 */
export function recoverCommands(db: DatabaseSync, opts: {owner?: string; now?: Date; staleMs?: number} = {}): void {
  const now = opts.now ?? new Date(), limit = new Date(now.getTime() - (opts.staleMs ?? staleHeartbeatMs)).toISOString();
  transaction(db, () => {
    const rows = db.prepare(`select id,type,payload,claimed_by,heartbeat_at from commands where state='running'
      and (claimed_by is null or claimed_by is not ?)`).all(opts.owner ?? null)
      .filter(row => !ownerAlive(row.claimed_by) || row.heartbeat_at === null || (row.heartbeat_at as string) < limit);
    for (const row of rows) {
      const id = row.id as string, type = row.type as string, payload = JSON.parse(row.payload as string);
      const again = !!db.prepare(`select 1 from events where type='command.recovered' and json_extract(payload,'$.commandId')=?`).get(id);
      if (resumable.includes(type) && !again) {
        db.prepare("update commands set state='pending',claimed_by=null,started_at=null,heartbeat_at=null,updated_at=? where id=?")
          .run(now.toISOString(), id);
        appendEvent(db, 'command.recovered', null, {commandId: id, type, state: 'pending'});
        continue;
      }
      const cause = again ? 'orca: sin latido tras dos reinicios' : uncertainCause;
      fail(db, id, cause, {retry: false});
      if (['worker.start', 'worker.send', 'worker.poll', 'review.poll'].includes(type)) workerFailure(db, payload, cause);
      if (type === 'review.start') workerFailure(db, {...payload, role: 'revisor', startCommandId: id}, cause);
      closeRuns(db, id, cause);
      const task = typeof payload.taskId === 'string' ? getTask(db, payload.taskId) : undefined;
      const state = type === 'checks.run' && typeof payload.dir === 'string' ? 'integrando' : home[type];
      if (task && state && task.state !== 'done') {
        const reason = 'Resultado incierto tras reinicio: vuelve a lanzarlo';
        moveTask(db, task.id, state, reason);
        setTaskWait(db, task.id, reason);
      }
    }
  });
}
