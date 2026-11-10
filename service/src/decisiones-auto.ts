import type { DatabaseSync } from 'node:sqlite';
import type { Decision } from './model.ts';
import { autoDecisionMinutes, autonomous, type SchedulerConfig } from './config.ts';
import { decisionKey, listDecisions, resolveDecision } from './repo/decisions.ts';
import { filtered } from './repo/rows.ts';
import { appendEvent } from './store.ts';
import { approve } from './approvals.ts';
import { requestIntegration } from './routes/task-closing.ts';

export const autoBy = 'nomos-auto';
/**
 * Tiempo muerto (docs/x10/siguiente.md): en Herbalist 47 de 51 Decisiones las resolvió el director con la misma opción,
 * y dos de ellas pararon una tarea 14 h y 12,4 h. Estas se resuelven solas pasado el plazo; la Decisión queda como aviso.
 * `again` es la opción cuando el mismo problema vuelve tras una resolución automática (reintentar una vez, luego eximir).
 */
export const autoRules: {match: RegExp; option: string | string[]; again?: string; persona?: true; wake?: string}[] = [
  {match: /^Reconciliar worker existente/, option: 'leave'},
  {match: /^Cambios sin registrar/, option: 'commit'},
  {match: /^Comprobación no disponible/, option: 'retry', again: 'continue'},
  {match: /^(Revisión aprobada|Lista para integrar): falta pedir la integración/, option: 'integrar'},
  {match: /^Pedir la revisión del commit/, option: 'pedir_revision'},
  // experimento metras 2026-11-08: ~90 min parados en estas dos sin nadie delante. Solo sin persona (`autonomous`): se acepta
  // lo hecho con los hallazgos anotados y se sigue; tras un fallo de comprobación no hay «aceptar» y la pregunta sigue abierta
  {match: /^QA de UI sin mejora medible$/, option: 'aceptar', persona: true},
  // sin hallazgos de revisión no hay «aceptar» (metras 4.ª vuelta: quedó abierta para siempre): una corrección más y, si vuelve,
  // jam 2026-11-10: nunca cancelar solo; queda abierta y despierta al director
  {match: /^Máximo de (tres|\d+) correcciones alcanzado$/, option: ['aceptar', 'review'], persona: true, wake: 'Máximo de correcciones: decide tú'},
];

/** La opción que se elegiría sola, o null si la pregunta es de verdad para una persona. */
export function autoOption(d: Pick<Decision, 'reason' | 'options'>, priorAuto = 0, sinPersona = false): string | null {
  const rule = autoRules.find(r => r.match.test(d.reason));
  if (!rule || rule.persona && !sinPersona || priorAuto > 0 && rule.wake) return null;
  const wanted = priorAuto > 0 && rule.again ? [rule.again] : [rule.option].flat();
  return wanted.find(option => d.options.some(o => o.id === option)) ?? null;
}

/** Una pasada (cada 5 s, con el planificador): resuelve las Decisiones obvias abiertas desde hace más del plazo. */
export function sweepAutoDecisions(db: DatabaseSync, config: SchedulerConfig, now = Date.now()): number {
  const minutes = autoDecisionMinutes(config);
  if (!minutes) return 0;
  let resolved = 0;
  for (const d of listDecisions(db, 'open')) {
    const age = now - Date.parse(d.createdAt);
    if (age < minutes * 60_000) continue;
    const key = decisionKey(d);
    const prior = filtered<Decision>(db, 'decisions', {taskId: d.taskId, state: 'resolved'}).filter(p => p.resolvedBy === autoBy && decisionKey(p) === key).length;
    const option = autoOption(d, prior, autonomous(config)), wake = autoRules.find(r => r.match.test(d.reason))?.wake;
    if (!option && wake && prior > 0 && autonomous(config) && !db.prepare(`select 1 from events where type='task.closing_blocked'
      and json_extract(payload,'$.decisionId')=?`).get(d.id)) appendEvent(db, 'task.closing_blocked', null, {taskId: d.taskId, decisionId: d.id, reason: wake});
    if (!option) continue;
    try { resolveDecision(db, d.id, option, autoBy); }
    catch { continue; /* caducada: el contexto cambió y la regenerada tendrá su propio plazo */ }
    appendEvent(db, 'decision.auto_resolved', null, {taskId: d.taskId, decisionId: d.id, reason: d.reason, optionId: option, afterMinutes: Math.round(age / 60_000), prior});
    resolved++;
  }
  return resolved;
}

/** Candela B2 2026-11-10: sin persona delante (director por evento o `decisiones.autonomo`), un «Por aprobar» paraba la tarea
 *  sin plazo. A los `approval.autoMinutos` (15) se aprueba solo y sigue a integración; queda el evento para revisarlo después.
 *  Las líneas base y los conflictos de binarios siguen siendo de una persona. */
export function sweepAutoApprovals(db: DatabaseSync, config: SchedulerConfig, now = Date.now()): number {
  if (!autonomous(config)) return 0;
  const minutes = (config as {approval?: {autoMinutos?: number}}).approval?.autoMinutos ?? 15;
  const old = db.prepare(`select id, task_id, created_at from approvals where state='pending' and baseline is null and conflict is null`).all()
    .filter(r => now - Date.parse(r.created_at as string) >= minutes * 60_000);
  for (const r of old) {
    approve(db, r.id as string);
    appendEvent(db, 'approval.auto_approved', null, {approvalId: r.id, taskId: r.task_id, afterMinutes: Math.round((now - Date.parse(r.created_at as string)) / 60_000)});
    try { requestIntegration(db, r.task_id as string); } catch { /* aún le faltan comprobaciones o revisión: sigue su camino */ }
  }
  return old.length;
}
