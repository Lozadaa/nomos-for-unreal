import { body, json } from '../http.ts';
import { moveTask, requireTask } from '../repo/tasks.ts';
import { enqueue } from '../commands.ts';
import { implementerOf } from '../handlers/checks.ts';
import type { WorkerContext } from '../runner.ts';
import type { Task } from '../model.ts';
import { id, text, type Context } from './context.ts';
import { archiveDir, taskArchive, verifyArchive } from '../archive.ts';
import { file } from './artifacts.ts';
import { createContinuation } from '../handlers/continue.ts';
import { liftHold } from '../hold.ts';
import { pendingApproval } from '../approvals.ts';

type Db = Context['db'];
/** Orden viva de ese tipo para la tarea, o una nueva con clave numerada (reintegrar tras resolver un conflicto). */
function queue(db: Db, type: string, task: Task, payload: object, key: string): {commandId: string; state: string} {
  const live = db.prepare(`select id,state from commands where type=? and state in ('pending','running')
    and json_extract(payload,'$.taskId')=? order by rowid desc limit 1`).get(type, task.id);
  if (live) return {commandId: live.id as string, state: live.state as string};
  const n = db.prepare(`select count(*) n from commands where type=? and json_extract(payload,'$.taskId')=?`).get(type, task.id)!.n;
  const command = enqueue(db, type, payload, `${key}:${n}`);
  return {commandId: command.id, state: command.state};
}

/** Validadores compartidos con `POST /commands`. */
export function integratePayload(db: Db, taskId: unknown): Task {
  if (typeof taskId !== 'string' || !taskId.trim()) throw new Error('invalid_command_payload');
  let task = requireTask(db, taskId);
  // revisión aprobada sin pruebas exigidas: nada la llevaría a integrando (las comprobaciones solo avanzan desde probando)
  if (task.state === 'revisando' && task.reviewApproved === 1 && !task.acceptance.some(a => a.startsWith('check:')))
    task = moveTask(db, task.id, 'integrando', 'Revisión aprobada; sin pruebas exigidas');
  if (task.state !== 'integrando' || task.reviewApproved !== 1) throw new Error('invalid_transition');
  // hito 22: lo que espera la aprobación del usuario no se integra
  if (pendingApproval(db, task.id)) throw new Error('approval_pending');
  liftHold(db, task.id, 'integración pedida');
  return task;
}
/** `nomos task integrate` y, hito 21, la opción «Pedir la integración» de un atasco. */
export function requestIntegration(db: Db, taskId: string): {commandId: string; state: string} {
  const task = integratePayload(db, taskId), run = implementerOf({db} as WorkerContext, task);
  return queue(db, 'integrate.run', task, {taskId: task.id, runId: run.id}, `integrate:${task.id}:${run.id}`);
}
export function finalizePayload(db: Db, taskId: unknown): Task {
  if (typeof taskId !== 'string' || !taskId.trim()) throw new Error('invalid_command_payload');
  const task = requireTask(db, taskId);
  if (task.state !== 'cerrando') throw new Error('invalid_transition');
  return task;
}

export async function taskClosing({db, req, res, url, dataDir}: Context): Promise<boolean> {
  const archive = /^\/tasks\/([^/]+)\/archive(?:\/(.+))?$/.exec(url.pathname);
  if (req.method === 'GET' && archive) {
    const task = requireTask(db, id(archive[1]));
    const dir = taskArchive(dataDir, task) ?? (dataDir ? archiveDir({dataDir}, task.id) : undefined);
    if (archive[2] !== undefined) { await file(res, dir, id(archive[2])); return true; }
    const manifest = dir ? verifyArchive(dir) : null;
    if (!manifest) throw new Error('unknown_archive');
    json(res, 200, {taskId: task.id, createdAt: manifest.createdAt,
      files: Object.entries(manifest.files).map(([name, entry]) => ({name, ...entry}))});
    return true;
  }
  const match = /^\/tasks\/([^/]+)\/(integrate|finalize|continue)$/.exec(url.pathname);
  if (req.method !== 'POST' || !match) return false;
  const taskId = id(match[1]);
  const data = await body(req).catch(() => ({} as Record<string, unknown>));
  if (match[2] === 'continue') {
    // «ajusta esto» sobre una tarea done: la hija nace aquí (el panel la abre) y la orden decide terminal vivo o run nuevo
    if (!text(data.text)) throw new Error('invalid_continuation_text');
    const child = createContinuation(db, taskId, data.text);
    const command = enqueue(db, 'task.continue', {taskId, text: data.text, childId: child.id}, `continue:${child.id}`);
    json(res, 202, {taskId: child.id, commandId: command.id, state: command.state});
    return true;
  }
  if (match[2] === 'finalize') {
    const task = finalizePayload(db, taskId);
    json(res, 202, queue(db, 'finalize.run', task, {taskId: task.id}, `finalize:${task.id}`));
    return true;
  }
  json(res, 202, requestIntegration(db, taskId));
  return true;
}
