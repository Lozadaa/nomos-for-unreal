import type { Handler, WorkerContext } from '../runner.ts';
import type { Command, Decision, Run, Task, Worktree } from '../model.ts';
import { read } from '../repo/rows.ts';
import { moveTask, requireTask } from '../repo/tasks.ts';
import { finishRun } from '../repo/runs.ts';
import { updateRun } from '../repo/worker.ts';
import { openDecision } from '../repo/decisions.ts';
import { release } from '../leases.ts';
import { enqueue } from '../commands.ts';
import { appendEvent } from '../store.ts';
import { integrationWorkspace } from './workspace.ts';

/** Hito 5b: un archivo de más de 10 MB, o más de 100 MB en total, es contenido pesado. */
export const heavyFile = 10 * 2 ** 20, heavyTotal = 100 * 2 ** 20;
/** Cuota gratuita de LFS de GitHub (1 GB): se avisa si no hay remoto o el remoto es GitHub. */
const githubQuota = 2 ** 30;
const options = {
  configure: {id: 'lfs', label: 'Configurar Git LFS', recommended: true, description: ''},
  plain: {id: 'nolfs', label: 'Integrar sin LFS', description: ''},
  cancel: {id: 'cancel', label: 'Cancelar', description: 'No integrar: la tarea vuelve a probando'},
};
const ids = Object.values(options).map(o => o.id);
const mb = (bytes: number) => `${Math.round(bytes / 2 ** 20).toLocaleString('es-ES')} MB`;
export const isLfsDecision = (decision: Decision) => decision.options.length > 0 && decision.options.every(o => ids.includes(o.id));

/** Lo que la rama del responsable metería en la historia como blobs completos (los punteros LFS no cuentan), o null. */
export async function heavyContent(ctx: WorkerContext, dir: string, tree: Worktree) {
  const blobs = await ctx.git.blobSizes(dir, tree.baseCommit, tree.branch);
  const bytes = blobs.reduce((sum, b) => sum + b.size, 0), big = blobs.filter(b => b.size > heavyFile).length;
  return big || bytes > heavyTotal ? {files: blobs.length, big, bytes} : null;
}

async function ask(ctx: WorkerContext, command: Command, task: Task, run: Run, ws: {dir: string; branch: string}, heavy: {files: number; big: number; bytes: number}) {
  const version = await ctx.git.lfsVersion(ctx.projectDir), remote = await ctx.git.hasRemote(ctx.projectDir);
  const quota = (!remote.any || remote.github) && heavy.bytes > githubQuota
    ? ` ${remote.any ? 'El remoto es GitHub' : 'Sin remoto'}: si se publica en GitHub, su cuota gratuita de LFS es de 1 GB y esto ocupa ${mb(heavy.bytes)}.` : '';
  const choices = [
    ...(version ? [{...options.configure, description: `.gitattributes con los patrones de Unreal en ${ws.branch} y la rama del responsable `
      + `pasada a LFS (git-lfs ${version}, sin reescribir ${ws.branch}); después se integra como siempre.${quota}`}] : []),
    {...options.plain, description: `Los ${mb(heavy.bytes)} entran como binarios en la historia de git del proyecto, para siempre.`},
    options.cancel];
  release(ctx.db, run.id);
  openDecision(ctx.db, {taskId: task.id, options: choices,
    reason: `Contenido pesado (${mb(heavy.bytes)}): ${heavy.files} archivos, ${heavy.big} de más de 10 MB${version ? '' : '; git-lfs no está instalado'}`,
    evidence: [{kind: 'command', ref: command.id}]});
  return {deferred: true, reason: 'Esperando decisión: contenido pesado'};
}

/** Puerta de LFS antes del merge. `null`: seguir integrando; si no, lo que devuelve el integrador. */
export async function lfsGate(ctx: WorkerContext, command: Command, task: Task, run: Run, ws: {dir: string; branch: string},
  tree: Worktree, decision: Decision | undefined): Promise<Record<string, unknown> | null> {
  const mode = run.metadata.lfs;
  if (mode === 'sin' || mode === 'listo') return null;
  if (mode === 'configurando') {
    const lfs = read<Command>(ctx.db, 'commands', enqueue(ctx.db, 'integrate.lfs', {taskId: task.id}, `integrate.lfs:${run.id}`).id)!;
    if (lfs.state === 'pending' || lfs.state === 'running') return {deferred: true, reason: 'Configurando Git LFS'};
    if (lfs.state === 'done') { updateRun(ctx.db, run.id, {lfs: 'listo'}); return null; }
    const reason = `No se pudo configurar Git LFS: ${lfs.error ?? 'error desconocido'}`;
    release(ctx.db, run.id);
    appendEvent(ctx.db, 'integration.failed', null, {taskId: task.id, runId: run.id, reason});
    finishRun(ctx.db, run.id, 'failed', reason);
    moveTask(ctx.db, task.id, 'probando', reason);
    return {integrated: false};
  }
  if (decision?.state === 'resolved' && isLfsDecision(decision)) {
    if (decision.chosenOptionId === options.plain.id) { updateRun(ctx.db, run.id, {lfs: 'sin'}); return null; }
    if (decision.chosenOptionId === options.configure.id) {
      updateRun(ctx.db, run.id, {lfs: 'configurando'});
      return lfsGate(ctx, command, task, read<Run>(ctx.db, 'runs', run.id)!, ws, tree, decision);
    }
    release(ctx.db, run.id);
    finishRun(ctx.db, run.id, 'cancelled', 'Integración cancelada: contenido pesado');
    moveTask(ctx.db, task.id, 'probando', 'Integración cancelada: contenido pesado');
    return {cancelled: true};
  }
  const heavy = await heavyContent(ctx, ws.dir, tree);
  return heavy ? ask(ctx, command, task, run, ws, heavy) : null;
}

/**
 * `integrate.lfs` (carril largo): la rama del responsable pasa a LFS sin tocar la rama objetivo, y el mismo `.gitattributes`
 * entra antes en la rama objetivo (avanzando el checkout del usuario), para que el merge posterior no choque.
 */
export const integrateLfs: Handler = async (command, ctx) => {
  const payload = command.payload as {taskId?: unknown};
  if (typeof payload.taskId !== 'string') throw new Error('invalid_command_payload');
  const task = requireTask(ctx.db, payload.taskId);
  const tree = task.worktreeId ? read<Worktree>(ctx.db, 'worktrees', task.worktreeId) : undefined;
  if (!tree) throw new Error('invalid_integration_target');
  const ws = await integrationWorkspace(ctx, true), started = Date.now();
  await ctx.git.lfsMigrate(tree.path, tree.branch, ws.branch);
  const attributes = await ctx.git.showFile(tree.path, tree.branch, '.gitattributes');
  if (!attributes) throw new Error('lfs_without_attributes');
  let commit: string | null = null;
  if (await ctx.git.showFile(ws.dir, 'HEAD', '.gitattributes') !== attributes) {
    const base = await ctx.git.head(ws.dir);
    commit = await ctx.git.commitFile(ws.dir, '.gitattributes', attributes, 'Git LFS para el contenido de Unreal');
    await ctx.git.advanceBranch(ctx.projectDir, ws.branch, commit, base);
  }
  appendEvent(ctx.db, 'integration.lfs', null, {taskId: task.id, branch: ws.branch, sourceBranch: tree.branch, commit,
    seconds: Math.round((Date.now() - started) / 1000)});
  return {configured: true, commit};
};

/** La rama objetivo solo cambió en `.gitattributes` (la configuración de LFS): no hace falta recomprobar el resultado. */
export async function onlyAttributes(ctx: WorkerContext, dir: string, from: string, to: string): Promise<boolean> {
  const files = await ctx.git.filesBetween(dir, from, to);
  return files.length > 0 && files.every(f => f === '.gitattributes');
}
