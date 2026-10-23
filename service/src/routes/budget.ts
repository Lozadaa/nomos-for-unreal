import { body, json } from '../http.ts';
import { budgetSummary, setLimits, type Limits } from '../repo/budget.ts';
import { requireTask } from '../repo/tasks.ts';
import { appendEvent } from '../store.ts';
import { choice, text, type Context } from './context.ts';

async function putBudget({db, req, res}: Context): Promise<void> {
  const data = await body(req);
  const scope = choice(typeof data.scope === 'string' ? data.scope : null, ['workspace', 'task']);
  if (!scope) throw new Error('invalid_scope');
  if (!text(data.scopeId)) throw new Error('invalid_scope_id');
  if (!data.limits || typeof data.limits !== 'object' || Array.isArray(data.limits)) throw new Error('invalid_limit');
  for (const value of Object.values(data.limits))
    if (value !== null && typeof value !== 'number') throw new Error('invalid_limit');
  if (scope === 'task') requireTask(db, data.scopeId);
  setLimits(db, scope, data.scopeId, data.limits as Partial<Limits>);
  appendEvent(db, 'budget.updated', null, {scope, scopeId: data.scopeId});
  json(res, 200, budgetSummary(db, scope, data.scopeId));
}

export async function budget(context: Context): Promise<boolean> {
  const {db, req, res, url} = context;
  if (url.pathname !== '/budget') return false;
  if (req.method === 'PUT') {await putBudget(context); return true;}
  if (req.method !== 'GET') return false;
  const scope = choice(url.searchParams.get('scope'), ['workspace', 'task']) ?? 'workspace';
  let scopeId = url.searchParams.get('scopeId');
  if (scopeId !== null && !scopeId.trim()) throw new Error('invalid_scope_id');
  if (!scopeId) {
    if (scope === 'task') throw new Error('invalid_scope_id');
    const rows = db.prepare("select scope_id from budgets where scope='workspace'").all();
    if (!rows.length) throw new Error('unknown_budget');
    if (rows.length !== 1) throw new Error('invalid_scope_id');
    scopeId = rows[0].scope_id as string;
  }
  json(res, 200, {...budgetSummary(db, scope, scopeId), scope, scopeId});
  return true;
}
