import type { DatabaseSync } from 'node:sqlite';
import type { Artifact, TestRun } from '../model.ts';
import { appendEvent } from '../store.ts';
import { insert, filtered, transaction, type Input } from './rows.ts';
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
    return insert<TestRun>(db, 'test_runs', { runId: null, commit: null, engineVersion: null, map: null, config: null, reportPath: null, ...input });
}
