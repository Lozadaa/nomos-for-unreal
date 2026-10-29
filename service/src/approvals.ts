import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { Artifact, Run, Task } from './model.ts';
import type { SchedulerConfig } from './config.ts';
import { filtered, transaction } from './repo/rows.ts';
import { moveTask, requireTask } from './repo/tasks.ts';
import { listArtifacts } from './repo/artifacts.ts';
import { holdTask, liftHold } from './hold.ts';
import { enqueue } from './commands.ts';
import { appendEvent, createMessage } from './store.ts';
import { latestBuild } from './play.ts';
import { openDecision } from './repo/decisions.ts';

/**
 * Hito 22, Tarea 4: el usuario aprueba lo que se ve y se juega. Tras la revisión de IA aprobada, las tareas de
 * `approval.areas` (y los cierres de hito) quedan «Por aprobar», retenidas, hasta que él apruebe o pida cambios.
 */
export type Approval = {id: string; taskId: string; state: 'pending' | 'approved' | 'changes'; focus: string[];
  createdAt: string; updatedAt: string; resolvedAt: string | null};
export type ApprovalComment = {approvalId: string | null; taskId: string | null; text: string; imageId?: string; kind: 'comment' | 'changes'; at: string};
const holdReason = 'Esperando tu aprobación';
export const defaultAreas = ['gameplay', 'arte', 'ui', 'animacion'];

export function migrateApprovals(db: DatabaseSync): void {
  db.exec(`create table if not exists approvals(id text primary key, task_id text not null,
    state text not null check(state in ('pending','approved','changes')), focus text not null default '[]',
    created_at text not null, updated_at text not null, resolved_at text)`);
}

/** `Aprobación: usuario|no` en la spec manda; si no, el área o el rol en `approval.areas`, o un cierre de hito. */
export function needsApproval(task: Pick<Task, 'title' | 'spec' | 'area' | 'assigneeRole'>, config: SchedulerConfig): boolean {
  const declared = /^\s*aprobaci[oó]n\s*:\s*(usuario|no)\b/im.exec(task.spec ?? '');
  if (declared) return declared[1].toLowerCase() === 'usuario';
  if (/cierre de hito/i.test(task.title) || isClosingTask(task)) return true;
  const areas = (config as {approval?: {areas?: string[]}}).approval?.areas ?? defaultAreas;
  return areas.includes(task.area) || areas.includes(task.assigneeRole ?? '');
}

const decode = (row: Record<string, unknown>): Approval => ({id: row.id as string, taskId: row.task_id as string, state: row.state as Approval['state'],
  focus: JSON.parse(row.focus as string), createdAt: row.created_at as string, updatedAt: row.updated_at as string, resolvedAt: row.resolved_at as string | null});
export const getApproval = (db: DatabaseSync, id: string) => { const row = db.prepare('select * from approvals where id=?').get(id); return row ? decode(row) : undefined; };
export function requireApproval(db: DatabaseSync, id: string): Approval {
  const approval = getApproval(db, id); if (!approval) throw new Error('unknown_approval'); return approval;
}
export const pendingApproval = (db: DatabaseSync, taskId: string) => {
  const row = db.prepare("select * from approvals where task_id=? and state='pending' order by created_at desc limit 1").get(taskId);
  return row ? decode(row) : undefined;
};
const implementer = (db: DatabaseSync, taskId: string) => filtered<Run>(db, 'runs', {taskId})
  .filter(r => r.role !== 'revisor' && ['claude', 'codex', 'opencode'].includes(r.provider)).at(-1);

/** «En qué fijarte»: lo que escribió el worker al entregar, o el revisor, o los criterios de aceptación (de 2 a 4 puntos). */
function focusOf(db: DatabaseSync, task: Task, reviewer?: string[]): string[] {
  const clean = (list: unknown) => Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string' && !!s.trim()).slice(0, 4) : [];
  const worker = clean(implementer(db, task.id)?.metadata.focus), review = clean(reviewer);
  return worker.length ? worker : review.length ? review : task.acceptance.slice(0, 4);
}

export function requestApproval(db: DatabaseSync, task: Task, reviewerFocus?: string[]): Approval {
  return transaction(db, () => {
    const open = pendingApproval(db, task.id);
    if (open) return open;
    const id = randomUUID(), now = new Date().toISOString();
    db.prepare(`insert into approvals(id,task_id,state,focus,created_at,updated_at) values(?,?,'pending',?,?,?)`)
      .run(id, task.id, JSON.stringify(focusOf(db, task, reviewerFocus)), now, now);
    holdTask(db, task.id, holdReason);
    appendEvent(db, 'approval.requested', null, {approvalId: id, taskId: task.id});
    return requireApproval(db, id);
  });
}
/** Desde la revisión aprobada: `null` si la tarea no pasa por el usuario. */
export const finishReviewApproval = (db: DatabaseSync, task: Task, config: SchedulerConfig, reviewerFocus?: string[]) =>
  needsApproval(task, config) ? requestApproval(db, task, reviewerFocus) : null;

function settle(db: DatabaseSync, approval: Approval, state: Approval['state']): Approval {
  if (approval.state !== 'pending') throw new Error('invalid_transition');
  const now = new Date().toISOString();
  db.prepare('update approvals set state=?,updated_at=?,resolved_at=? where id=?').run(state, now, now, approval.id);
  liftHold(db, approval.taskId, state === 'approved' ? 'aprobada por el usuario' : 'cambios pedidos por el usuario');
  return requireApproval(db, approval.id);
}
export const approve = (db: DatabaseSync, id: string) => transaction(db, () => {
  const done = settle(db, requireApproval(db, id), 'approved');
  appendEvent(db, 'approval.approved', null, {approvalId: id, taskId: done.taskId});
  return done;
});

const title = (db: DatabaseSync, taskId: string) => requireTask(db, taskId).title;
/** El texto literal del usuario va como corrección al mismo worker; la tarea vuelve a implementando. */
export function requestChanges(db: DatabaseSync, id: string, text: unknown, imageId?: unknown): Approval {
  if (typeof text !== 'string' || !text.trim()) throw new Error('invalid_approval_comment');
  return transaction(db, () => {
    const done = settle(db, requireApproval(db, id), 'changes'), run = implementer(db, done.taskId);
    if (!run) throw new Error('invalid_transition');
    enqueue(db, 'worker.send', {runId: run.id, text: `Cambios pedidos por el usuario al revisar lo que se ve y se juega:\n\n${text.trim()}\n\n`
      + 'Corrígelo, commitea y repite NOMOS_DONE.'}, `approval.changes:${id}`);
    db.prepare('update tasks set review_approved=0 where id=?').run(done.taskId);
    if (requireTask(db, done.taskId).state !== 'implementando') moveTask(db, done.taskId, 'implementando', 'Cambios pedidos por el usuario');
    appendEvent(db, 'approval.changes_requested', null, {approvalId: id, taskId: done.taskId, text: text.trim(), ...(typeof imageId === 'string' ? {imageId} : {})});
    return done;
  });
}

/** Una nota que no bloquea: llega al director como mensaje del chat. Sin `id`, comentario general. */
export function comment(db: DatabaseSync, id: string | null, text: unknown, imageId?: unknown): {messageId: string} {
  if (typeof text !== 'string' || !text.trim()) throw new Error('invalid_approval_comment');
  // createMessage abre su propia transacción: el mensaje y el evento van uno tras otro
  {
    const approval = id ? requireApproval(db, id) : undefined, image = typeof imageId === 'string' ? imageId : undefined;
    const about = approval ? `Comentario sobre «${title(db, approval.taskId)}» (Por aprobar)` : 'Comentario general en Por aprobar';
    const {messageId} = createMessage(db, `${about}: ${text.trim()}${image ? ' (con una imagen adjunta)' : ''}`, 'aprobacion');
    appendEvent(db, 'approval.commented', messageId, {approvalId: approval?.id ?? null, taskId: approval?.taskId ?? null, text: text.trim(),
      messageId, ...(image ? {imageId: image} : {})});
    return {messageId};
  }
}

const comments = (db: DatabaseSync): ApprovalComment[] => db.prepare(`select type,payload,created_at from events
  where type in ('approval.commented','approval.changes_requested') order by seq`).all().map(row => {
  const p = JSON.parse(row.payload as string);
  return {approvalId: p.approvalId ?? null, taskId: p.taskId ?? null, text: p.text, ...(p.imageId ? {imageId: p.imageId} : {}),
    kind: row.type === 'approval.commented' ? 'comment' : 'changes', at: row.created_at as string};
});
/** «Una frase de qué es»: la primera línea de «## Qué» de la spec. */
const summaryOf = (spec: string) => (/^##\s*Qué\s*$\n+([^\n#][^\n]*)/m.exec(spec)?.[1] ?? spec.split('\n').find(l => l.trim() && !l.startsWith('#')) ?? '').trim().slice(0, 200);

/** `GET /approvals`: lo pendiente primero; cada elemento con su evidencia visual (vídeos e imágenes) y sus comentarios. */
export function listApprovals(db: DatabaseSync) {
  const all = db.prepare('select * from approvals order by created_at desc').all().map(decode), notes = comments(db);
  const items = all.toSorted((a, b) => Number(b.state === 'pending') - Number(a.state === 'pending')).map(a => {
    const task = requireTask(db, a.taskId), visual = (x: Artifact) => x.kind === 'video' || x.kind === 'screenshot';
    const evidence = listArtifacts(db, {taskId: a.taskId}).filter(visual)
      .toSorted((x, y) => Number(y.kind === 'video') - Number(x.kind === 'video') || y.createdAt.localeCompare(x.createdAt));
    return {...a, title: task.title, area: task.area, summary: summaryOf(task.spec), evidence, comments: notes.filter(c => c.approvalId === a.id),
      blocked: task.waitReason === noPlayableApproval ? noPlayableApproval : null};
  });
  return {pending: all.filter(a => a.state === 'pending').length, items, general: notes.filter(c => !c.approvalId)};
}
export const pendingCount = (db: DatabaseSync) => Number(db.prepare("select count(*) n from approvals where state='pending'").get()!.n);

/** Hito 25: tarea de cierre de hito, por rol o por título. */
export const isClosingTask = (task: Pick<Task, 'title' | 'assigneeRole'>) => task.assigneeRole === 'cierre' || /^\s*cierre/i.test(task.title);
export const noPlayableApproval = 'Falta tu aprobación sobre la build jugable';
/** Build estampada y un «Aprobar» del usuario posterior al último commit del responsable y a esa build. */
export function playableApproved(db: DatabaseSync, dataDir: string, taskId: string): boolean {
  const approved = db.prepare(`select seq,created_at at from events where type='approval.approved' and json_extract(payload,'$.taskId')=?
    order by seq desc limit 1`).get(taskId), run = implementer(db, taskId), build = latestBuild(dataDir, db).build;
  const finished = run ? db.prepare(`select max(seq) seq from events where type='run.finished' and json_extract(payload,'$.runId')=?`).get(run.id)?.seq : 0;
  return !!approved && !!build?.origin && Number(approved.seq) > Number(finished ?? 0) && Date.parse(approved.at as string) >= Date.parse(build.builtAt);
}

const noBuild = 'Hoy no hay build jugable aprobada';
/** Hito 25: en jam, un cierre de hito con más de 24 h sin aprobar (ni pregunta ya hecha) abre la Decisión de recortar. */
export function jamSweep(db: DatabaseSync, config: SchedulerConfig, now = Date.now()): void {
  if (!(config as {jam?: {enabled?: unknown}}).jam?.enabled) return;
  for (const task of filtered<Task>(db, 'tasks').filter(t => t.state !== 'done' && isClosingTask(t))) {
    const last = db.prepare(`select max(at) at from (select created_at at from events where type='approval.approved' and json_extract(payload,'$.taskId')=?
      union all select created_at from decisions where task_id=? and reason=?)`).get(task.id, task.id, noBuild)!.at as string | null;
    if (now - Date.parse(last ?? task.createdAt) > 24 * 3_600_000) openDecision(db, {taskId: task.id, reason: noBuild, options: [
      {id: 'recortar', label: 'Recortar', description: 'Aplica el siguiente recorte de «Recortes si falta tiempo» en docs/plan-jam.md'},
      {id: 'seguir', label: 'Seguir', description: 'Sigue sin recortar; se vuelve a preguntar tras otras 24 h sin aprobación'}]});
  }
}
