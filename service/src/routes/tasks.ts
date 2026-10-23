import { body, json } from '../http.ts';
import { createTask, listTasks, requireTask } from '../repo/tasks.ts';
import { filtered, read } from '../repo/rows.ts';
import { listEvents } from '../store.ts';
import { areas, states, choice, text, id, type Context } from './context.ts';
import { normalizedPaths } from '../handlers/worker-policy.ts';
import { enqueue } from '../commands.ts';
import { implementerOf } from '../handlers/checks.ts';
import type { WorkerContext } from '../runner.ts';

export async function tasks({db, req, res, url}: Context): Promise<boolean> {
  const checks = /^\/tasks\/([^/]+)\/checks$/.exec(url.pathname);
  if (req.method === 'POST' && checks) {
    const task = requireTask(db, id(checks[1])), data = await body(req);
    if (data.runId !== undefined && !text(data.runId)) throw new Error('invalid_command_payload');
    const run = implementerOf({db} as WorkerContext, task, data.runId);
    if (run.taskId !== task.id) throw new Error('invalid_checks_target');
    const n = db.prepare("select count(*) n from commands where type='checks.run' and json_extract(payload,'$.taskId')=?").get(task.id)!.n;
    const command = enqueue(db, 'checks.run', {taskId: task.id, runId: run.id}, `checks:${task.id}:${run.id}:${n}`);
    json(res, 202, {commandId: command.id, state: command.state});
    return true;
  }
  const match = /^\/tasks\/([^/]+)$/.exec(url.pathname);
  if (req.method === 'GET' && match) {
    const task = requireTask(db, id(match[1]));
    json(res, 200, {
      task,
      runs: filtered(db, 'runs', {taskId: task.id}),
      events: listEvents(db, 0).filter(e => e.payload.taskId === task.id),
      artifacts: filtered(db, 'artifacts', {taskId: task.id}),
      testRuns: filtered(db, 'test_runs', {taskId: task.id}),
      decision: task.decisionId ? read(db, 'decisions', task.decisionId) ?? null : null
    });
    return true;
  }
  if (url.pathname !== '/tasks') return false;
  if (req.method === 'GET') {
    json(res, 200, listTasks(db, {
      area: choice(url.searchParams.get('area'), areas),
      state: choice(url.searchParams.get('state'), states)
    }));
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
  json(res, 201, createTask(db, {
    title: data.title, spec: data.spec, area: area!, acceptance: data.acceptance,
    assigneeRole: data.assigneeRole as string | undefined ?? null,
    assigneeProvider: data.assigneeProvider as string | undefined ?? null,
    scope: data.scope === undefined ? [] : normalizedPaths(data.scope),
    leases: data.leases === undefined ? [] : normalizedPaths(data.leases)
  }));
  return true;
}
