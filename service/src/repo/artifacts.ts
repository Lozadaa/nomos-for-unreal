import type { DatabaseSync } from 'node:sqlite';
import type { Artifact, TestRun } from '../model.ts';
import { appendEvent } from '../store.ts';
import { insert, filtered, read, transaction, type Input } from './rows.ts';
import { requireTask } from './tasks.ts';
export function addArtifact(db: DatabaseSync, input: Input<Artifact> & Pick<Artifact, 'taskId' | 'kind' | 'path'>): Artifact {
    return transaction(db, () => {
        requireTask(db, input.taskId);
        const a = insert<Artifact>(db, 'artifacts', { runId: null, previewPath: null, provenance: {}, license: null, ...input });
        appendEvent(db, 'artifact.created', null, { taskId: a.taskId, runId: a.runId, artifactId: a.id });
        return a;
    });
}
export const listArtifacts = (db: DatabaseSync, filter: {
    taskId?: string;
    runId?: string;
    kind?: Artifact['kind'];
} = {}) => filtered<Artifact>(db, 'artifacts', filter);
export function recordTestRun(db: DatabaseSync, input: Input<TestRun> & Pick<TestRun, 'taskId' | 'result'>): TestRun {
    requireTask(db, input.taskId);
    return insert<TestRun>(db, 'test_runs', { runId: null, commit: null, engineVersion: null, map: null, config: null, reportPath: null, checkId: null, ...input });
}
export function updateTestRun(db: DatabaseSync, id: string, fields: Partial<Pick<TestRun, 'result' | 'commit' | 'engineVersion' | 'map' | 'config' | 'reportPath'>>): TestRun {
    for (const [key, value] of Object.entries(fields))
        db.prepare(`update test_runs set "${key.replace(/[A-Z]/g, c => '_' + c.toLowerCase())}"=?,updated_at=? where id=?`).run(value ?? null, new Date().toISOString(), id);
    return read<TestRun>(db, 'test_runs', id)!;
}
