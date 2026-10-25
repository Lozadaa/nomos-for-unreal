import type { WorkerContext } from './runner.ts';
import type { Run, Task } from './model.ts';
import { runTree } from './repo/worker.ts';
import { moveTask, requireTask } from './repo/tasks.ts';
import { enqueue } from './commands.ts';
import { appendEvent } from './store.ts';
import { targetBranch } from './integration/workspace.ts';

/** La punta de la rama objetivo (main) y si `dir` ya la contiene; `null` si el adaptador no sabe (dobles de prueba). */
async function mainOf(ctx: WorkerContext, dir: string, branch: string): Promise<{target: string; tip: string; behind: boolean} | null> {
  if (!ctx.git.tip) return null;
  const target = await targetBranch(ctx), tip = await ctx.git.tip(ctx.projectDir, target);
  return {target, tip, behind: !await ctx.git.contains(dir, branch, tip)};
}

/**
 * Hito 22: el árbol recién creado (sin trabajo propio) se pone en la punta de main si Orca lo sacó de una base vieja;
 * `worktree.rebased {taskId, from, to}`.
 */
export async function fromMain(ctx: WorkerContext, taskId: string, path: string): Promise<void> {
  const branch = await ctx.git.currentBranch(path), main = branch ? await mainOf(ctx, path, branch) : null;
  if (!main?.behind || !ctx.git.resetHard) return;
  const from = await ctx.git.head(path);
  await ctx.git.resetHard(path, main.tip);
  appendEvent(ctx.db, 'worktree.rebased', null, {taskId, from, to: main.tip});
}

/** Antes de abrir la revisión: si a la rama del responsable le falta main, se le pide la fusión y la tarea vuelve a implementando. */
export async function askMerge(ctx: WorkerContext, task: Task, implementer: Run): Promise<boolean> {
  const tree = runTree(ctx.db, implementer), main = await mainOf(ctx, tree.path, tree.branch);
  if (!main?.behind) return false;
  const text = `Antes de la revisión falta lo último de ${main.target}. En tu árbol ejecuta \`git merge ${main.target}\`, `
    + 'resuelve los conflictos si los hay, comprueba que todo sigue en verde, commitea y repite NOMOS_DONE.';
  enqueue(ctx.db, 'worker.send', {runId: implementer.id, text}, `review.needs_main:${implementer.id}:${main.tip}`);
  if (['revisando', 'probando'].includes(requireTask(ctx.db, task.id).state)) moveTask(ctx.db, task.id, 'implementando', `Falta fusionar ${main.target}`);
  appendEvent(ctx.db, 'review.needs_main', null, {taskId: task.id, runId: implementer.id, target: main.target, tip: main.tip});
  return true;
}
