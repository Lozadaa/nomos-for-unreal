import { existsSync, readdirSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import type { WorkerContext } from '../runner.ts';
import type { CatalogEntry, Command, Run, Task } from '../model.ts';
import { read } from '../repo/rows.ts';
import { createTask, requireTask } from '../repo/tasks.ts';
import { startRun } from '../repo/runs.ts';
import { assetConfig } from '../catalog/paths.ts';

export type Project = {dir: string; uproject: string; name: string};

/** Proyecto destino: ruta absoluta, nombre dentro de `projectsDir`, o el juego (`ctx.projectDir`) por defecto. */
export function targetProject(ctx: WorkerContext, target?: unknown): Project {
  const dir = typeof target !== 'string' || !target.trim() ? ctx.projectDir
    : isAbsolute(target) ? resolve(target) : join(assetConfig(ctx.dataDir).projectsDir, target);
  let file: string | undefined;
  try { file = readdirSync(dir).find(name => name.toLowerCase().endsWith('.uproject')); } catch { file = undefined; }
  if (!file) throw new Error('invalid_target_project');
  return {dir, uproject: join(dir, file), name: basename(file, '.uproject')};
}

export function requireEntry(ctx: WorkerContext, entryId: unknown): CatalogEntry {
  const entry = typeof entryId === 'string' ? read<CatalogEntry>(ctx.db, 'catalog_entries', entryId) : undefined;
  if (!entry) throw new Error('invalid_catalog_entry');
  return entry;
}

/** Tarea y run de una orden de assets; un reintento o un diferido de la misma orden reutiliza los suyos. */
export function commandRun(ctx: WorkerContext, command: Command, make: {title: string; provider: Run['provider']; role: string;
  state?: Task['state']; metadata?: Run['metadata']; taskId?: string}): {task: Task; run: Run} {
  const row = ctx.db.prepare(`select id from runs where json_extract(metadata,'$.commandId')=? order by rowid desc limit 1`).get(command.id);
  const last = row ? read<Run>(ctx.db, 'runs', row.id as string)! : undefined;
  if (last?.state === 'running') return {task: requireTask(ctx.db, last.taskId), run: last};
  // `taskId`: la orden trabaja sobre una tarea existente (integrar, cerrar) en vez de crear la suya
  const task = last ? requireTask(ctx.db, last.taskId) : make.taskId ? requireTask(ctx.db, make.taskId)
    : createTask(ctx.db, {title: make.title, area: 'assets', state: make.state ?? 'probando', assigneeRole: make.role, assigneeProvider: make.provider});
  const run = startRun(ctx.db, {taskId: task.id, role: make.role, provider: make.provider,
    attempt: (last?.attempt ?? 0) + 1, metadata: {...make.metadata, commandId: command.id}});
  return {task, run};
}

export const exists = (path: string | null | undefined): path is string => !!path && existsSync(path);
