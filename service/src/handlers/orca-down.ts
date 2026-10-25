import type { WorkerContext } from '../runner.ts';
import type { Command } from '../model.ts';
import { requireTask } from '../repo/tasks.ts';
import { requireRun, updateRun } from '../repo/worker.ts';
import { appendEvent } from '../store.ts';
import { orcaDown, orcaDownReason, orcaUnreachableReason } from '../failure-kind.ts';
import { orcaGraceMinutes, readConfig } from '../config.ts';
import { decisionGate } from './worker-policy.ts';

export { orcaDown };
export const orcaRetryMs = 30_000, orcaPatienceMs = 30 * 60_000;

/**
 * Hito 16: Orca que deja de responder con una run ya en marcha (se actualiza, se reinicia) no la mata: el seguimiento se
 * difiere cada 30 s con `orcaUnreachableSince` en la run y solo tras `orca.graceMinutes` (10) se deja fallar, incierta, como antes.
 */
export function orcaGrace(ctx: WorkerContext, type: string, payload: {runId?: unknown}, error: unknown, now = Date.now()):
  {deferred: true; reason: string; delayMs: number} | undefined {
  if (!orcaDown(error) || typeof payload.runId !== 'string' || !['worker.poll', 'review.poll', 'worker.send'].includes(type)) return;
  const run = requireRun(ctx.db, payload.runId);
  if (run.state !== 'running' && !(type === 'worker.send' && run.state === 'done')) return;
  const since = run.metadata.orcaUnreachableSince ?? new Date(now).toISOString();
  if (now - Date.parse(since) >= orcaGraceMinutes(readConfig(ctx.dataDir)) * 60_000) return;
  if (!run.metadata.orcaUnreachableSince) updateRun(ctx.db, run.id, {orcaUnreachableSince: since});
  return {deferred: true, reason: orcaUnreachableReason, delayMs: orcaRetryMs};
}
/** Orca volvió: la marca se quita y el seguimiento sigue como si nada. */
export function orcaBack(ctx: WorkerContext, payload: {runId?: unknown}): void {
  if (typeof payload.runId !== 'string') return;
  const run = ctx.db.prepare("select json_extract(metadata,'$.orcaUnreachableSince') since from runs where id=?").get(payload.runId);
  if (run?.since) updateRun(ctx.db, payload.runId, {orcaUnreachableSince: undefined});
}

/**
 * Orca cerrado antes de cualquier efecto (hito 7): se difiere cada 30 s sin gastar reintentos; a los 30 min,
 * Decisión «Abrir Orca / Cancelar». `undefined` = se eligió abrir Orca y se puede reintentar ya.
 */
export async function orcaDeferral(ctx: WorkerContext, command: Command, taskId: string, now = Date.now()):
  Promise<{deferred: true; reason: string; delayMs: number} | {policyBlocked: true; decisionId: string | null} | undefined> {
  const {db} = ctx;
  const reset = Number(db.prepare(`select coalesce(max(seq),0) seq from events where type='orca.opened'
    and json_extract(payload,'$.commandId')=?`).get(command.id)!.seq);
  const first = db.prepare(`select created_at from events where type='command.deferred' and seq>?
    and json_extract(payload,'$.commandId')=? and json_extract(payload,'$.reason')=? order by seq limit 1`).get(reset, command.id, orcaDownReason);
  const since = first ? Date.parse(first.created_at as string) : now;
  if (now - since < orcaPatienceMs) return {deferred: true, reason: orcaDownReason, delayMs: orcaRetryMs};
  const approved = decisionGate(ctx, requireTask(db, taskId), 'orca_down', 'Orca lleva 30 minutos sin abrirse',
    {commandId: command.id, since: new Date(since).toISOString()},
    [{id: 'approve', label: 'Abrir Orca', description: 'Abrir Orca y reintentar el arranque'},
      {id: 'cancel', label: 'Cancelar', description: 'No arrancar el worker'}]);
  if (!approved) return {policyBlocked: true, decisionId: requireTask(db, taskId).decisionId};
  appendEvent(db, 'orca.opened', null, {commandId: command.id, taskId});
  try { await ctx.orca.open?.(); } catch { /* si sigue cerrado, el reintento vuelve a diferir */ }
  return undefined;
}
