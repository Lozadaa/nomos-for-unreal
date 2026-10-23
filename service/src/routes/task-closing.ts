import { body, json } from '../http.ts';
import { requireTask } from '../repo/tasks.ts';
import { enqueue } from '../commands.ts';
import { implementerOf } from '../handlers/checks.ts';
import type { WorkerContext } from '../runner.ts';
import type { Task } from '../model.ts';
import { id, type Context } from './context.ts';

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
  const task = requireTask(db, taskId);
  if (task.state !== 'integrando' || task.reviewApproved !== 1) throw new Error('invalid_transition');
  return task;
}

export async function taskClosing({db, req, res, url}: Context): Promise<boolean> {
  const match = /^\/tasks\/([^/]+)\/(integrate)$/.exec(url.pathname);
  if (req.method !== 'POST' || !match) return false;
  const taskId = id(match[1]);
  await body(req).catch(() => ({}));
  const task = integratePayload(db, taskId);
  const run = implementerOf({db} as WorkerContext, task);
  json(res, 202, queue(db, 'integrate.run', task, {taskId: task.id, runId: run.id}, `integrate:${task.id}:${run.id}`));
  return true;
}
