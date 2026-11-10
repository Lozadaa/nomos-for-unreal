import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { WorkerContext } from '../runner.ts';
import type { Run } from '../model.ts';
import { runTree, updateRun, queuePoll } from '../repo/worker.ts';
import { transaction } from '../repo/rows.ts';
import { finishRun, startRun } from '../repo/runs.ts';
import { acquire } from '../leases.ts';
import { requireTask } from '../repo/tasks.ts';
import { appendEvent } from '../store.ts';
import { maxWorkerMinutes, readConfig } from '../config.ts';
import { briefLine, launchCommand } from './worker-launch.ts';
import { deliver } from './worker-deliver.ts';

/** Hito 19: Orca corta un terminal a las 4 h; 15 min antes Nomos releva al worker por otro en el mismo worktree. */
export const relayLeadMinutes = 15, relayWaitMs = 5 * 60_000;
export const relayMessage = 'Commit WIP: relevo por límite de tiempo';
const heading = '## Relevo por límite de tiempo';

/** Cuándo toca relevar: `orca.maxWorkerMinutes` (240) desde el arranque, menos 15 min. */
export const relayAt = (run: Run, max: number) => Date.parse(run.startedAt) + Math.max(0, max - relayLeadMinutes) * 60_000;

const notes = [heading, '## Continuación tras un reinicio'];
/** El brief del árbol con la nota de continuación (la de un relevo o un reinicio anterior se sustituye). */
export function continuationBrief(path: string, run: Run, head: string, subject: string, title = heading,
  why = 'Otro worker empezó esta tarea en este mismo árbol y llegó al límite de tiempo de su terminal.'): void {
  const file = join(path, '.nomos-brief.md'), base = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const lines = (run.metadata.lastLines ?? []).filter(l => l.trim()).slice(-15);
  const kept = notes.reduce((text, note) => text.split(`\n${note}\n`)[0], base);
  writeFileSync(file, [kept.trimEnd(), '', title, '', why,
    `Último commit: ${head.slice(0, 7)} ${subject}`.trimEnd(), '', 'Lo último que decía su terminal:', '', '```', ...lines, '```', '',
    'Continúa donde lo dejó; no repitas lo hecho. Mira `git log` y `git diff` para ver lo que ya hay.', ''].join('\n'));
}

/**
 * Un paso del relevo desde el sondeo: pide el commit (una vez), espera a que el árbol quede limpio o pasen 5 min,
 * commitea lo que quede, abre un terminal nuevo con el brief y la nota y cierra el viejo. `true` = la run ya no se sondea.
 * La tarea no cambia de estado ni abre Decisión.
 */
export async function relayStep(ctx: WorkerContext, run: Run): Promise<boolean> {
  const {db, orca, git} = ctx;
  if (run.role === 'revisor' || Date.now() < relayAt(run, maxWorkerMinutes(readConfig(ctx.dataDir)))) return false;
  const tree = runTree(db, run);
  if (!run.metadata.relayRequestedAt) {
    const relative = `.nomos-inbox/relevo-${run.id.slice(0, 8)}.md`;
    mkdirSync(join(tree.path, '.nomos-inbox'), {recursive: true}); writeFileSync(join(tree.path, '.nomos-inbox', '.gitignore'), '*\n');
    writeFileSync(join(tree.path, relative), `Se acaba el tiempo de este terminal. Haz ahora commit de todo lo que tengas con el mensaje «${relayMessage}» `
      + 'y no empieces nada nuevo: otro worker seguirá en este mismo árbol donde lo dejes.\n');
    await deliver(db, orca, run, tree.path, `Lee el archivo ${relative} y ejecuta lo que dice.`);
    updateRun(db, run.id, {relayRequestedAt: new Date().toISOString()});
    appendEvent(db, 'worker.relay_requested', null, {taskId: run.taskId, runId: run.id});
    return false;
  }
  const status = await git.status(tree.path);
  if (!status.clean && Date.now() - Date.parse(run.metadata.relayRequestedAt) < relayWaitMs) return false;
  if (!status.clean) await git.commitAll(tree.path, `${relayMessage} (Nomos)`);
  await replaceWorker(ctx, run, {state: 'cancelled', note: 'Relevado por el límite de tiempo de Orca'});
  return true;
}

/** Un worker nuevo en el mismo árbol con el brief y la nota de continuación; la run vieja acaba en `state`. */
export async function replaceWorker(ctx: WorkerContext, run: Run, o: {state: 'cancelled' | 'failed'; note: string; title?: string; why?: string;
  mark?: Record<string, unknown>}): Promise<Run> {
  const {db, orca, git} = ctx, tree = runTree(db, run);
  const head = await git.head(tree.path), subject = (await git.log(tree.path, tree.baseCommit).catch(() => [])).find(c => c.sha === head)?.subject ?? '';
  continuationBrief(tree.path, run, head, subject, o.title, o.why);
  const model = run.metadata.model, sessionId = run.provider === 'claude' ? randomUUID() : undefined;
  const command = launchCommand(run.provider, model, `nomos-${run.taskId.slice(0, 8)}`, sessionId);
  if (!orca.terminalCreate) throw new Error('orca: no puede abrir un terminal nuevo para el relevo');
  const handle = await orca.terminalCreate(tree.path, `nomos-${run.taskId.slice(0, 8)}`, run.provider === 'opencode' ? command : `${command} "${briefLine}"`);
  const next = transaction(db, () => {
    finishRun(db, run.id, o.state, o.note);
    updateRun(db, run.id, {phase: 'finished', waiting: false, pollGeneration: (run.metadata.pollGeneration ?? 0) + 1});
    const max = maxWorkerMinutes(readConfig(ctx.dataDir));
    const fresh = startRun(db, {taskId: run.taskId, role: run.role, provider: run.provider, sessionRef: handle, attempt: run.attempt, skills: run.skills,
      model: run.model, metadata: {worktreeId: tree.id, relayOf: run.id, phase: 'running', pollGeneration: 0, correctionCount: run.metadata.correctionCount ?? 0,
        deadlineAt: new Date(Date.now() + max * 60_000).toISOString(), ...(model ? {model} : {}), ...(sessionId ? {sessionId} : {}), ...o.mark}});
    acquire(db, fresh.id, run.taskId, requireTask(db, run.taskId).leases);
    updateRun(db, run.id, {relayedTo: fresh.id});
    appendEvent(db, 'worker.relayed', null, {taskId: run.taskId, oldRun: run.id, newRun: fresh.id});
    queuePoll(db, fresh);
    return fresh;
  });
  try { await orca.terminalClose(run.sessionRef!); } catch { /* ya cerrado: el nuevo sigue igual */ }
  return next;
}
