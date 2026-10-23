import type { DatabaseSync } from 'node:sqlite';
import type { Budget, Run, Spend } from '../model.ts';
import { insert, read, transaction } from './rows.ts';
import { openDecision } from './decisions.ts';
export const metrics = ['meshyCredits', 'elevenlabsCredits', 'tokens', 'buildMinutes'] as const;
export type Limits = Pick<Budget, typeof metrics[number]>;
export function ensureBudget(db: DatabaseSync, scope: Budget['scope'], scopeId: string, limits: Partial<Limits>): Budget {
    for (const value of Object.values(limits))
        if (value !== null && (!Number.isFinite(value) || value! < 0))
            throw new Error('invalid_limit');
    return transaction(db, () => {
        const old = db.prepare('select id from budgets where scope=? and scope_id=?').get(scope, scopeId);
        return old ? read<Budget>(db, 'budgets', old.id as string)! : insert<Budget>(db, 'budgets', { scope, scopeId, meshyCredits: null, elevenlabsCredits: null, tokens: null, buildMinutes: null, ...limits });
    });
}
/** Crea el presupuesto si falta y fija los límites recibidos; `null` quita el límite de esa métrica. */
export function setLimits(db: DatabaseSync, scope: Budget['scope'], scopeId: string, limits: Partial<Limits>): Budget {
    for (const key of Object.keys(limits))
        if (!(metrics as readonly string[]).includes(key))
            throw new Error('invalid_limit');
    return transaction(db, () => {
        const budget = ensureBudget(db, scope, scopeId, limits);
        const keys = Object.keys(limits) as (keyof Limits)[];
        if (keys.length)
            db.prepare(`update budgets set ${keys.map(k => k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()) + '=?').join(',')},updated_at=? where id=?`)
                .run(...keys.map(k => limits[k] ?? null), new Date().toISOString(), budget.id);
        return read<Budget>(db, 'budgets', budget.id)!;
    });
}
export function budgetSummary(db: DatabaseSync, scope: Budget['scope'], scopeId: string): {
    limits: Limits;
    spent: Record<keyof Limits, number>;
    remaining: Limits;
} {
    const row = db.prepare('select id from budgets where scope=? and scope_id=?').get(scope, scopeId);
    if (!row)
        throw new Error('unknown_budget');
    const b = read<Budget>(db, 'budgets', row.id as string)!;
    const limits = {} as Limits, spent = {} as Record<keyof Limits, number>, remaining = {} as Limits;
    for (const key of metrics) {
        limits[key] = b[key];
        spent[key] = Number(db.prepare('select coalesce(sum(amount),0) n from spends where budget_id=? and kind=?').get(b.id, key)!.n);
        remaining[key] = b[key] === null ? null : b[key]! - spent[key];
    }
    return { limits, spent, remaining };
}
export function spend(db: DatabaseSync, budgetId: string, runId: string, kind: typeof metrics[number], amount: number, note: string | null): Spend {
    if (!Number.isFinite(amount) || amount < 0)
        throw new Error('invalid_amount');
    if (!metrics.includes(kind))
        throw new Error('invalid_kind');
    const result = transaction(db, () => {
        const b = read<Budget>(db, 'budgets', budgetId);
        if (!b)
            throw new Error('unknown_budget');
        const run = read<Run>(db, 'runs', runId);
        if (!run)
            throw new Error('unknown_run');
        if (b.scope === 'task' && b.scopeId !== run.taskId)
            throw new Error('budget_task_mismatch');
        const remaining = budgetSummary(db, b.scope, b.scopeId).remaining[kind];
        if (remaining !== null && amount > remaining) {
            openDecision(db, { taskId: run.taskId, reason: 'Presupuesto agotado: ' + kind,
                evidence: [{ kind: 'budget', ref: budgetId }], options: [{ id: 'increase', label: 'Ampliar presupuesto', description: 'Revisar el límite antes de continuar' }, { id: 'stop', label: 'Detener', description: 'No realizar más gastos' }] });
            return null;
        }
        return insert<Spend>(db, 'spends', { budgetId, runId, kind, amount, note });
    });
    if (!result)
        throw new Error('budget_exceeded');
    return result;
}
