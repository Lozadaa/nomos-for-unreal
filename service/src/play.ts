import { spawn, type ChildProcess } from 'node:child_process';
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { writeAtomic } from './atomic.ts';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { readConfig } from './config.ts';
import { appendEvent } from './store.ts';
import { mainBranch, readBuildInfo, staleBuild, type BuildInfo } from './build-info.ts';

export type BuildTask = {id: string; code: string | null; title: string};
export type Build = {path: string; builtAt: string; size: number; task: BuildTask | null; check: string | null; testRunId: string | null;
  /** Hito 17: `build-info.json` junto al ejecutable; `stale` si su commit no contiene la punta de main. */
  origin: BuildInfo | null; commit?: string; stale?: boolean};
export type Running = {pid: number; since: string; path: string; builtAt: string};
type Candidate = {path: string; taskId?: string; testRunId?: string; check?: string};

const fold = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
const inside = (root: string, file: string) => {
  const rel = relative(fold(root), fold(file));
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
};
const dirs = (dir: string) => { try { return readdirSync(dir, {withFileTypes: true}).filter(e => e.isDirectory()).map(e => e.name); } catch { return []; } };

/** Carpeta y nombre del juego: el `.uproject` de la carpeta de datos o, lo habitual, de su padre. */
function gameOf(dataDir: string): {dir: string; name: string} | null {
  for (const dir of [dataDir, dirname(dataDir)]) {
    try {
      const file = readdirSync(dir).filter(n => n.toLowerCase().endsWith('.uproject')).sort()[0];
      if (file) return {dir, name: file.slice(0, -'.uproject'.length)};
    } catch { /* carpeta ilegible: se prueba la siguiente */ }
  }
  return null;
}

/** Fecha de la build: la del ejecutable o la del `.pak` más nuevo del paquete (cocinar contenido no siempre reescribe el `.exe`). */
function builtAt(exe: string, name: string): number {
  const roots = [join(dirname(exe), name), resolve(dirname(exe), '..', '..')];
  let newest = statSync(exe).mtimeMs;
  for (const paks of roots.map(r => join(r, 'Content', 'Paks')))
    try { for (const f of readdirSync(paks)) if (/\.(pak|utoc|ucas)$/i.test(f)) newest = Math.max(newest, statSync(join(paks, f)).mtimeMs); } catch { /* sin Paks */ }
  return newest;
}

export const taskCode = (title: string) => /^([A-Z]{1,4}\d+(?:\.\d+)*)\s/.exec(title)?.[1] ?? null;
function taskOf(db: DatabaseSync, c: Candidate): BuildTask | null {
  const taskId = c.taskId ?? (c.testRunId ? db.prepare('select task_id from test_runs where id=?').get(c.testRunId)?.task_id as string | undefined : undefined);
  const row = taskId ? db.prepare('select id,title from tasks where id=?').get(taskId) : undefined;
  return row ? {id: row.id as string, code: taskCode(row.title as string), title: row.title as string} : null;
}

/**
 * La build más reciente del juego: `Build/Windows-*`, los artefactos `build` de la base y los paquetes de las comprobaciones
 * en `<datos>/artifacts/tests/<id>/build/Windows/`. Solo cuenta un `<Proyecto>.exe` real bajo el proyecto o sus artefactos.
 */
export function latestBuild(dataDir: string, db: DatabaseSync): {build: Build | null; reason: string | null} {
  const game = gameOf(dataDir);
  if (!game) return {build: null, reason: 'No hay ningún .uproject en el proyecto'};
  const exe = `${game.name}.exe`, tests = join(dataDir, 'artifacts', 'tests');
  const candidates: Candidate[] = [
    ...dirs(join(game.dir, 'Build')).filter(d => d.toLowerCase().startsWith('windows')).map(d => ({path: join(game.dir, 'Build', d, exe)})),
    ...db.prepare("select task_id,path,provenance from artifacts where kind='build'").all().map(r => {
      const p = JSON.parse(r.provenance as string ?? '{}') ?? {};
      return {path: r.path as string, taskId: r.task_id as string, testRunId: p.testRunId, check: p.check};
    }),
    ...dirs(tests).flatMap(id => [join(tests, id, 'build', 'Windows', exe), join(tests, id, 'build', 'Windows', game.name, 'Binaries', 'Win64', exe)]
      .map(path => ({path, testRunId: id, check: 'build'})))];
  const roots = [game.dir, join(dataDir, 'artifacts')].flatMap(r => { try { return [realpathSync(r)]; } catch { return []; } });
  let best: {build: Build; at: number} | null = null;
  for (const c of candidates) {
    try {
      if (fold(c.path.split(/[\\/]/).at(-1)!) !== fold(exe)) continue;
      const real = realpathSync(c.path);
      if (!roots.some(r => inside(r, real)) || !statSync(real).isFile()) continue;
      const at = builtAt(real, game.name);
      if (best && at <= best.at) continue;
      best = {at, build: {path: c.path, builtAt: new Date(at).toISOString(), size: statSync(real).size, task: taskOf(db, c),
        check: c.check ?? null, testRunId: c.testRunId ?? null, origin: null}};
    } catch { /* no existe o ilegible */ }
  }
  return best ? {build: withOrigin(best.build, game.dir, dataDir), reason: null} : {build: null, reason: 'Todavía no hay ninguna build'};
}

function withOrigin(build: Build, repo: string, dataDir: string): Build {
  const origin = readBuildInfo(dirname(realpathSync(build.path)));
  if (!origin) return build;
  const main = mainBranch(repo, (readConfig(dataDir) as {targetBranch?: unknown}).targetBranch);
  const stale = main ? staleBuild(repo, main, origin.commit) : undefined;
  return {...build, origin, commit: origin.commit, ...(stale === undefined ? {} : {stale})};
}

/** Argumentos de `config.json: play`: `map` (/Game/…) primero y después `args` (por defecto ventana 1920×1080). */
export function playArgs(config: {play?: {map?: unknown; args?: unknown}}): string[] {
  const {map, args = ['-windowed', '-ResX=1920', '-ResY=1080']} = config.play ?? {};
  if ((map !== undefined && (typeof map !== 'string' || !/^\/Game\/[\w/.-]+$/.test(map)))
    || !Array.isArray(args) || args.some(a => typeof a !== 'string' || /[\r\n\0]/.test(a))) throw new Error('invalid_play_config');
  return [...(map ? [map as string] : []), ...args as string[]];
}

const state = new Map<string, {child?: ChildProcess; running: Running}>();
const stateFile = (dataDir: string) => join(dataDir, 'play.json');
type Saved = {running?: Running | null; lastPlayedBuiltAt?: string | null};
const saved = (dataDir: string): Saved => { try { return JSON.parse(readFileSync(stateFile(dataDir), 'utf8')); } catch { return {}; } };
const save = (dataDir: string, value: Saved) => writeAtomic(stateFile(dataDir), JSON.stringify({...saved(dataDir), ...value}));
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

function finish(db: DatabaseSync, dataDir: string, pid: number, reason: 'exited' | 'stopped'): void {
  const current = state.get(dataDir)?.running ?? saved(dataDir).running;
  if (!current || current.pid !== pid) return;
  state.delete(dataDir); save(dataDir, {running: null});
  appendEvent(db, 'play.stopped', null, {pid, reason});
}

/** La partida viva: la que lanzó este servicio o, tras reiniciarlo, la de `play.json` si su pid sigue vivo. */
// ponytail: un pid reutilizado por otro proceso tras reiniciar el servicio se tomaría por la partida; guardar la hora de arranque del proceso si molesta
export function running(db: DatabaseSync, dataDir: string): Running | null {
  const current = state.get(dataDir)?.running ?? saved(dataDir).running ?? null;
  if (current && !state.get(dataDir)?.child && !alive(current.pid)) { finish(db, dataDir, current.pid, 'exited'); return null; }
  return current;
}

export function playStatus(db: DatabaseSync, dataDir: string) {
  return {...latestBuild(dataDir, db), running: running(db, dataDir), lastPlayedBuiltAt: saved(dataDir).lastPlayedBuiltAt ?? null};
}

/** Lanza la última build desprendida (no muere con el servicio) con la carpeta del ejecutable como directorio de trabajo. */
export function play(db: DatabaseSync, dataDir: string): {running: Running} {
  const live = running(db, dataDir);
  if (live) throw Object.assign(new Error('already_running'), {pid: live.pid});
  const {build, reason} = latestBuild(dataDir, db);
  if (!build) throw Object.assign(new Error('no_build'), {reason});
  const args = playArgs(readConfig(dataDir) as Parameters<typeof playArgs>[0]);
  const child = spawn(build.path, args, {cwd: dirname(build.path), detached: true, stdio: 'ignore'});
  if (!child.pid) throw new Error('play_failed');
  child.unref();
  const now: Running = {pid: child.pid, since: new Date().toISOString(), path: build.path, builtAt: build.builtAt};
  state.set(dataDir, {child, running: now});
  save(dataDir, {running: now, lastPlayedBuiltAt: build.builtAt});
  child.once('exit', () => finish(db, dataDir, now.pid, 'exited'));
  appendEvent(db, 'play.started', null, {path: build.path, pid: now.pid, builtAt: build.builtAt, task: build.task});
  return {running: now};
}

/** Cierra la partida y su árbol de procesos (el lanzador de Unreal arranca el juego como hijo). */
export function stopPlay(db: DatabaseSync, dataDir: string): {running: null} {
  const live = running(db, dataDir);
  if (live) {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(live.pid), '/T', '/F'], {windowsHide: true, stdio: 'ignore'});
    else try { process.kill(-live.pid); } catch { try { process.kill(live.pid); } catch { /* ya terminó */ } }
    finish(db, dataDir, live.pid, 'stopped');
  }
  return {running: null};
}
