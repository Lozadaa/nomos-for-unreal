import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Orca } from '../adapters/orca.ts';
import type { Run } from '../model.ts';
import { updateRun } from '../repo/worker.ts';
import { appendEvent } from '../store.ts';
import { launchCommand, followUp } from './worker-launch.ts';

/** `agent_prompt_blocked` trae el id para reintentar la misma petición. */
export const blockedRequest = (error: unknown): string | undefined =>
  /agent_prompt_blocked[\s\S]*?request ID: ([0-9a-f-]{36})/i.exec(error instanceof Error ? error.message : String(error))?.[1];

/** La conversación más reciente de Claude Code en ese árbol (`~/.claude/projects/<ruta codificada>/<sesión>.jsonl`). */
export function claudeSession(treePath: string, home = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')): string | undefined {
  const dir = join(home, 'projects', treePath.replace(/[^a-zA-Z0-9]/g, '-'));
  if (!existsSync(dir)) return undefined;
  return readdirSync(dir).filter(f => f.endsWith('.jsonl')).map(f => ({f, t: statSync(join(dir, f)).mtimeMs}))
    .sort((a, b) => b.t - a.t)[0]?.f.replace(/\.jsonl$/, '');
}

/**
 * Hito 7 (hallazgo 11): si Orca bloquea el envío porque su caja de texto guarda un borrador, se reintenta una vez la
 * misma petición; si sigue bloqueado, el worker Claude sigue en un terminal nuevo del mismo árbol con su conversación
 * (`--resume`) y la orden como argumento. Devuelve el terminal que recibió la orden.
 */
export async function deliver(db: DatabaseSync, orca: Orca, run: Run, treePath: string, line: string, home?: string): Promise<string> {
  const handle = run.sessionRef!;
  line = followUp(run.provider, run.metadata.model, line);
  let error: unknown;
  try { await orca.terminalSend(handle, line); return handle; } catch (e) { error = e; }
  const requestId = blockedRequest(error);
  if (!requestId) throw error;
  appendEvent(db, 'worker.send_blocked', null, {runId: run.id, taskId: run.taskId, terminal: handle, requestId});
  try { await orca.terminalSend(handle, line, {requestId, waitSeconds: 20}); return handle; } catch (e) { error = e; }
  if (!blockedRequest(error) || run.provider !== 'claude' || !orca.terminalCreate) throw error;
  const session = claudeSession(treePath, home);
  try { await orca.terminalClose(handle); } catch { /* ya cerrado: el nuevo lo sustituye igual */ }
  const next = await orca.terminalCreate(treePath, `kratos-${run.taskId.slice(0, 8)}`,
    `${launchCommand('claude', run.metadata.model)}${session ? ` --resume ${session}` : ''} "${line}"`);
  // el terminal nuevo empieza de cero: ni cursor ni huella del anterior
  updateRun(db, run.id, {cursor: undefined, screenFingerprint: undefined, markerBuffer: '', markerFence: ''}, {sessionRef: next});
  appendEvent(db, 'worker.terminal_replaced', null, {runId: run.id, taskId: run.taskId, previous: handle, terminal: next, resumed: !!session});
  return next;
}
