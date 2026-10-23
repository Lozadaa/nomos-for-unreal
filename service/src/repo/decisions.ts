import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Decision } from '../model.ts';
import { appendEvent } from '../store.ts';
import { insert, read, filtered, transaction, type Input } from './rows.ts';
import { requireTask } from './tasks.ts';
function hash(db: DatabaseSync, taskId: string): string {
    const row = db.prepare("select coalesce(max(seq),0) seq from events where json_extract(payload,'$.taskId')=?").get(taskId)!;
    return createHash('sha256').update(taskId + ':' + row.seq).digest('hex');
}
function openedContext(db: DatabaseSync, id: string): {
    priorBlockedReason: string | null;
} | undefined {
    const event = db.prepare("select payload from events where type='decision.opened' and json_extract(payload,'$.decisionId')=? order by seq desc limit 1").get(id);
    return event ? JSON.parse(event.payload as string) : undefined;
}
export function openDecision(db: DatabaseSync, input: Input<Decision> & Pick<Decision, 'taskId' | 'reason' | 'options'>): Decision {
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
        appendEvent(db, 'decision.opened', null, { taskId: d.taskId, decisionId: d.id, reason: d.reason, priorBlockedReason });
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
        db.prepare("update decisions set state='resolved',chosen_option_id=?,resolved_by=?,resolved_at=?,updated_at=? where id=?").run(optionId, by, now, now, id);
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
