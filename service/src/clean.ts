import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Task, Worktree } from './model.ts';
import { filtered, read } from './repo/rows.ts';
import { mainBranch } from './build-info.ts';
import { readConfig } from './config.ts';
import { openDb } from './db.ts';
import { dbFile } from './legacy.ts';
import { createOrca } from './adapters/orca.ts';
import { measure, packagesOf, remove, size, within } from './retention.ts';
import { killTree, listServers, orphans, registeredData } from './orphans.ts';
import { tmpdir } from 'node:os';

/** Hito 19: `nomos clean [--dry-run]`. Nada cambiado en los últimos 30 min se toca (un paquete o un vídeo en marcha). */
export const quietMs = 30 * 60_000;
export type Item = {path: string; bytes: number; why: string};
export type Plan = {items: Item[]; trees: (Item & {id: string})[]; bytes: number};

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, {cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']});
const children = (dir: string) => existsSync(dir) ? readdirSync(dir, {withFileTypes: true}).filter(e => e.isDirectory()).map(e => join(dir, e.name)) : [];
const name = (p: string) => p.split(/[\\/]/).pop()!;
/** Sin cambios sin commit (Saved/, Build/ y lo de Nomos no cuentan, como en la revisión). */
function clean(path: string): boolean {
  try {
    return !git(path, 'status', '--porcelain', '--untracked-files=all').split('\n').filter(Boolean).map(l => l.slice(3))
      .some(f => !/^(Build|Saved|Intermediate|DerivedDataCache|Binaries)\/|^\.nomos/.test(f));
  } catch { return false; }
}
const merged = (repo: string, branch: string, main: string) => { try { git(repo, 'merge-base', '--is-ancestor', branch, main); return true; } catch { return false; } };

/** Los paquetes y vídeos de un árbol: los de `packagesOf`, `Build/Windows-*` (salvo `keep`) y `Saved/Video*`. */
function treeItems(tree: string, keep?: string): string[] {
  const builds = children(join(tree, 'Build')).filter(p => name(p).startsWith('Windows-'));
  const videos = children(join(tree, 'Saved')).filter(p => name(p).startsWith('Video'));
  return [...new Set([...packagesOf(tree), ...builds, ...videos])].filter(p => !keep || !within(p, keep));
}

export function planClean(opts: {dataDir: string; projectDir: string; db: DatabaseSync; now?: number}): Plan {
  const now = opts.now ?? Date.now(), items: Item[] = [], trees: Plan['trees'] = [];
  const quiet = (path: string, why: string): Item | null => {
    const m = measure(path);
    return now - m.newest >= quietMs ? {path, bytes: m.bytes, why} : null;
  };
  const add = (path: string, why: string) => { const item = quiet(path, why); if (item) items.push(item); };
  for (const dir of children(join(opts.dataDir, 'artifacts', 'tests'))) if (existsSync(join(dir, 'build'))) add(join(dir, 'build'), 'paquete de una comprobación');
  for (const path of treeItems(opts.projectDir, join(opts.projectDir, 'Build', 'Windows-actual'))) add(path, 'paquete o vídeo del proyecto');
  let registered: string[] = [];
  try { registered = git(opts.projectDir, 'worktree', 'list', '--porcelain').split(/\r?\n/).filter(l => l.startsWith('worktree ')).map(l => l.slice(9).trim()); } catch { /* sin git */ }
  for (const dir of children(join(opts.dataDir, 'integration')))
    if (!registered.some(r => within(r, dir) && within(dir, r))) add(dir, 'copia de integración que no es un worktree de Git');
  const main = mainBranch(opts.projectDir, (readConfig(opts.dataDir) as {targetBranch?: unknown}).targetBranch);
  // worktrees de Orca de tareas cerradas y sin cambios sin commit; se retiran enteros si su rama ya está en main
  for (const tree of filtered<Worktree>(opts.db, 'worktrees')) {
    const task = read<Task>(opts.db, 'tasks', tree.taskId);
    if (!existsSync(tree.path) || within(tree.path, opts.projectDir) || task?.state !== 'done' && tree.state !== 'closed' || !clean(tree.path)) continue;
    const whole = tree.state !== 'closed' && main && merged(opts.projectDir, tree.branch, main) ? quiet(tree.path, 'worktree de una tarea cerrada') : null;
    if (whole) trees.push({...whole, id: tree.id});
    else for (const path of treeItems(tree.path)) add(path, 'paquete o vídeo de un worktree cerrado');
  }
  return {items, trees, bytes: [...items, ...trees].reduce((n, i) => n + i.bytes, 0)};
}

/** Borra lo planeado; los worktrees los retira Orca (y quedan cerrados en la base). Devuelve los bytes liberados. */
export async function applyClean(plan: Plan, deps: {db: DatabaseSync; orca: {worktreeRemove(id: string, force?: boolean): Promise<void>}},
  log: (line: string) => void = () => {}): Promise<number> {
  let freed = 0;
  for (const item of plan.items) {
    try { remove(item.path); freed += item.bytes; } catch (error) { log(`No se pudo borrar ${item.path}: ${(error as Error).message}`); }
  }
  for (const tree of plan.trees) {
    try {
      await deps.orca.worktreeRemove(tree.id);
      deps.db.prepare("update worktrees set state='closed',closed_reason=?,updated_at=? where id=?").run('nomos clean', new Date().toISOString(), tree.id);
      freed += tree.bytes;
    } catch (error) { log(`Orca no retiró ${tree.path}: ${(error as Error).message}`); }
  }
  return freed;
}

const line = (i: Item) => `${size(i.bytes).padStart(9)}  ${i.path}  (${i.why})`;
/** `nomos clean [--dry-run] [--data CARPETA]`: lista con tamaños y el total liberado. */
export async function cleanCli(argv: string[]): Promise<boolean> {
  const words = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--data');
  if (words[0] !== 'clean') return false;
  if (words.length !== 1 || argv.some(a => a.startsWith('--') && !['--data', '--dry-run'].includes(a))) throw new Error('Uso: nomos clean [--dry-run]');
  const dataDir = resolve(argv[argv.indexOf('--data') + 1]), dry = argv.includes('--dry-run');
  mkdirSync(dataDir, {recursive: true});
  const db = openDb(dbFile(dataDir));
  try {
    const plan = planClean({dataDir, projectDir: dirname(dataDir), db});
    // hito 20: también los servicios de pruebas o aceptaciones que nadie paró
    const servers = orphans(listServers(), {tmp: tmpdir(), registered: registeredData(), now: Date.now(), quiet: quietMs,
      minAge: Number(process.env.NOMOS_CLEAN_MIN_AGE_MS ?? 10 * 60_000)});
    for (const item of [...plan.items, ...plan.trees]) console.log(line(item));
    for (const s of servers) console.log(`servidor ${s.pid}  ${s.data}  (${s.why})`);
    const n = plan.items.length + plan.trees.length, k = servers.length;
    if (dry) {
      console.log(`Se liberarían ${size(plan.bytes)} (${n} ${n === 1 ? 'carpeta' : 'carpetas'})`);
      if (k) console.log(`Se cerrarían ${k} ${k === 1 ? 'servidor huérfano' : 'servidores huérfanos'}`);
      return true;
    }
    for (const s of servers) { killTree(s.pid); console.log(`Cerrado el servidor ${s.pid}`); }
    const freed = await applyClean(plan, {db, orca: createOrca()}, console.log);
    console.log(`Liberados ${size(freed)}`);
  } finally { db.close(); }
  return true;
}
