import type { DatabaseSync } from 'node:sqlite';
import type { Run, Task } from './model.ts';
import { filtered, read } from './repo/rows.ts';
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
/** Turnos de Unreal: `scheduler.heavy.maxConcurrent` plazas por proyecto (cada worker tiene su worktree; la RAM es el límite
 *  real y machineReason la comprueba). La primera es `editor/<proyecto>`, la de las comprobaciones; las demás `editor/<proyecto>#n`. */
export const editorSlots = (base: string, config: SchedulerConfig) =>
  Array.from({length: heavyMax(config)}, (_, i) => i ? `${base}#${i + 1}` : base);
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
  now = Date.now()): {granted: boolean; reason?: string; held?: true} {
  const run = workerRun(db, taskId), config = readConfig(dataDir), slots = editorSlots(editorPath(dataDir), config);
  // `held`: ya era suyo (turno pedido a mano); `ue py --tarea` no lo suelta al acabar
  if (slots.some(p => holders(db, p)[0]?.runId === run.id)) return {granted: true, held: true};
  for (const p of slots) reclaimIdle(db, p, probe, now);
  const path = slots.find(p => !holders(db, p).length);
  const held = path ? undefined : holders(db, slots[0])[0];
  let queue = queues.get(db);
  if (!queue) queues.set(db, queue = new Map());
  for (const [id, entry] of queue) if (entry.seen < now - forgetMs) queue.delete(id);
  queue.set(taskId, {first: queue.get(taskId)?.first ?? now, seen: now});
  const priority = (id: string) => getTask(db, id)?.priority ?? 0, mine = queue.get(taskId)!;
  const ahead = [...queue].find(([id, entry]) => id !== taskId
    && (priority(id) > priority(taskId) || priority(id) === priority(taskId) && entry.first < mine.first))?.[0];
  // su propio editor caliente sigue abierto: lo reutiliza, no abre otro Unreal; ni RAM libre ni «Unreal ajeno» aplican
  // (canario PiedraPapel 2026-11-08: con 4,7 GB libres la tarea esperó 10 min a que se cerrara su propio caliente)
  const ownWarm = [...warm.get(db)?.values() ?? []].includes(taskId);
  const reason = held ? `Espera a que ${label(db, held.taskId)} suelte Unreal` : ahead ? `Turno: antes va ${label(db, ahead)}`
    : ownWarm ? null : machineReason(db, config, probe, taskId);
  if (reason) return {granted: false, reason};
  const lease = acquire(db, run.id, taskId, [path!]);
  if (!lease.ok) return {granted: false, reason: `Espera a que ${label(db, lease.conflicts[0].taskId)} suelte Unreal`};
  queue.delete(taskId);
  appendEvent(db, 'editor.granted', null, {taskId, runId: run.id, project: path!.slice(7)});
  return {granted: true};
}

/** `nomos worker turn --release`: devuelve Unreal; terminar la run también lo devuelve (suelta sus reservas). */
export function releaseTurn(db: DatabaseSync, dataDir: string, taskId: string): {released: boolean} {
  requireTask(db, taskId);
  const released = editorSlots(editorPath(dataDir), readConfig(dataDir)).filter(p => releasePath(db, taskId, p)).length > 0;
  queues.get(db)?.delete(taskId);
  if (released) appendEvent(db, 'editor.released', null, {taskId, project: editorPath(dataDir).slice(7)});
  return {released};
}

/** x10: sin Unreal abierto (ni editor ni UBT/UAT) durante este tiempo, el turno que un worker retiene a mano se libera. */
export const turnIdleMs = 3 * 60_000;
const idle = new WeakMap<DatabaseSync, Map<string, number>>();
/**
 * Lo llama quien espera la reserva `path` (otro worker o una comprobación): si la tiene un worker y en el PC no hay
 * ningún proceso de Unreal desde hace `turnIdleMs`, se la quita (evento `editor.released` con `motivo: inactivo`).
 * ponytail: el PC entero como señal (no se sabe de quién es cada proceso); un Unreal ajeno abierto lo mantiene.
 */
export function reclaimIdle(db: DatabaseSync, path: string, probe: MachineProbe = probeMachine, now = Date.now()): boolean {
  const lease = holders(db, path)[0], run = lease && read<Run>(db, 'runs', lease.runId);
  if (!run || run.role === 'revisor' || !workers.includes(run.provider)) return false;
  let seen = idle.get(db);
  if (!seen) idle.set(db, seen = new Map());
  const m = probe();
  if (m.editors + (m.tools ?? 0) > 0) { seen.delete(run.id); return false; }
  const since = seen.get(run.id) ?? now;
  seen.set(run.id, since);
  if (now - since < turnIdleMs || !releasePath(db, lease.taskId, path)) return false;
  seen.delete(run.id);
  appendEvent(db, 'editor.released', null, {taskId: lease.taskId, project: path.slice(7), motivo: 'inactivo', minutos: Math.round((now - since) / 60_000)});
  return true;
}

/** x10: editores calientes que quedaron abiertos al soltar un turno por operación (`ue py --tarea`): uproject → tarea. */
const warm = new WeakMap<DatabaseSync, Map<string, string>>();
export function noteWarm(db: DatabaseSync, uproject: string, taskId: string): void {
  let open = warm.get(db);
  if (!open) warm.set(db, open = new Map());
  open.set(uproject.toLowerCase(), taskId);
}
/** Los calientes que hay que cerrar antes de que otro abra Unreal (un editor a la vez): todos menos el de `own`. Los olvida. */
export function warmToClose(db: DatabaseSync, own?: string): string[] {
  const open = warm.get(db), out = [...open?.keys() ?? []].filter(u => u !== own?.toLowerCase());
  for (const u of out) open!.delete(u);
  return out;
}
