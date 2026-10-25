import type { DatabaseSync } from 'node:sqlite';
import type { Orca } from './adapters/orca.ts';
import type { Run } from './model.ts';
import { filtered } from './repo/rows.ts';
import { getTask } from './repo/tasks.ts';
import { updateRun } from './repo/worker.ts';

/** Hito 13: cada 10 min (y al arrancar) se cuentan los terminales vivos de los workers de este servicio. */
export const sweepIntervalMs = 10 * 60_000;
export type WorkerProcesses = {alive: number; expected: number; text: string; warning?: string};
const counts = new WeakMap<DatabaseSync, WorkerProcesses>();

/** Solo terminales que creó este servicio (los de sus runs) y que aún no se dieron por cerrados. */
const tracked = (db: DatabaseSync) => filtered<Run>(db, 'runs').filter(r => r.sessionRef && !r.metadata.terminalClosed);
/**
 * Un terminal sigue haciendo falta mientras su run está en marcha o, si es el responsable, mientras la tarea no
 * ha cerrado: las correcciones de la revisión llegan a esa misma sesión. Revisores terminados, runs fallidas o
 * canceladas y tareas hechas ya no tienen nada que leer.
 */
function needed(db: DatabaseSync, run: Run): boolean {
  if (run.state === 'running') return true;
  return run.state === 'done' && run.role !== 'revisor' && !run.metadata.discarded && getTask(db, run.taskId)?.state !== 'done';
}

/** Cierra los terminales sin uso; barato cuando no hay ninguno (lo llama el runner en cada vuelta). */
export async function closeIdleTerminals(db: DatabaseSync, orca: Orca): Promise<string[]> {
  const closed: string[] = [];
  for (const run of tracked(db).filter(r => !needed(db, r))) {
    try { await orca.terminalClose(run.sessionRef!); } catch { /* ya cerrado o desconocido para Orca */ }
    if (await orca.terminalAlive(run.sessionRef!)) continue;
    updateRun(db, run.id, {terminalClosed: true}); closed.push(run.sessionRef!);
  }
  return closed;
}

export async function sweepTerminals(db: DatabaseSync, orca: Orca): Promise<WorkerProcesses> {
  await closeIdleTerminals(db, orca);
  let alive = 0, expected = 0;
  for (const run of tracked(db)) {
    const live = await orca.terminalAlive(run.sessionRef!);
    if (live) alive++;
    if (needed(db, run)) expected++;
    else if (!live) updateRun(db, run.id, {terminalClosed: true});
  }
  const count: WorkerProcesses = {alive, expected, text: `procesos de workers vivos: ${alive}`,
    ...(alive > expected ? {warning: `Hay más procesos de workers vivos (${alive}) que runs en marcha (${expected})`} : {})};
  counts.set(db, count);
  return count;
}

/** La última cuenta del barrido (`nomos status`); `null` antes del primero. */
export const workerProcesses = (db: DatabaseSync): WorkerProcesses | null => counts.get(db) ?? null;
/**
 * Hito 17: antes de cada pasada del planificador, las runs terminadas cuyo terminal sigue vivo y no está en reposo
 * (el worker sigue con una corrección, fusionando o empaquetando) quedan `terminalBusy` y ocupan hueco del cupo.
 */
// ponytail: dos llamadas a Orca por run terminada con terminal abierto en cada pasada (5 s); espaciarlas si Orca se resiente
export async function refreshBusyTerminals(db: DatabaseSync, orca: Orca): Promise<void> {
  for (const run of tracked(db).filter(r => r.state !== 'running' && (r.provider === 'claude' || r.provider === 'codex'))) {
    let busy: boolean;
    try { busy = await orca.terminalAlive(run.sessionRef!) && !await orca.terminalIsIdle(run.sessionRef!); }
    catch { continue; /* Orca no responde: se conserva lo último que se supo */ }
    if (busy !== !!run.metadata.terminalBusy) updateRun(db, run.id, {terminalBusy: busy});
  }
}
