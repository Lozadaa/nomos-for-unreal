import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Handler } from '../runner.ts';
import type { Run, Task, Worktree } from '../model.ts';
import { filtered, read, transaction } from '../repo/rows.ts';
import { createTask, getTask, requireTask } from '../repo/tasks.ts';
import { startRun } from '../repo/runs.ts';
import { enqueue } from '../commands.ts';
import { appendEvent } from '../store.ts';
import { orcaDeferral, orcaDown } from './orca-down.ts';

const implementerOf = (db: DatabaseSync, taskId: string): Run | undefined => filtered<Run>(db, 'runs', {taskId})
  .filter(r => (r.provider === 'codex' || r.provider === 'claude') && r.role !== 'revisor').at(-1);

/** Tarea hija de una tarea `done`: misma área, alcance, reservas y criterios; atribución heredada. */
export function createContinuation(db: DatabaseSync, parentId: string, text: string): Task {
  return transaction(db, () => {
    const parent = requireTask(db, parentId);
    if (parent.state !== 'done') throw new Error('invalid_transition');
    if (!text.trim()) throw new Error('invalid_continuation_text');
    const implementer = implementerOf(db, parent.id);
    const child = createTask(db, {title: `Ajuste: ${parent.title}`, area: parent.area, state: 'preparada', parentTaskId: parent.id,
      spec: `${text.trim()}\n\nContinúa «${parent.title}» (tarea ${parent.id}), ya cerrada.${parent.archivePath ? ` Archivo: ${parent.archivePath}` : ''}`,
      acceptance: parent.acceptance, scope: parent.scope, leases: parent.leases,
      assigneeRole: implementer?.role ?? parent.assigneeRole, assigneeProvider: implementer?.provider ?? parent.assigneeProvider});
    db.prepare('update tasks set attribution=? where id=?').run(JSON.stringify(parent.attribution ?? {}), child.id);
    return requireTask(db, child.id);
  });
}

/** Sección «Continuación» del brief de un run nuevo: resumen y diff final archivados de la tarea madre. */
export function continuationBrief(db: DatabaseSync, task: Task): string | undefined {
  const parent = task.parentTaskId ? getTask(db, task.parentTaskId) : undefined;
  if (!parent?.archivePath) return undefined;
  const part = (name: string) => existsSync(join(parent.archivePath!, name)) ? readFileSync(join(parent.archivePath!, name), 'utf8') : '';
  const diff = part('diff-final.patch').split('\n');
  return ['## Continuación', '',
    `Esta tarea ajusta «${parent.title}», que ya se integró y cerró. Parte de lo que hay en la rama objetivo; esto es lo que se hizo:`, '',
    part('resumen.md').replace(/^# /m, '### '), '', '### Diff final de la tarea anterior', '', '```diff',
    ...diff.slice(0, 400), ...(diff.length > 400 ? [`… (${diff.length - 400} líneas más en ${join(parent.archivePath, 'diff-final.patch')})`] : []), '```'].join('\n');
}

/** `task.continue {taskId, text, childId?}`: con el terminal del responsable vivo (y su worktree en disco) se le habla allí;
 *  si no, la hija queda `preparada` y el planificador arranca un run nuevo con el archivo como contexto. */
export const taskContinue: Handler = async (command, ctx) => {
  const payload = command.payload as {taskId?: unknown; text?: unknown; childId?: unknown};
  if (typeof payload.taskId !== 'string' || typeof payload.text !== 'string') throw new Error('invalid_command_payload');
  const child = typeof payload.childId === 'string' ? requireTask(ctx.db, payload.childId) : createContinuation(ctx.db, payload.taskId, payload.text);
  if (child.parentTaskId !== payload.taskId) throw new Error('invalid_command_payload');
  const original = implementerOf(ctx.db, payload.taskId);
  const tree = original?.metadata.worktreeId ? read<Worktree>(ctx.db, 'worktrees', original.metadata.worktreeId) : undefined;
  const probe = () => !!original?.sessionRef && !!tree && existsSync(tree.path) ? ctx.orca.terminalAlive(original.sessionRef) : false;
  let alive: boolean;
  try { alive = await probe(); } catch (error) {
    if (!orcaDown(error)) throw error;
    // Orca cerrado: la hija ya existe y el reintento la reutiliza
    ctx.db.prepare("update commands set payload=json_set(payload,'$.childId',?),updated_at=? where id=?").run(child.id, new Date().toISOString(), command.id);
    const waiting = await orcaDeferral(ctx, command, child.id);
    if (waiting) return waiting;
    alive = await probe();
  }
  if (alive) {
    transaction(ctx.db, () => {
      const run = startRun(ctx.db, {taskId: child.id, role: original!.role, provider: original!.provider, sessionRef: original!.sessionRef,
        attempt: original!.attempt + 1, skills: original!.skills,
        // el terminal conserva la conversación anterior: se sigue leyendo desde su cursor y con sus marcadores ya vistos
        metadata: {worktreeId: tree!.id, continuationOf: original!.id, phase: 'running', pollGeneration: 0, correctionCount: 0,
          cursor: original!.metadata.cursor, lastLines: original!.metadata.lastLines, markerFence: original!.metadata.markerFence,
          seenDoneMarkers: original!.metadata.seenDoneMarkers, legacyDoneSummaries: original!.metadata.legacyDoneSummaries}});
      ctx.db.prepare('update tasks set worktree_id=?,updated_at=? where id=?').run(tree!.id, new Date().toISOString(), child.id);
      enqueue(ctx.db, 'worker.send', {runId: run.id, text: payload.text}, `continue.send:${child.id}`);
    });
  }
  appendEvent(ctx.db, 'task.continued', null, {parentTaskId: payload.taskId, taskId: child.id, reused: alive});
  return {taskId: child.id, reused: alive};
};
