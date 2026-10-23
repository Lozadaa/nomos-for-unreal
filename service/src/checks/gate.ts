import type { DatabaseSync } from 'node:sqlite';
import type { Decision, Run, TestRun } from '../model.ts';
import { filtered } from '../repo/rows.ts';

export type Gate = {ok: true} | {ok: false; reason: string; blocking: string[]; unavailable: TestRun[]};
export const waiverOption = {id: 'continue', label: 'Continuar sin esta comprobación', description: 'Integrar sin esta prueba; queda registrada como no ejecutada'};
export const retryOption = {id: 'retry', label: 'Reintentar', description: 'Volver a lanzar las comprobaciones'};

/** Pruebas eximidas por una Decisión «Continuar sin esta comprobación» resuelta sobre esas mismas filas. */
function waived(db: DatabaseSync, taskId: string): Set<string> {
  const ids = filtered<Decision>(db, 'decisions', {taskId, state: 'resolved'}).filter(d => d.chosenOptionId === waiverOption.id)
    .flatMap(d => d.evidence.filter(e => e.kind === 'gate:checks').flatMap(e => JSON.parse(e.ref) as string[]));
  return new Set(ids);
}

/** Lo que exigió el último checks.run (su run guarda la selección y el commit probado). */
function selection(db: DatabaseSync, taskId: string): {checks: string[]; commit: string | null} | undefined {
  const run = filtered<Run>(db, 'runs', {taskId}).filter(r => Array.isArray(r.metadata.checks)).at(-1);
  return run ? {checks: run.metadata.checks!, commit: run.metadata.checksCommit ?? null} : undefined;
}

/** Puerta probando → integrando: cada comprobación que exige el último lote, en su commit, debe estar passed (o eximida
 *  si no se pudo ejecutar). Una fila `pending` es solo el hueco del lote: cuenta la última ya decidida (p. ej. el QA de umg). */
export function checkGate(db: DatabaseSync, taskId: string): Gate {
  const rows = filtered<TestRun>(db, 'test_runs', {taskId}).filter(r => r.checkId);
  const batch = selection(db, taskId);
  if (!rows.length && !batch) return {ok: false, reason: 'Sin pruebas: lanza las comprobaciones', blocking: [], unavailable: []};
  const latest = new Map<string, TestRun>();
  if (batch) {
    for (const check of batch.checks) {
      const own = rows.filter(r => r.checkId === check && (!batch.commit || r.commit === batch.commit));
      const row = own.filter(r => r.result !== 'pending').at(-1) ?? own.at(-1);
      latest.set(check, row ?? {checkId: check, result: 'pending'} as TestRun);
    }
  } else for (const row of rows) latest.set(row.checkId!, row);
  if (latest.size > 1) latest.delete('none');
  const free = waived(db, taskId), blocking: string[] = [], unavailable: TestRun[] = [];
  for (const [check, row] of latest) {
    if (row.result === 'passed' || check === 'none' && row.result === 'skipped') continue;
    if (row.result === 'skipped' || row.result === 'unavailable') { if (!free.has(row.id)) unavailable.push(row); continue; }
    blocking.push(check);
  }
  if (!blocking.length && !unavailable.length) return {ok: true};
  const reason = blocking.length ? `Pruebas sin pasar: ${blocking.join(', ')}`
    : `Comprobación no disponible: ${unavailable.map(r => r.checkId).join(', ')}`;
  return {ok: false, reason, blocking, unavailable};
}
