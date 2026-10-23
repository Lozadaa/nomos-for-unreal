import type { DatabaseSync } from 'node:sqlite';
import type { Run } from '../model.ts';
import { appendEvent } from '../store.ts';
import { insert, read, transaction, type Input } from './rows.ts';
import { requireTask } from './tasks.ts';
import { release } from '../leases.ts';
export function startRun(db: DatabaseSync, input: Input<Run> & Pick<Run, 'taskId' | 'role' | 'provider'>): Run {
    return transaction(db, () => {
        requireTask(db, input.taskId);
        const run = insert<Run>(db, 'runs', { model: null, sessionRef: null, attempt: 1, state: 'running', startedAt: new Date().toISOString(), finishedAt: null, summary: null, skills: [], metadata: {}, ...input });
        appendEvent(db, 'run.started', null, { taskId: run.taskId, runId: run.id, provider: run.provider });
        return run;
    });
}
export function finishRun(db: DatabaseSync, id: string, state: Exclude<Run['state'], 'running'>, summary: string): Run {
    return transaction(db, () => {
        const run = read<Run>(db, 'runs', id);
        if (!run)
            throw new Error('unknown_run');
        if (run.state !== 'running' || !['done', 'failed', 'cancelled'].includes(state))
            throw new Error('invalid_transition');
        const now = new Date().toISOString();
        db.prepare('update runs set state=?,summary=?,finished_at=?,updated_at=? where id=?').run(state, summary, now, now, id);
        release(db,id);
        appendEvent(db, 'run.finished', null, { taskId: run.taskId, runId: id, provider: run.provider, state, summary });
        return read<Run>(db, 'runs', id)!;
    });
}
