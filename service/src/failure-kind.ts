import type { DatabaseSync } from 'node:sqlite';
import { OrcaError } from './adapters/orca.ts';

/** Hito 7: por qué se paró algo, como estados distintos con su texto corto en el panel. */
export type FailureKind = 'connection' | 'execution' | 'cancel_requested' | 'cancel_confirmed' | 'capability_missing';
export const failureText: Record<FailureKind, string> = {
  connection: 'Sin conexión', execution: 'Ejecución fallida', cancel_requested: 'Cancelación solicitada',
  cancel_confirmed: 'Cancelación confirmada', capability_missing: 'Falta una capacidad',
};
export const orcaDownReason = 'Orca no está abierto';
const missing = ['unreal_missing', 'meshy_missing_key', 'blender_missing'];

export function failureKind(error: unknown): FailureKind {
  if (error instanceof OrcaError) return error.code === 'not_running' ? 'connection' : 'execution';
  const message = error instanceof Error ? error.message : String(error);
  if (missing.includes(message) || /\bENOENT\b/.test(message)) return 'capability_missing';
  if (/^orca: not_running|ECONNREFUSED|fetch failed|service_down/.test(message)) return 'connection';
  return 'execution';
}

export type TaskFailure = {kind: FailureKind; text: string; detail: string | null; at: string};
/** Estado de fallo de cada tarea según su orden más reciente (las 2000 últimas); sin fallo, la tarea no aparece. */
export function taskFailures(db: DatabaseSync): Map<string, TaskFailure> {
  const owners = new Map(db.prepare('select id,task_id from runs').all().map(r => [r.id as string, r.task_id as string]));
  const latest = new Map<string, Record<string, unknown>>();
  for (const row of db.prepare(`select type,payload,state,error,failure_kind,updated_at from commands order by rowid desc limit 2000`).all()) {
    let payload: {taskId?: unknown; runId?: unknown};
    try { payload = JSON.parse(row.payload as string); } catch { continue; }
    const taskId = typeof payload.taskId === 'string' ? payload.taskId : owners.get(payload.runId as string);
    if (taskId && !latest.has(taskId)) latest.set(taskId, row);
  }
  const result = new Map<string, TaskFailure>();
  for (const [taskId, row] of latest) {
    const error = row.error as string | null, at = row.updated_at as string;
    const kind: FailureKind | undefined = row.type === 'worker.stop' ? row.state === 'done' ? 'cancel_confirmed' : 'cancel_requested'
      : row.state === 'pending' && error === orcaDownReason ? 'connection'
      : row.state === 'failed' ? (row.failure_kind as FailureKind | null) ?? failureKind(error ?? '') : undefined;
    if (!kind) continue;
    const text = kind === 'connection' && error === orcaDownReason ? `${orcaDownReason} · reintento cada 30 s` : failureText[kind];
    result.set(taskId, {kind, text, detail: error, at});
  }
  return result;
}
