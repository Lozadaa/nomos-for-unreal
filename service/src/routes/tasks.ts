import { body, json } from '../http.ts';
import { createTask, listTasks, requireTask } from '../repo/tasks.ts';
import { filtered, read } from '../repo/rows.ts';
import { appendEvent, eventsOf } from '../store.ts';
import { areas, states, choice, text, id, type Context } from './context.ts';
import { normalizedPaths } from '../handlers/worker-policy.ts';
import { enqueue } from '../commands.ts';
import { implementerOf } from '../handlers/checks.ts';
import type { WorkerContext } from '../runner.ts';
import { taskFailures } from '../failure-kind.ts';
import { linkedMessage } from '../chat.ts';
import { holdTask, withHold } from '../hold.ts';

export async function tasks({db, req, res, url}: Context): Promise<boolean> {
  const checks = /^\/tasks\/([^/]+)\/checks$/.exec(url.pathname);
  if (req.method === 'POST' && checks) {
    const task = requireTask(db, id(checks[1])), data = await body(req);
    if (data.runId !== undefined && !text(data.runId)) throw new Error('invalid_command_payload');
    const run = implementerOf({db} as WorkerContext, task, data.runId);
    if (run.taskId !== task.id) throw new Error('invalid_checks_target');
    const n = db.prepare("select count(*) n from commands where type='checks.run' and json_extract(payload,'$.taskId')=?").get(task.id)!.n;
    // hito 22: --acepta-nueva-base deja que la captura aprobada sustituya la línea base
    const command = enqueue(db, 'checks.run', {taskId: task.id, runId: run.id, ...(data.acceptNewBase === true ? {acceptNewBase: true} : {})}, `checks:${task.id}:${run.id}:${n}`);
    json(res, 202, {commandId: command.id, state: command.state});
    return true;
  }
  const match = /^\/tasks\/([^/]+)$/.exec(url.pathname);
  if (req.method === 'GET' && match) {
    const task = requireTask(db, id(match[1])), failure = taskFailures(db).get(task.id);
    json(res, 200, {
      task: withHold(db, failure ? {...task, failure} : task),
      runs: filtered(db, 'runs', {taskId: task.id}),
      events: eventsOf(db, 'taskId', task.id),
      artifacts: filtered(db, 'artifacts', {taskId: task.id}),
      testRuns: filtered(db, 'test_runs', {taskId: task.id}),
      decision: task.decisionId ? read(db, 'decisions', task.decisionId) ?? null : null
    });
    return true;
  }
  const held = /^\/tasks\/([^/]+)\/hold$/.exec(url.pathname);
  if (req.method === 'POST' && held) {
    // hito 21: espera deliberada; `until` en minutos (entero) o un tipo de evento
    const data = await body(req);
    json(res, 200, withHold(db, holdTask(db, id(held[1]), data.reason as string, data.until as number | string | undefined)));
    return true;
  }
  const priority = /^\/tasks\/([^/]+)\/priority$/.exec(url.pathname);
  if (req.method === 'POST' && priority) {
    const task = requireTask(db, id(priority[1])), data = await body(req);
    if (!Number.isSafeInteger(data.priority)) throw new Error('invalid_priority');
    db.prepare('update tasks set priority=?,updated_at=? where id=?').run(data.priority as number, new Date().toISOString(), task.id);
    appendEvent(db, 'task.priority', null, {taskId: task.id, priority: data.priority});
    json(res, 200, requireTask(db, task.id));
    return true;
  }
  if (url.pathname !== '/tasks') return false;
  if (req.method === 'GET') {
    // hito 7: el estado de fallo (conexión, ejecución, cancelación, capacidad) viaja con la tarea
    const failures = taskFailures(db);
    json(res, 200, listTasks(db, {
      area: choice(url.searchParams.get('area'), areas),
      state: choice(url.searchParams.get('state'), states)
    }).map(task => withHold(db, failures.has(task.id) ? {...task, failure: failures.get(task.id)} : task)));
    return true;
  }
  if (req.method !== 'POST') return false;
  const data = await body(req);
  const area = choice(typeof data.area === 'string' ? data.area : '', areas);
  if (!text(data.title) || typeof data.spec !== 'string' ||
      !Array.isArray(data.acceptance) || !data.acceptance.every(v => typeof v === 'string')) {
    throw new Error('invalid_task');
  }
  if(data.assigneeRole!==undefined && !text(data.assigneeRole)
    || data.assigneeProvider!==undefined && !['codex','claude','opencode'].includes(data.assigneeProvider as string))
    throw new Error('invalid_worker_payload');
  if (data.priority !== undefined && !Number.isSafeInteger(data.priority)) throw new Error('invalid_priority');
  json(res, 201, createTask(db, {
    title: data.title, spec: data.spec, area: area!, acceptance: data.acceptance,
    assigneeRole: data.assigneeRole as string | undefined ?? null,
    assigneeProvider: data.assigneeProvider as string | undefined ?? null,
    scope: data.scope === undefined ? [] : normalizedPaths(data.scope),
    leases: data.leases === undefined ? [] : normalizedPaths(data.leases),
    ...(data.priority === undefined ? {} : {priority: data.priority as number})
  }, linkedMessage(db, data.messageId)));
  return true;
}
