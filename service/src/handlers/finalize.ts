import type { Handler, WorkerContext } from '../runner.ts';
import type { Command, Decision, Run, Task, TestRun, Worktree } from '../model.ts';
import { filtered, read } from '../repo/rows.ts';
import { moveTask, requireTask, setTaskWait } from '../repo/tasks.ts';
import { finishRun } from '../repo/runs.ts';
import { updateRun } from '../repo/worker.ts';
import { listDecisions, openDecision } from '../repo/decisions.ts';
import { enqueue } from '../commands.ts';
import { appendEvent } from '../store.ts';
import { checkGate } from '../checks/gate.ts';
import { attribute } from '../attribution.ts';
import { preserveTask, type ArchiveWriter } from '../archive.ts';
import { storedPath } from '../data-paths.ts';
import { targetBranch } from '../integration/workspace.ts';
import { commandRun } from './asset-run.ts';
import { writeResume } from '../resume.ts';
import { isClosingTask, noPlayableApproval, playableApproved, requestApproval } from '../approvals.ts';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readConfig } from '../config.ts';
import { addArtifact } from '../repo/artifacts.ts';
import { projectInfo } from '../project-root.ts';

/** Hito 25: las 1-5 líneas de `## Lecciones` del informe de cierre (`docs/produccion/J<n>.md` o un .md de la tarea que la tenga). */
async function lessonsOf(ctx: WorkerContext, task: Task, tree: Worktree | undefined): Promise<{file: string; lines: string[]} | null> {
  const code = /\bJ\d+\b/.exec(task.title)?.[0];
  const files = [...(code ? [`docs/produccion/${code}.md`] : []),
    ...(tree ? (await ctx.git.filesBetween(tree.path, tree.baseCommit, 'HEAD')).filter(f => f.endsWith('.md')) : [])];
  for (const file of files) {
    let text: string; try { text = readFileSync(join(tree?.path ?? ctx.projectDir, file), 'utf8'); } catch { continue; }
    const section = text.split(/^## Lecciones[ \t]*\r?$/m)[1]?.split(/^## /m)[0];
    if (section === undefined) continue;
    const lines = section.split(/\r?\n/).map(l => l.replace(/^\s*(?:[-*]|\d+\.)\s+/, '').trim()).filter(Boolean);
    return lines.length && lines.length <= 5 ? {file, lines} : null;
  }
  return null;
}
const defaultMemory = ['C:/Python314/python.exe', '-X', 'utf8', 'C:/Users/richa/Documents/SecondBrain/.system/brain.py'];
/** `brain.py capture` con las lecciones; si falla, `command.failed` con la causa y el cierre vale igual. */
async function saveLessons(ctx: WorkerContext, command: Command, task: Task, run: Run, report: {file: string; lines: string[]}): Promise<void> {
  const body = join(ctx.dataDir, `lecciones-${task.id}.md`);
  try {
    const memory = (readConfig(ctx.dataDir) as {memory?: {enabled?: boolean; command?: string[]}}).memory;
    if (memory?.enabled === false) return;
    const [exe, ...pre] = memory?.command ?? defaultMemory;
    const done = ctx.db.prepare(`select payload from events where type='integration.completed' and json_extract(payload,'$.taskId')=? order by seq desc limit 1`).get(task.id);
    const commit = done ? String(JSON.parse(done.payload as string).commit).slice(0, 7) : 'sin integrar';
    const game = projectInfo(ctx.dataDir)?.name ?? basename(ctx.projectDir), milestone = /\bJ\d+\b/.exec(task.title)?.[0] ?? task.title;
    writeFileSync(body, report.lines.map(l => `- ${l}\n`).join(''));
    const {stdout} = await promisify(execFile)(exe, [...pre, '--cwd', ctx.projectDir, 'capture', '--title', `${game} · ${milestone}: lecciones`,
      '--source', `${report.file} @ ${commit}`, '--kind', 'learning', '--evidence', 'observed', '--body-file', body], {windowsHide: true, timeout: 60_000});
    const path = stdout.trim().split(/\r?\n/).at(-1)?.trim();
    if (!path) throw new Error('brain.py no devolvió la ruta de la nota');
    addArtifact(ctx.db, {taskId: task.id, runId: run.id, kind: 'report', path, provenance: {label: 'Memoria guardada'}});
    appendEvent(ctx.db, 'memory.saved', null, {taskId: task.id, runId: run.id, path});
  } catch (error) {
    const cause = error instanceof Error ? `${error.message} ${(error as {stderr?: string}).stderr ?? ''}`.trim() : String(error);
    appendEvent(ctx.db, 'command.failed', null, {commandId: command.id, taskId: task.id, reason: `No se guardaron las lecciones en Second Brain: ${cause.slice(0, 500)}`});
  } finally { rmSync(body, {force: true}); }
}

export type FinalizeDeps = {writer?: ArchiveWriter; busyDelayMs?: number};
const options = [
  {id: 'discard', label: 'Descartar', description: 'Borrar los cambios sin registrar y retirar el worktree (queda registrado quién lo eligió)'},
  {id: 'commit', label: 'Commitear al run', description: 'El responsable commitea los cambios y la tarea vuelve a pasar por revisión'},
  {id: 'wait', label: 'Esperar', description: 'No tocar nada; el cierre se reintenta después'},
];
const busy = (error: unknown) => /EBUSY|EPERM|busy|in use|being used|locked/i.test(error instanceof Error ? error.message : String(error));
class Blocked extends Error { condition: string; constructor(condition: string, reason: string) { super(reason); this.condition = condition; } }

const workers = (runs: Run[]) => runs.filter(r => r.provider === 'codex' || r.provider === 'claude');
const commandDecision = (ctx: WorkerContext, task: Task, command: Command): Decision | undefined =>
  listDecisions(ctx.db).filter(d => d.taskId === task.id && d.evidence.some(e => e.kind === 'command' && e.ref === command.id)).at(-1);

/** Condiciones 1-4 de cierre (plan v1 §6), en orden; la primera que falla da el motivo. */
async function verify(ctx: WorkerContext, task: Task, tree: Worktree | undefined): Promise<void> {
  if (!tree) return; // tareas sin worktree (assets remotos): solo preservación
  const events = ctx.db.prepare(`select seq,payload from events where type='integration.completed' and json_extract(payload,'$.taskId')=? order by seq desc limit 1`).get(task.id);
  const integration = events ? JSON.parse(events.payload as string) as {commit: string; branch: string} : undefined;
  const branch = integration?.branch ?? await targetBranch(ctx);
  if (!await ctx.git.branchExists(ctx.projectDir, tree.branch) || !integration || !await ctx.git.contains(ctx.projectDir, branch, integration.commit))
    throw new Blocked('commits', `Commits no recuperables en ${branch}`);
  const implementer = workers(filtered<Run>(ctx.db, 'runs', {taskId: task.id})).filter(r => r.role !== 'revisor').at(-1);
  if (task.reviewApproved !== 1 || implementer?.state !== 'done') throw new Blocked('review', 'Falta la revisión aprobada o el run del responsable no terminó');
  const finished = ctx.db.prepare(`select max(seq) seq from events where type='run.finished' and json_extract(payload,'$.runId')=?`).get(implementer.id);
  if (Number(events!.seq) < Number(finished?.seq ?? 0)) throw new Blocked('integration', 'La integración es anterior a la última versión del responsable');
  const tests = filtered<TestRun>(ctx.db, 'test_runs', {taskId: task.id});
  if ((tests.length || task.acceptance.some(a => a.startsWith('check:'))) && !checkGate(ctx.db, task.id).ok)
    throw new Blocked('checks', (checkGate(ctx.db, task.id) as {reason: string}).reason);
}

export function createFinalize(deps: FinalizeDeps = {}): Handler {
  return async (command, ctx) => {
    const payload = command.payload as {taskId?: unknown};
    if (typeof payload.taskId !== 'string') throw new Error('invalid_command_payload');
    let task = requireTask(ctx.db, payload.taskId);
    if (task.state !== 'cerrando') throw new Error('invalid_transition');
    const tree = task.worktreeId ? read<Worktree>(ctx.db, 'worktrees', task.worktreeId) : undefined;
    let {run} = commandRun(ctx, command, {title: `Cerrar ${task.title}`, provider: 'nomos', role: 'integrador', taskId: task.id});
    const decision = commandDecision(ctx, task, command);
    if (decision?.state === 'open') return {deferred: true, reason: `Esperando decisión: ${decision.reason}`};
    const discard = decision?.state === 'resolved' && decision.chosenOptionId === 'discard';
    if (decision?.state === 'resolved' && decision.chosenOptionId !== 'discard') {
      if (decision.chosenOptionId === 'commit') {
        const implementer = workers(filtered<Run>(ctx.db, 'runs', {taskId: task.id})).filter(r => r.role !== 'revisor').at(-1)!;
        enqueue(ctx.db, 'worker.send', {runId: implementer.id, text: `Antes de cerrar quedaron cambios sin registrar en tu worktree. `
          + `Commitéalos con un mensaje claro y termina con NOMOS_DONE.`}, `finalize.commit:${decision.id}`);
      } else setTaskWait(ctx.db, task.id, 'Cierre en espera: cambios sin registrar');
      finishRun(ctx.db, run.id, 'cancelled', decision.chosenOptionId === 'commit' ? 'Cambios devueltos al responsable' : 'Cierre en espera');
      return {closed: false};
    }
    const blocked = (condition: string, reason: string, extra: object = {}) => {
      setTaskWait(ctx.db, task.id, reason);
      appendEvent(ctx.db, 'task.closing_blocked', null, {taskId: task.id, runId: run.id, condition, reason, ...extra});
    };
    try {
      await verify(ctx, task, tree);
      // hito 25: un cierre de hito necesita que el usuario apruebe la build jugable; se le pide en «Por aprobar»
      // y el informe con sus lecciones, que van a Second Brain al cerrar
      const lessons = isClosingTask(task) ? await lessonsOf(ctx, task, tree) : null;
      if (isClosingTask(task) && !lessons) throw new Blocked('lessons', 'Faltan las lecciones');
      if (isClosingTask(task) && !playableApproved(ctx.db, ctx.dataDir, task.id)) { requestApproval(ctx.db, task); throw new Blocked('approval', noPlayableApproval); }
      // todos los worktrees temporales de la tarea: el del responsable y los de revisión («Descartar» los fuerza todos)
      const trees = filtered<Worktree>(ctx.db, 'worktrees', {taskId: task.id}).filter(t => t.state !== 'closed');
      // cambios sin registrar: se comprueba antes de cerrar terminales, para que el responsable aún pueda commitearlos
      const status = {clean: true, files: [] as string[]};
      for (const t of discard ? [] : trees) {
        const s = await ctx.git.status(t.path);
        if (!s.clean) { status.clean = false; status.files.push(...s.files); }
      }
      if (!status.clean) {
        const reason = `Cambios sin registrar: ${status.files.slice(0, 5).join(', ')}${status.files.length > 5 ? '…' : ''}`;
        blocked('worktree', reason, {files: status.files});
        openDecision(ctx.db, {taskId: task.id, reason, options,
          evidence: [{kind: 'command', ref: command.id}, ...status.files.slice(0, 50).map(ref => ({kind: 'file', ref}))]});
        return {deferred: true, reason: 'Esperando decisión: cambios sin registrar'};
      }
      const archive = await preserveTask(ctx, task, deps.writer);
      for (const r of workers(filtered<Run>(ctx.db, 'runs', {taskId: task.id})).filter(r => r.sessionRef)) {
        // cerrar el terminal mata el árbol del shell (un `node` de pruebas incluido); uno ya muerto no impide cerrar
        try { await ctx.orca.terminalClose(r.sessionRef!); }
        catch (error) { if (await ctx.orca.terminalAlive(r.sessionRef!)) throw new Blocked('processes', `No se pudo cerrar el terminal ${r.sessionRef}`); }
      }
      for (const t of trees) {
        try { await ctx.orca.worktreeRemove(t.id, discard); }
        catch (error) {
          if (!busy(error)) throw error;
          const attempts = (run.metadata.busyAttempts ?? 0) + 1;
          run = updateRun(ctx.db, run.id, {busyAttempts: attempts});
          if (attempts < 5) { blocked('worktree', 'Archivos en uso', {attempt: attempts}); return {deferred: true, reason: 'Archivos en uso', delayMs: deps.busyDelayMs ?? 30_000}; }
          throw new Blocked('worktree', 'Archivos en uso: cierra lo que los tenga abiertos y reintenta el cierre');
        }
        const discarded = discard;
        if (discarded) appendEvent(ctx.db, 'worktree.discarded', null, {taskId: task.id, worktreeId: t.id, by: decision!.resolvedBy, decisionId: decision!.id});
        ctx.db.prepare("update worktrees set state='closed',closed_reason=?,updated_at=? where id=?")
          .run(discarded ? `Descartado por ${decision!.resolvedBy}` : 'Cerrada', new Date().toISOString(), t.id);
      }
      task = requireTask(ctx.db, task.id);
      attribute(ctx.db, task.id, 'verifico', run);
      ctx.db.prepare('update tasks set archive_path=?,wait_reason=null where id=?').run(storedPath(ctx.dataDir, archive.dir), task.id);
      moveTask(ctx.db, task.id, 'done', 'Cierre verificado');
      finishRun(ctx.db, run.id, 'done', 'Cierre verificado');
      appendEvent(ctx.db, 'task.done', null, {taskId: task.id, runId: run.id, archive: archive.dir, files: Object.keys(archive.manifest.files).length});
      // hito 25: las lecciones quedan en la run de cierre (para la reanudación) y en Second Brain
      if (lessons) { updateRun(ctx.db, run.id, {lessons: lessons.lines}); await saveLessons(ctx, command, task, run, lessons); }
      try { writeResume(ctx.db, ctx.dataDir, 'en marcha'); } catch { /* sin reanudación el cierre vale igual */ }
      return {closed: true, archive: archive.dir};
    } catch (error) {
      const reason = error instanceof Blocked ? error.message
        : error instanceof Error && error.message === 'archive_no_space' ? 'No se pudo preservar: espacio insuficiente'
        : `No se pudo cerrar: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`;
      blocked(error instanceof Blocked ? error.condition : error instanceof Error && error.message === 'archive_no_space' ? 'archive' : 'error', reason);
      finishRun(ctx.db, run.id, 'failed', reason);
      return {closed: false, reason};
    }
  };
}
