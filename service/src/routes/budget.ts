import { json } from '../http.ts';
import { budgetSummary } from '../repo/budget.ts';
import { choice, type Context } from './context.ts';

export async function budget({db, req, res, url}: Context): Promise<boolean> {
  if (req.method !== 'GET' || url.pathname !== '/budget') return false;
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
  json(res, 200, budgetSummary(db, scope, scopeId));
  return true;
}
