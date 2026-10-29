import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Handler } from './runner.ts';
import type { Run, Spend, Worktree } from './model.ts';
import { enqueue } from './commands.ts';
import { insert, read } from './repo/rows.ts';
import { budgetFor } from './handlers/asset-meshy.ts';

/** Hito 24: tokens de una run de Claude Code, leídos de su transcripción `~/.claude/projects/<árbol>/<sesión>.jsonl`. */
export type Usage = {input: number; output: number; cacheRead: number; cacheWrite: number; turns: number; model: string};

export const transcriptDir = (treePath: string, home = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')) =>
  join(home, 'projects', treePath.replace(/[^a-zA-Z0-9]/g, '-'));

/** Un turno por mensaje: Claude Code repite el `usage` en cada línea de un mismo mensaje (vale la última). */
export function readUsage(file: string): Usage | undefined {
  if (!existsSync(file)) return undefined;
  const messages = new Map<string, any>();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    let entry: any;
    try { entry = JSON.parse(line); } catch { continue; }
    const message = entry?.type === 'assistant' ? entry.message : undefined;
    if (message?.usage && message.model !== '<synthetic>') messages.set(message.id ?? entry.uuid, message);
  }
  const usage: Usage = {input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: messages.size, model: ''}, models = new Map<string, number>();
  for (const {usage: u, model} of messages.values()) {
    usage.input += u.input_tokens ?? 0; usage.output += u.output_tokens ?? 0;
    usage.cacheRead += u.cache_read_input_tokens ?? 0; usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
    models.set(model, (models.get(model) ?? 0) + 1);
  }
  usage.model = [...models].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  return usage;
}

/** `nomos status`: tokens de entrada medidos, total y por rol de run. */
export function tokensByRole(db: DatabaseSync): {total: number; porRol: Record<string, number>} {
  const rows = db.prepare("select r.role role, sum(s.amount) n from spends s join runs r on r.id=s.run_id where s.kind='tokens' group by r.role").all();
  const porRol = Object.fromEntries(rows.map(r => [r.role as string, Number(r.n)]));
  return {total: Object.values(porRol).reduce((a, b) => a + b, 0), porRol};
}

/** Al cerrar una run con sesión de Claude Code se encola su medición (una por run). */
export function queueTokens(db: DatabaseSync, run: Run): void {
  if (run.metadata.sessionId) enqueue(db, 'run.tokens', {runId: run.id}, `run.tokens:${run.id}`);
}

/** Una fila `tokens` en `spends`: entrada total (fresca + caché) y el detalle en `note`; sin archivo, reintenta una vez a los 60 s. */
export const runTokens: Handler = async (command, ctx) => {
  const {runId, retry} = command.payload as {runId: string; retry?: boolean};
  const run = read<Run>(ctx.db, 'runs', runId);
  if (!run?.metadata.sessionId || ctx.db.prepare("select 1 from spends where run_id=? and kind='tokens'").get(runId)) return {skipped: true};
  const tree = run.metadata.worktreeId ? read<Worktree>(ctx.db, 'worktrees', run.metadata.worktreeId) : undefined;
  const usage = tree ? readUsage(join(transcriptDir(tree.path), `${run.metadata.sessionId}.jsonl`)) : undefined;
  if (!usage && !retry) {
    enqueue(ctx.db, 'run.tokens', {runId, retry: true}, `run.tokens:${runId}:retry`, {notBefore: new Date(Date.now() + 60_000).toISOString()});
    return {retry: true};
  }
  insert<Spend>(ctx.db, 'spends', {budgetId: budgetFor(ctx.db, run.taskId).id, runId, kind: 'tokens',
    amount: usage ? usage.input + usage.cacheRead + usage.cacheWrite : 0, note: usage ? JSON.stringify(usage) : 'sin transcripción'});
  return {tokens: usage?.input ?? 0};
};
