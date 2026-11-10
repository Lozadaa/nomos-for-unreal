import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Handler } from '../runner.ts';
import type { Budget, CatalogEntry, Run } from '../model.ts';
import { createMeshy, requireKind, type Meshy, type MeshyKind, type MeshyTask } from '../adapters/meshy.ts';
import { enqueue } from '../commands.ts';
import { ensureBudget, spend } from '../repo/budget.ts';
import { read, filtered } from '../repo/rows.ts';
import { requireTask } from '../repo/tasks.ts';
import { finishRun, startRun } from '../repo/runs.ts';
import { updateRun } from '../repo/worker.ts';
import { appendEvent } from '../store.ts';
import { saveMeshyResult } from './asset-meshy-save.ts';
import { balances, meshyAccounts, type MeshyAccount } from '../adapters/meshy-accounts.ts';

export type MeshyDeps = {meshy?: (account: MeshyAccount) => Meshy; accounts?: () => MeshyAccount[]};
const accountsOf = (deps: MeshyDeps) => deps.accounts?.() ?? meshyAccounts();
const clientFor = (deps: MeshyDeps, account: MeshyAccount) => deps.meshy?.(account) ?? createMeshy({apiKey: account.key()});
/** Seguimiento, descarga y reconciliación: siempre la cuenta que creó el job (runs anteriores a las cuentas: la primera). */
function client(deps: MeshyDeps, name?: string): Meshy {
  const all = accountsOf(deps), account = name === undefined ? all[0] : all.find(a => a.name === name);
  if (!account) throw new Error('meshy_missing_key');
  return clientFor(deps, account);
}
const tenMinutes = 10 * 60_000;

/** Presupuesto de la tarea si lo tiene; si no, el del workspace. Sin ninguno, uno con 0 créditos: gastar exige Decisión. */
export function budgetFor(db: DatabaseSync, taskId: string): Budget {
  const task = requireTask(db, taskId);
  if (task.budgetId) return read<Budget>(db, 'budgets', task.budgetId) ?? (() => { throw new Error('unknown_budget'); })();
  const own = filtered<Budget>(db, 'budgets', {scope: 'task', scopeId: taskId})[0];
  return own ?? filtered<Budget>(db, 'budgets', {scope: 'workspace'})[0] ?? ensureBudget(db, 'workspace', 'default', {meshyCredits: 0});
}

function submit(meshy: Meshy, kind: MeshyKind, params: Record<string, any>): Promise<string> {
  const {sourceEntryId: _source, ...body} = params;
  if (kind === 'text') return meshy.textTo3d(body as Parameters<Meshy['textTo3d']>[0]);
  if (kind === 'image') return meshy.imageTo3d(body);
  return meshy.remesh(body);
}

/** Respuesta perdida tras cobrar: busca el job en Meshy (prompt y hora ±10 min) antes de crear nada. Nunca relanza solo. */
export async function reconcile(db: DatabaseSync, meshy: Meshy, run: Run): Promise<'adopted' | 'unconfirmed'> {
  const kind = requireKind(run.metadata.kind);
  const taken = new Set(filtered<Run>(db, 'runs', {provider: 'meshy'}).map(r => r.metadata.remoteId).filter(Boolean));
  const started = Date.parse(run.startedAt);
  const match = (await meshy.listTasks(kind)).find(t => !taken.has(t.id) && Math.abs(t.createdAt - started) <= tenMinutes
    && (kind !== 'text' || t.prompt === run.metadata.prompt));
  if (match) {
    updateRun(db, run.id, {remoteId: match.id, stage: 'Preview'});
    appendEvent(db, 'meshy.job.adopted', null, {taskId: run.taskId, runId: run.id, remoteId: match.id});
    enqueue(db, 'asset.meshy_poll', {runId: run.id}, `meshy_poll:${run.id}`);
    return 'adopted';
  }
  finishRun(db, run.id, 'failed', 'Meshy sin confirmar: no se encontró el job; no se relanza solo');
  appendEvent(db, 'meshy.job.unconfirmed', null, {taskId: run.taskId, runId: run.id});
  return 'unconfirmed';
}

/** Al arrancar el servicio: runs de Meshy que se quedaron sin `remoteId` confirmado (Review Focus 4). */
export async function recoverMeshy(db: DatabaseSync, deps: MeshyDeps = {}): Promise<number> {
  const orphans = filtered<Run>(db, 'runs', {provider: 'meshy', state: 'running'}).filter(r => !r.metadata.remoteId);
  for (const run of orphans) await reconcile(db, client(deps, run.metadata.account), run);
  return orphans.length;
}

export function createMeshyGenerate(deps: MeshyDeps = {}): Handler {
  return async (command, ctx) => {
    const p = command.payload as {taskId?: unknown; kind?: unknown; params?: Record<string, any>; estimatedCredits?: unknown};
    const kind = requireKind(p.kind), params = p.params ?? {};
    const task = requireTask(ctx.db, String(p.taskId));
    const source = params.sourceEntryId ? read<CatalogEntry>(ctx.db, 'catalog_entries', String(params.sourceEntryId)) : undefined;
    if (source?.aiForbidden) throw new Error('asset_ai_forbidden');
    const estimated = Number(p.estimatedCredits);
    if (!Number.isFinite(estimated) || estimated < 0) throw new Error('invalid_command_payload');
    const accounts = accountsOf(deps), key = command.idempotencyKey;
    if (!accounts.length) throw new Error('meshy_missing_key');
    // una misma clave nunca genera dos veces: un reintento reutiliza su run y, sin remoteId, lo reconcilia
    const previous = filtered<Run>(ctx.db, 'runs', {provider: 'meshy'}).find(r => r.metadata.idempotencyKey === key);
    if (previous?.metadata.remoteId) return {runId: previous.id, remoteId: previous.metadata.remoteId, existing: true};
    if (previous) return {runId: previous.id, reconciled: previous.state === 'running' ? await reconcile(ctx.db, client(deps, previous.metadata.account), previous) : previous.state};
    const budget = budgetFor(ctx.db, task.id);
    const run = startRun(ctx.db, {taskId: task.id, role: 'arte', provider: 'meshy', metadata: {kind, stage: 'Solicitud',
      idempotencyKey: key, prompt: typeof params.prompt === 'string' ? params.prompt : undefined, params, budgetId: budget.id, estimatedCredits: estimated}});
    try { spend(ctx.db, budget.id, run.id, 'meshyCredits', estimated, `Meshy ${kind}`); }
    catch (error) {
      finishRun(ctx.db, run.id, 'failed', 'Presupuesto de Meshy agotado: decide en Decisiones');
      throw error;
    }
    // rotación: la cuenta con más saldo primero (sin saldo conocido, en su orden); sin créditos, la siguiente, una vez cada una
    const known = await balances(accounts, a => clientFor(deps, a));
    const order = accounts.map((a, i) => ({a, n: known[i] ?? -1})).sort((x, y) => y.n - x.n).map(x => x.a);
    let remoteId: string | undefined;
    for (const account of order) {
      updateRun(ctx.db, run.id, {account: account.name});
      try { remoteId = await submit(clientFor(deps, account), kind, params); break; }
      catch (error) {
        if ((error as Error).message !== 'meshy_no_credits') throw error;
        appendEvent(ctx.db, 'meshy.account_exhausted', null, {taskId: task.id, runId: run.id, account: account.name});
      }
    }
    if (!remoteId) {
      ctx.db.prepare("update spends set amount=0 where run_id=? and kind='meshyCredits'").run(run.id);
      finishRun(ctx.db, run.id, 'failed', 'Todas las cuentas de Meshy sin créditos');
      throw new Error('meshy_missing_key');
    }
    updateRun(ctx.db, run.id, {remoteId, stage: 'Preview'});
    appendEvent(ctx.db, 'meshy.job.created', null, {taskId: task.id, runId: run.id, kind, remoteId, stage: 'Preview'});
    enqueue(ctx.db, 'asset.meshy_poll', {runId: run.id}, `meshy_poll:${run.id}`, {notBefore: new Date(Date.now() + 10_000).toISOString()});
    return {runId: run.id, remoteId};
  };
}

export function createMeshyPoll(deps: MeshyDeps = {}): Handler {
  return async (command, ctx) => {
    const run = read<Run>(ctx.db, 'runs', String((command.payload as {runId?: unknown}).runId));
    if (!run || run.provider !== 'meshy') throw new Error('invalid_meshy_run');
    if (run.state !== 'running' || !run.metadata.remoteId) return {state: run.state};
    const kind = requireKind(run.metadata.kind), meshy = client(deps, run.metadata.account);
    const job: MeshyTask = await meshy.getTask(kind, run.metadata.remoteId);
    const refine = kind === 'text' && (run.metadata.params as {mode?: string} | undefined)?.mode === 'refine';
    const stage = job.status === 'SUCCEEDED' ? 'Guardado' : refine ? 'Refinado' : 'Preview';
    if (job.status === 'FAILED' || job.status === 'CANCELED') {
      ctx.db.prepare("update spends set amount=? where run_id=? and kind='meshyCredits'").run(job.creditsUsed ?? 0, run.id);
      finishRun(ctx.db, run.id, 'failed', `Meshy ${job.status}: ${job.error ?? 'sin detalle'}`);
      appendEvent(ctx.db, 'meshy.job.failed', null, {taskId: run.taskId, runId: run.id, remoteId: job.id, error: job.error});
      return {state: 'failed'};
    }
    if (job.status !== 'SUCCEEDED') {
      if (run.metadata.stage !== stage) {
        updateRun(ctx.db, run.id, {stage});
        appendEvent(ctx.db, 'meshy.job.progress', null, {taskId: run.taskId, runId: run.id, stage, progress: job.progress});
      }
      return {deferred: true, reason: `Meshy: ${job.status} ${job.progress}%`};
    }
    const dir = join(ctx.dataDir, 'artifacts', 'meshy', run.id);
    mkdirSync(dir, {recursive: true});
    const saved = await saveMeshyResult(ctx, meshy, run, job, dir);
    if (job.creditsUsed !== null)
      ctx.db.prepare("update spends set amount=? where run_id=? and kind='meshyCredits'").run(job.creditsUsed, run.id);
    updateRun(ctx.db, run.id, {stage: 'Guardado'});
    finishRun(ctx.db, run.id, 'done', saved.model ? 'Modelo de Meshy guardado' : 'Enlace vencido y sin copia');
    appendEvent(ctx.db, 'meshy.job.completed', null, {taskId: run.taskId, runId: run.id, remoteId: job.id, stage: 'Guardado', ...saved});
    return {state: 'done', ...saved};
  };
}
