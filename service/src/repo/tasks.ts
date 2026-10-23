import type { DatabaseSync } from 'node:sqlite';
import type { Task, TaskState } from '../model.ts';
import { appendEvent } from '../store.ts';
import { insert, read, filtered, transaction, type Input } from './rows.ts';
import { checkGate } from '../checks/gate.ts';
export function createTask(db: DatabaseSync, input: Input<Task> & Pick<Task, 'title' | 'area'>): Task {
    return transaction(db, () => {
        const task = insert<Task>(db, 'tasks', { spec: '', acceptance: [], scope: [], leases: [], reviewApproved: 0, waitReason: null, state: 'pendiente', blockedReason: null, decisionId: null,
            assigneeRole: null, assigneeProvider: null, parentTaskId: null, dependsOn: [], worktreeId: null, budgetId: null, ...input });
        appendEvent(db, 'task.created', null, { taskId: task.id });
        return task;
    });
}
export const getTask = (db: DatabaseSync, id: string) => read<Task>(db, 'tasks', id);
export function setTaskWait(db:DatabaseSync,id:string,reason:string|null):void {
    const task=requireTask(db,id);
    if(task.waitReason===reason) return;
    db.prepare('update tasks set wait_reason=?,updated_at=? where id=?').run(reason,new Date().toISOString(),id);
    appendEvent(db,'task.waiting',null,{taskId:id,reason});
}
export const listTasks = (db: DatabaseSync, filter: {
    area?: Task['area'];
    state?: TaskState;
} = {}) => filtered<Task>(db, 'tasks', filter);
export function requireTask(db: DatabaseSync, id: string): Task { const t = getTask(db, id); if (!t)
    throw new Error('unknown_task'); return t; }
export function moveTask(db: DatabaseSync, id: string, state: TaskState, reason?: string): Task {
    return transaction(db, () => {
        const task = requireTask(db, id);
        if (state === 'done' && task.state !== 'cerrando')
            throw new Error('invalid_transition');
        // hito 6: integrando → cerrando solo lo hace el integrador, y dice dónde quedó integrado
        if (state === 'cerrando' && task.state === 'integrando' && !reason)
            throw new Error('invalid_transition');
        // nada se integra sin las pruebas que su diff exige (hito 5, prueba 7)
        if (state === 'integrando' && task.state === 'probando' && !checkGate(db, id).ok)
            throw new Error('invalid_transition');
        db.prepare('update tasks set state=?,updated_at=? where id=?').run(state, new Date().toISOString(), id);
        appendEvent(db, 'task.moved', null, { taskId: id, from: task.state, state, reason: reason ?? null });
        return requireTask(db, id);
    });
}
export function blockTask(db: DatabaseSync, id: string, reason: string, decisionId?: string): Task {
    return transaction(db, () => {
        requireTask(db, id);
        db.prepare('update tasks set blocked_reason=?,decision_id=?,updated_at=? where id=?').run(reason, decisionId ?? null, new Date().toISOString(), id);
        appendEvent(db, 'task.blocked', null, { taskId: id, reason, decisionId: decisionId ?? null });
        return requireTask(db, id);
    });
}
