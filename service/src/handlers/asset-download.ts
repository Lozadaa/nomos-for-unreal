import { randomUUID } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Handler } from '../runner.ts';
import { launcher as realLauncher, parseCompletion, tailLog, type Launcher } from '../adapters/launcher.ts';
import { assetConfig, type AssetConfig } from '../catalog/paths.ts';
import { indexAll } from '../catalog/indexer.ts';
import { packDir, subdirs } from '../catalog/sources/fs.ts';
import { enqueue } from '../commands.ts';
import { openDecision } from '../repo/decisions.ts';
import { createTask, moveTask, setTaskWait } from '../repo/tasks.ts';
import { appendEvent } from '../store.ts';
import { requireEntry } from './asset-run.ts';

export type DownloadDeps = {launcher?: Launcher; now?: () => number};
type Detail = {taskId: string; instructions: string; logOffset: number; before: string[]; fabApps: string[];
  signature: string; changedAt: number};
export type Download = {id: string; entryId: string; targetProject: string | null; state: string;
  requestedAt: string; completedAt: string | null; detail: Detail};

const quiet = 30_000, limit = 20 * 60_000;
export function readDownload(db: DatabaseSync, id: string): Download | undefined {
  const row = db.prepare(`select id, entry_id entryId, target_project targetProject, state, requested_at requestedAt,
    completed_at completedAt, detail from downloads where id=?`).get(id);
  return row ? {...row, detail: JSON.parse(row.detail as string)} as Download : undefined;
}
function save(db: DatabaseSync, id: string, changes: {state?: string; completedAt?: string; detail: Detail}): void {
  db.prepare(`update downloads set state=coalesce(?,state), completed_at=coalesce(?,completed_at), detail=?, updated_at=? where id=?`)
    .run(changes.state ?? null, changes.completedAt ?? null, JSON.stringify(changes.detail), new Date().toISOString(), id);
}

/** Packs de VaultCache (`<App>/<Pack>`), sin StarterContent ni carpetas `__*`: nunca cuentan como el pack pedido. */
function vaultPacks(config: AssetConfig): string[] {
  return subdirs(config.vaultDir).flatMap(app => subdirs(join(config.vaultDir, app, 'data', 'Content')).filter(packDir).map(p => `${app}/${p}`));
}
function weight(dir: string): number {
  try { return readdirSync(dir, {recursive: true, withFileTypes: true}).reduce((n, d) => n + (d.isFile() ? statSync(join(d.parentPath, d.name)).size + 1 : 0), 0); }
  catch { return 0; }
}
function signature(config: AssetConfig, fresh: string[]): string {
  let mtime = 0;
  try { mtime = statSync(config.listingsDb).mtimeMs; } catch { mtime = 0; }
  return JSON.stringify([mtime, ...fresh.map(p => [p, weight(join(config.vaultDir, p.split('/')[0], 'data', 'Content', p.split('/')[1]))])]);
}

export function instructions(title: string, quarantine: string): string {
  return `Fab › My Library › busca "${title}" › + en la tarjeta › elige el proyecto ${quarantine} › Add to Project; `
    + 'si dice "No compatible user projects", Show all projects y elige 5.4';
}

export function createRequestDownload(deps: DownloadDeps = {}): Handler {
  return async (command, ctx) => {
    const payload = command.payload as {entryId?: unknown; targetProject?: unknown};
    const entry = requireEntry(ctx, payload.entryId);
    const config = assetConfig(ctx.dataDir);
    if (!config.quarantineProject) throw new Error('invalid_quarantine_project');
    const open = ctx.db.prepare("select id from downloads where entry_id=? and state='pending'").get(entry.id);
    if (open) return {downloadId: open.id, existing: true};
    // el Launcher escribe fuera de la carpeta del pack (StarterContent): siempre al proyecto cuarentena, luego nivel 1
    const text = instructions(entry.name, basename(config.quarantineProject));
    const task = createTask(ctx.db, {title: `Descargar ${entry.name} desde Fab`, area: 'assets', assigneeRole: 'arte', assigneeProvider: 'nomos'});
    setTaskWait(ctx.db, task.id, 'Esperando al Launcher');
    const now = (deps.now ?? Date.now)(), id = randomUUID(), iso = new Date(now).toISOString();
    let logOffset = 0;
    try { logOffset = statSync(config.launcherLogPath).size; } catch { logOffset = 0; }
    // solo cuenta lo que el Launcher escriba y descargue a partir de ahora
    const detail: Detail = {taskId: task.id, instructions: text, logOffset, before: vaultPacks(config), fabApps: [], signature: '', changedAt: now};
    ctx.db.prepare(`insert into downloads(id,created_at,updated_at,entry_id,target_project,state,requested_at,detail)
      values(?,?,?,?,?,'pending',?,?)`).run(id, iso, iso, entry.id, typeof payload.targetProject === 'string' ? payload.targetProject : null, iso, JSON.stringify(detail));
    (deps.launcher ?? realLauncher).openFab();
    appendEvent(ctx.db, 'download.requested', null, {downloadId: id, entryId: entry.id, taskId: task.id, instructions: text});
    enqueue(ctx.db, 'asset.detect', {downloadId: id}, `detect:${id}`, {notBefore: new Date(Date.now() + 5000).toISOString()});
    return {downloadId: id, instructions: text};
  };
}

export function createDetect(deps: DownloadDeps = {}): Handler {
  return async (command, ctx) => {
    const download = readDownload(ctx.db, String((command.payload as {downloadId?: unknown}).downloadId));
    if (!download) throw new Error('invalid_download');
    if (download.state !== 'pending') return {state: download.state};
    const config = assetConfig(ctx.dataDir), now = (deps.now ?? Date.now)(), detail = {...download.detail};
    const log = tailLog(config.launcherLogPath, detail.logOffset);
    const completion = parseCompletion(log.lines, detail.fabApps);
    detail.logOffset = log.offset; detail.fabApps = completion.fabApps;
    const fresh = vaultPacks(config).filter(p => !detail.before.includes(p));
    const sig = signature(config, fresh);
    if (sig !== detail.signature) { detail.signature = sig; detail.changedAt = now; }
    const settled = fresh.length > 0 && now - detail.changedAt >= quiet;
    if (completion.done || settled) {
      save(ctx.db, download.id, {state: 'completed', completedAt: new Date(now).toISOString(), detail});
      const indexed = indexAll(ctx.db, config);
      const payload = {entryId: download.entryId, ...(download.targetProject ? {targetProject: download.targetProject} : {})};
      enqueue(ctx.db, 'asset.migrate', payload, `migrate:${download.entryId}:${download.targetProject ?? 'juego'}`);
      setTaskWait(ctx.db, detail.taskId, null);
      moveTask(ctx.db, detail.taskId, 'cerrando'); moveTask(ctx.db, detail.taskId, 'done');
      appendEvent(ctx.db, 'download.completed', null, {downloadId: download.id, entryId: download.entryId,
        by: completion.done ? 'log' : 'vaultcache', appName: completion.appName ?? fresh[0]?.split('/')[0], packs: fresh, entries: indexed.entries});
      return {state: 'completed', by: completion.done ? 'log' : 'vaultcache'};
    }
    if (now - Date.parse(download.requestedAt) >= limit) {
      save(ctx.db, download.id, {state: 'timeout', detail});
      setTaskWait(ctx.db, detail.taskId, null);
      openDecision(ctx.db, {taskId: detail.taskId, reason: 'La descarga de Fab no llegó en 20 minutos',
        evidence: [{kind: 'download', ref: download.id}],
        options: [{id: 'retry', label: 'Reintentar', description: 'Volver a abrir Fab y esperar otros 20 minutos'},
          {id: 'cancel', label: 'Cancelar', description: 'Buscar otra opción en el catálogo'}]});
      appendEvent(ctx.db, 'download.timeout', null, {downloadId: download.id, entryId: download.entryId});
      return {state: 'timeout'};
    }
    save(ctx.db, download.id, {detail});
    return {deferred: true, reason: 'Esperando al Launcher'};
  };
}
