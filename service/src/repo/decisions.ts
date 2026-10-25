import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Decision } from '../model.ts';
import { appendEvent } from '../store.ts';
import { insert, read, filtered, transaction, type Input } from './rows.ts';
import { requireTask } from './tasks.ts';
function hash(db: DatabaseSync, taskId: string): string {
    const row = db.prepare("select coalesce(max(seq),0) seq from events where type not in ('task.waiting','task.priority') and json_extract(payload,'$.taskId')=?").get(taskId)!;
    return createHash('sha256').update(taskId + ':' + row.seq).digest('hex');
}
function openedContext(db: DatabaseSync, id: string): {
    priorBlockedReason: string | null;
} | undefined {
    const event = db.prepare("select payload from events where type='decision.opened' and json_extract(payload,'$.decisionId')=? order by seq desc limit 1").get(id);
    return event ? JSON.parse(event.payload as string) : undefined;
}
/** Hito 20: el problema que pregunta una Decisión, sin ids ni horas; con el tipo (su primera evidencia). */
export function decisionKey(d: Pick<Decision, 'reason' | 'evidence'>): string {
    const reason = d.reason
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '#')
        .replace(/\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?/g, '#')
        .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, '#')
        .replace(/\b[0-9a-f]{7,40}\b/gi, m => /\d/.test(m) ? '#' : m)
        .replace(/\s+/g, ' ').trim().toLowerCase();
    return `${d.evidence[0]?.kind ?? ''}|${reason}`;
}
const sameProblem = (db: DatabaseSync, taskId: string, key: string, states: Decision['state'][]) =>
    filtered<Decision>(db, 'decisions', { taskId }).filter(d => states.includes(d.state) && decisionKey(d) === key);

/**
 * Una Decisión por problema, no una por intento: si la tarea ya tiene abierta la misma, se actualiza (contador, última
 * evidencia, hora) con `decision.updated` en vez de abrir otra que el director tendría que resolver aparte.
 */
export function openDecision(db: DatabaseSync, input: Input<Decision> & Pick<Decision, 'taskId' | 'reason' | 'options'>, messageId: string | null = null): Decision {
    return transaction(db, () => {
        const [same] = sameProblem(db, input.taskId, decisionKey({ reason: input.reason, evidence: input.evidence ?? [] }), ['open']);
        if (!same) return create(db, input, messageId);
        db.prepare('update decisions set seen_count=seen_count+1,evidence=?,updated_at=? where id=?')
            .run(JSON.stringify(input.evidence ?? same.evidence), new Date().toISOString(), same.id);
        appendEvent(db, 'decision.updated', messageId, { taskId: same.taskId, decisionId: same.id, reason: same.reason, seenCount: same.seenCount + 1 });
        // el fallo repetido es contexto nuevo de la misma pregunta: sigue siendo resoluble
        db.prepare('update decisions set context_hash=? where id=?').run(hash(db, same.taskId), same.id);
        return read<Decision>(db, 'decisions', same.id)!;
    });
}
function create(db: DatabaseSync, input: Input<Decision> & Pick<Decision, 'taskId' | 'reason' | 'options'>, messageId: string | null): Decision {
    return transaction(db, () => {
        const task = requireTask(db, input.taskId);
        let priorBlockedReason = task.blockedReason;
        if (task.decisionId) {
            const previous = read<Decision>(db, 'decisions', task.decisionId);
            const previousContext = openedContext(db, task.decisionId);
            if (previous && previousContext?.priorBlockedReason === null && task.blockedReason === previous.reason) {
                priorBlockedReason = null;
            }
            db.prepare("update decisions set state='stale',updated_at=? where id=? and state='open'").run(new Date().toISOString(), task.decisionId);
        }
        const d = insert<Decision>(db, 'decisions', { evidence: [], chosenOptionId: null, resolvedBy: null, resolvedAt: null, contextHash: '', state: 'open', ...input });
        db.prepare('update tasks set decision_id=?,blocked_reason=?,updated_at=? where id=?').run(d.id, priorBlockedReason ?? d.reason, d.updatedAt, d.taskId);
        appendEvent(db, 'decision.opened', messageId, { taskId: d.taskId, decisionId: d.id, reason: d.reason, priorBlockedReason, ...(messageId ? { messageId } : {}) });
        db.prepare('update decisions set context_hash=? where id=?').run(hash(db, d.taskId), d.id);
        return read<Decision>(db, 'decisions', d.id)!;
    });
}
export function resolveDecision(db: DatabaseSync, id: string, optionId: string, by: string): Decision {
    const result = transaction(db, () => {
        const d = read<Decision>(db, 'decisions', id);
        if (!d)
            throw new Error('unknown_decision');
        if (d.state === 'stale')
            return null;
        if (d.state !== 'open')
            throw new Error('invalid_transition');
        if (hash(db, d.taskId) !== d.contextHash) {
            db.prepare("update decisions set state='stale',updated_at=? where id=?").run(new Date().toISOString(), id);
            return null;
        }
        if (!d.options.some(o => o.id === optionId))
            throw new Error('unknown_option');
        const now = new Date().toISOString();
        // con ella quedan resueltas las equivalentes de antes (caducadas, o abiertas en bases anteriores al hito 20)
        for (const same of sameProblem(db, d.taskId, decisionKey(d), ['open', 'stale']))
            db.prepare("update decisions set state='resolved',chosen_option_id=?,resolved_by=?,resolved_at=?,updated_at=? where id=?").run(optionId, by, now, now, same.id);
        const ownsBlock = openedContext(db, id)?.priorBlockedReason === null;
        db.prepare('update tasks set blocked_reason=case when ? then case when blocked_reason=? then null else blocked_reason end else blocked_reason end,decision_id=null,updated_at=? where id=? and decision_id=?').run(ownsBlock ? 1 : 0, d.reason, now, d.taskId, id);
        appendEvent(db, 'decision.resolved', null, { taskId: d.taskId, decisionId: id, optionId, by });
        return read<Decision>(db, 'decisions', id)!;
    });
    if (!result)
        throw new Error('decision_stale');
    return result;
}
export const listDecisions = (db: DatabaseSync, state?: Decision['state']) => filtered<Decision>(db, 'decisions', { state });

/** Regenera la pregunta vinculada después de registrar hechos recibidos durante un await. */
export function refreshPendingDecision(db: DatabaseSync, taskId: string): Decision | undefined {
    return transaction(db, () => {
        const task = requireTask(db, taskId);
        const previous = task.decisionId ? read<Decision>(db, 'decisions', task.decisionId) : undefined;
        if (!previous || !['open', 'stale'].includes(previous.state)) return undefined;
        if (previous.state === 'open' && previous.contextHash === hash(db, taskId)) return previous;
        return create(db, { taskId, reason: previous.reason, evidence: previous.evidence, options: previous.options, seenCount: previous.seenCount }, null);
    });
}

/** Hito 20: en bases con la misma Decisión abierta varias veces, se queda la más reciente con el contador sumado. */
export function groupRepeated(db: DatabaseSync): void {
    const groups = new Map<string, Decision[]>();
    for (const d of filtered<Decision>(db, 'decisions', { state: 'open' })) {
        const key = d.taskId + '|' + decisionKey(d);
        groups.set(key, [...(groups.get(key) ?? []), d]);
    }
    const now = new Date().toISOString();
    for (const list of groups.values()) {
        if (list.length < 2) continue;
        const [keep, ...rest] = list.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
        db.prepare('update decisions set seen_count=? where id=?').run(list.reduce((n, d) => n + d.seenCount, 0), keep.id);
        for (const d of rest) db.prepare("update decisions set state='stale',updated_at=? where id=?").run(now, d.id);
    }
}
