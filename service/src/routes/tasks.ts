import { body, json } from '../http.ts';
import { createTask, listTasks, requireTask } from '../repo/tasks.ts';
import { filtered, read } from '../repo/rows.ts';
import { listEvents } from '../store.ts';
import { areas, states, choice, text, id, type Context } from './context.ts';
import { normalizedPaths } from '../handlers/worker-policy.ts';

export async function tasks({db, req, res, url}: Context): Promise<boolean> {
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
  json(res, 201, createTask(db, {
    title: data.title, spec: data.spec, area: area!, acceptance: data.acceptance,
    scope: data.scope === undefined ? [] : normalizedPaths(data.scope),
    leases: data.leases === undefined ? [] : normalizedPaths(data.leases)
  }));
  return true;
}
