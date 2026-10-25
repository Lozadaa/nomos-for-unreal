import type { DatabaseSync } from 'node:sqlite';
import { OrcaError } from './adapters/orca.ts';

/** Hito 7: por qué se paró algo, como estados distintos con su texto corto en el panel. */
export type FailureKind = 'connection' | 'execution' | 'cancel_requested' | 'cancel_confirmed' | 'capability_missing';
export const failureText: Record<FailureKind, string> = {
  connection: 'Sin conexión', execution: 'Ejecución fallida', cancel_requested: 'Cancelación solicitada',
  cancel_confirmed: 'Cancelación confirmada', capability_missing: 'Falta una capacidad',
};
export const orcaDownReason = 'Orca no está abierto', orcaUnreachableReason = 'Orca no responde';
/** Orca cerrado, o su CLI sin la app detrás (hito 16: mientras Orca se actualiza dice «Start the Orca app first»). */
export const orcaDown = (error: unknown) => error instanceof OrcaError
  && (error.code === 'not_running' || /Start the Orca app first|orca-runtime\.json/i.test(error.detail));
const missing = ['unreal_missing', 'meshy_missing_key', 'blender_missing'];

export function failureKind(error: unknown): FailureKind {
  if (error instanceof OrcaError) return orcaDown(error) ? 'connection' : 'execution';
  const message = error instanceof Error ? error.message : String(error);
  if (missing.includes(message) || /\bENOENT\b/.test(message)) return 'capability_missing';
  if (/^orca: not_running|ECONNREFUSED|fetch failed|service_down/.test(message)) return 'connection';
  return 'execution';
}

export type TaskFailure = {kind: FailureKind; text: string; detail: string | null; at: string};
/** Estado de fallo de cada tarea según su orden más reciente (las 2000 últimas); sin fallo, la tarea no aparece. */
export function taskFailures(db: DatabaseSync): Map<string, TaskFailure> {
  const runs = db.prepare("select id,task_id,json_extract(metadata,'$.orcaUnreachableSince') since from runs").all();
  const owners = new Map(runs.map(r => [r.id as string, r.task_id as string]));
  const unreachable = new Map(runs.filter(r => r.since).map(r => [r.task_id as string, Date.parse(r.since as string)]));
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
      : row.state === 'pending' && (error === orcaDownReason || error === orcaUnreachableReason) ? 'connection'
      : row.state === 'failed' ? (row.failure_kind as FailureKind | null) ?? failureKind(error ?? '') : undefined;
    if (!kind) continue;
    const since = unreachable.get(taskId);
    const text = kind === 'connection' && error === orcaUnreachableReason && since
      ? `${orcaUnreachableReason} desde hace ${Math.max(0, Math.floor((Date.now() - since) / 60_000))} min`
      : kind === 'connection' && error === orcaDownReason ? `${orcaDownReason} · reintento cada 30 s` : failureText[kind];
    result.set(taskId, {kind, text, detail: error, at});
  }
  return result;
}
