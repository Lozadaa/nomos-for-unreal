import type { DatabaseSync } from 'node:sqlite';
import type { Run, Task } from './model.ts';
import { filtered } from './repo/rows.ts';
import { getTask, requireTask } from './repo/tasks.ts';
import { acquire, holders, listLeases, releasePath } from './leases.ts';
import { selectChecks } from './checks/select.ts';
import { lingering, startIntents } from './scheduler-state.ts';
import { heavyMax, heavyRequiresNoEditor, minFreeRamGb, readConfig, type SchedulerConfig } from './config.ts';
import { gb, probeMachine, type MachineProbe } from './machine.ts';
import { projectInfo } from './project-root.ts';
import { taskCode } from './play.ts';
import { appendEvent } from './store.ts';

/**
 * Hito 22: pesada = abre Unreal (build, map, animation). `Carga: pesada|ligera` en la spec manda; si no, el área
 * (animación, escenarios, builds) o las comprobaciones que exigiría su alcance.
 */
export function isHeavy(task: Pick<Task, 'spec' | 'area' | 'scope' | 'leases'>): boolean {
  const declared = /^\s*carga\s*:\s*(pesada|ligera)\b/im.exec(task.spec ?? '');
  if (declared) return declared[1].toLowerCase() === 'pesada';
  if (['animacion', 'escenarios', 'builds'].includes(task.area)) return true;
  const paths = [...task.scope, ...task.leases];
  return selectChecks(paths, paths).some(id => ['map', 'animation', 'build'].includes(id));
}

const label = (db: DatabaseSync, taskId: string) => {
  const title = getTask(db, taskId)?.title ?? taskId;
  return taskCode(title) ?? /^([A-Z][A-Z0-9.]*-[A-Z0-9.]+)\s/.exec(title)?.[1] ?? title;
};
const workers = ['claude', 'codex', 'opencode'];

/** Tareas que tienen Unreal ahora: workers pesados vivos (o por arrancar), el editor de Nomos y los turnos concedidos. */
export function unrealHolders(db: DatabaseSync, planned: string[] = []): string[] {
  const runs = filtered<Run>(db, 'runs'), heavy = (id: string) => { const t = getTask(db, id); return !!t && isHeavy(t); };
  const live = [...runs.filter(r => r.state === 'running' && r.role !== 'revisor' && workers.includes(r.provider)), ...lingering(db, runs)];
  return [...new Set([
    ...listLeases(db).filter(l => l.path.startsWith('editor/')).map(l => l.taskId),
    ...live.map(r => r.taskId).filter(heavy),
    ...startIntents(db).filter(i => !i.review).map(i => i.taskId).filter(heavy),
    ...planned,
  ])];
}

/** Por qué `taskId` no puede abrir Unreal ahora, o `null`. `slots`: cuenta el turno de Unreal (arranque de pesada). */
export function machineReason(db: DatabaseSync, config: SchedulerConfig, probe: MachineProbe, taskId: string,
  opts: {slots?: boolean; planned?: string[]} = {}): string | null {
  const all = unrealHolders(db, opts.planned), others = all.filter(id => id !== taskId);
  if (opts.slots && others.length >= heavyMax(config)) return `Espera a que ${label(db, others[0])} suelte Unreal`;
  const machine = probe(), min = minFreeRamGb(config);
  if (machine.freeGb < min) return `${gb(machine.freeGb)} GB libres, hacen falta ${gb(min)}`;
  // ponytail: no se sabe de quién es cada proceso; con un editor vivo y nadie de Nomos con Unreal, es ajeno
  if (heavyRequiresNoEditor(config) && machine.editors > 0 && !all.length) return 'Espera a que se cierre el Unreal abierto fuera de Nomos';
  return null;
}

const editorPath = (dataDir: string) => `editor/${projectInfo(dataDir)?.name ?? 'Unreal'}`;
const queues = new WeakMap<DatabaseSync, Map<string, {first: number; seen: number}>>();
/** Un `turn --wait` que deja de preguntar 30 s se da por ido. */
const forgetMs = 30_000;

function workerRun(db: DatabaseSync, taskId: string): Run {
  requireTask(db, taskId);
  const run = filtered<Run>(db, 'runs', {taskId}).find(r => r.state === 'running' && r.role !== 'revisor' && workers.includes(r.provider));
  if (!run) throw new Error('invalid_transition');
  return run;
}

/**
 * `nomos worker turn --wait` pregunta aquí hasta que se le concede Unreal (reserva `editor/<proyecto>` a nombre de
 * su run, la misma que usan las comprobaciones). Entre los que esperan, la mayor prioridad y luego el primero en pedir.
 */
export function requestTurn(db: DatabaseSync, dataDir: string, taskId: string, probe: MachineProbe = probeMachine,
  now = Date.now()): {granted: boolean; reason?: string} {
  const run = workerRun(db, taskId), path = editorPath(dataDir), held = holders(db, path)[0];
  if (held?.runId === run.id) return {granted: true};
  let queue = queues.get(db);
  if (!queue) queues.set(db, queue = new Map());
  for (const [id, entry] of queue) if (entry.seen < now - forgetMs) queue.delete(id);
  queue.set(taskId, {first: queue.get(taskId)?.first ?? now, seen: now});
  const priority = (id: string) => getTask(db, id)?.priority ?? 0, mine = queue.get(taskId)!;
  const ahead = [...queue].find(([id, entry]) => id !== taskId
    && (priority(id) > priority(taskId) || priority(id) === priority(taskId) && entry.first < mine.first))?.[0];
  const reason = held ? `Espera a que ${label(db, held.taskId)} suelte Unreal` : ahead ? `Turno: antes va ${label(db, ahead)}`
    : machineReason(db, readConfig(dataDir), probe, taskId);
  if (reason) return {granted: false, reason};
  const lease = acquire(db, run.id, taskId, [path]);
  if (!lease.ok) return {granted: false, reason: `Espera a que ${label(db, lease.conflicts[0].taskId)} suelte Unreal`};
  queue.delete(taskId);
  appendEvent(db, 'editor.granted', null, {taskId, runId: run.id, project: path.slice(7)});
  return {granted: true};
}

/** `nomos worker turn --release`: devuelve Unreal; terminar la run también lo devuelve (suelta sus reservas). */
export function releaseTurn(db: DatabaseSync, dataDir: string, taskId: string): {released: boolean} {
  requireTask(db, taskId);
  const released = releasePath(db, taskId, editorPath(dataDir));
  queues.get(db)?.delete(taskId);
  if (released) appendEvent(db, 'editor.released', null, {taskId, project: editorPath(dataDir).slice(7)});
  return {released};
}
