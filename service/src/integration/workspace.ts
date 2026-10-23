import { existsSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { WorkerContext } from '../runner.ts';
import { readConfig } from '../config.ts';
import { targetProject } from '../handlers/asset-run.ts';

/** Nombre del proyecto del juego (su `.uproject`), o la carpeta si no hay. */
export function projectName(ctx: WorkerContext): string {
  try { return targetProject(ctx).name; } catch { return basename(ctx.projectDir); }
}
/** Rama objetivo: `config.json: targetBranch` o la rama actual del juego. */
export async function targetBranch(ctx: WorkerContext): Promise<string> {
  const configured = (readConfig(ctx.dataDir) as {targetBranch?: unknown}).targetBranch;
  if (typeof configured === 'string' && configured.trim()) return configured.trim();
  const current = await ctx.git.currentBranch(ctx.projectDir);
  if (!current) throw new Error('invalid_target_branch');
  return current;
}
/** Workspace de integración del proyecto: `<dataDir>/integration/<proyecto>`, un `git worktree` en HEAD separada
 *  (la rama objetivo suele estar activa en el checkout del usuario, y Git no deja activarla dos veces).
 *  Nunca se retira con la tarea; cada integración parte de la punta de la rama objetivo. */
export async function integrationWorkspace(ctx: WorkerContext, fresh: boolean): Promise<{dir: string; branch: string; name: string}> {
  const name = projectName(ctx), branch = await targetBranch(ctx), dir = join(ctx.dataDir, 'integration', name);
  if (!existsSync(dir)) {
    mkdirSync(join(ctx.dataDir, 'integration'), {recursive: true});
    await ctx.git.worktreeAdd(ctx.projectDir, dir, branch);
  } else if (fresh) await ctx.git.checkout(dir, branch);
  return {dir, branch, name};
}
