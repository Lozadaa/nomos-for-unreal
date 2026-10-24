import type { WorkerContext } from '../runner.ts';
import type { Command } from '../model.ts';
import { OrcaError } from '../adapters/orca.ts';
import { requireTask } from '../repo/tasks.ts';
import { appendEvent } from '../store.ts';
import { orcaDownReason } from '../failure-kind.ts';
import { decisionGate } from './worker-policy.ts';

export const orcaRetryMs = 30_000, orcaPatienceMs = 30 * 60_000;
export const orcaDown = (error: unknown) => error instanceof OrcaError && error.code === 'not_running';

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
