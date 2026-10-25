import type { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import type { Artifact, TestRun } from '../model.ts';
import { appendEvent } from '../store.ts';
import { insert, filtered, read, transaction, type Input } from './rows.ts';
import { requireTask } from './tasks.ts';
import { databaseDirectory, storedPath } from '../data-paths.ts';
/** Toda alta pasa por aquí: lo que cae en `<datos>/artifacts` se guarda relativo (la carpeta de datos puede moverse).
 *  Sin `dataDir`, la carpeta de la base, que en producción es la de datos. */
export function addArtifact(db: DatabaseSync, input: Input<Artifact> & Pick<Artifact, 'taskId' | 'kind' | 'path'>,
    dataDir = databaseDirectory(db)): Artifact {
    const root = dataDir && join(dataDir, 'artifacts');
    return transaction(db, () => {
        requireTask(db, input.taskId);
        const a = insert<Artifact>(db, 'artifacts', { runId: null, previewPath: null, provenance: {}, license: null, ...input,
            path: storedPath(root, input.path), ...(input.previewPath ? { previewPath: storedPath(root, input.previewPath) } : {}) });
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
