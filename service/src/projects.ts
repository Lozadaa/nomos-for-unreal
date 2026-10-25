import { existsSync, mkdirSync } from 'node:fs';
import { readJson, writeAtomic } from './atomic.ts';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { projectInfo } from './project-root.ts';
import { dbFile, legacyRegistry } from './legacy.ts';

/** `%LOCALAPPDATA%\nomos\projects.json` (copiado del registro anterior al renombrado la primera vez); `NOMOS_REGISTRY` lo cambia (pruebas, varios usuarios). */
export const registryFile = () => legacyRegistry();

export type Entry = {name: string; dir: string; dataDir: string; port: number; pid: number; startedAt: string};
export type ProjectCard = {name: string; dir: string; port: number; alive: boolean; current: boolean;
  liveTasks?: number; openDecisions?: number; hasCapture?: boolean};

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; } };
const same = (a: string, b: string) => process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);

function read(): Entry[] {
  const list = readJson<unknown>(registryFile(), []); return Array.isArray(list) ? list : [];
}
function write(list: Entry[]): void {
  const file = registryFile();
  mkdirSync(dirname(file), {recursive: true});
  writeAtomic(file, JSON.stringify(list, null, 2));
}

/** Al arrancar: este proyecto con su puerto y pid; fuera las entradas de procesos que ya no existen. Nunca el token. */
export function register(dataDir: string, port: number, pid = process.pid): void {
  const dir = dirname(resolve(dataDir)), name = projectInfo(dataDir)?.name ?? dir.split(/[\\/]/).pop() ?? dir;
  const list = read().filter(e => !same(e.dataDir, dataDir) && alive(e.pid));
  write([...list, {name, dir, dataDir: resolve(dataDir), port, pid, startedAt: new Date().toISOString()}]);
}
/** Al parar: fuera su entrada (solo si sigue siendo la suya). */
export function unregister(dataDir: string, pid = process.pid): void {
  const list = read();
  if (list.some(e => same(e.dataDir, dataDir) && e.pid === pid)) write(list.filter(e => !(same(e.dataDir, dataDir) && e.pid === pid)));
}

/** Lo que la portada enseña de cada proyecto, leído en solo lectura de su propia base: tareas vivas, Decisiones y si hay captura. */
function summary(dataDir: string): Pick<ProjectCard, 'liveTasks' | 'openDecisions' | 'hasCapture'> {
  const file = dbFile(dataDir);
  if (!existsSync(file)) return {};
  const db = new DatabaseSync(file, {readOnly: true});
  try {
    const count = (sql: string) => Number(db.prepare(sql).get()?.n ?? 0);
    return {liveTasks: count("select count(*) n from tasks where state not in ('done','pendiente')"),
      openDecisions: count("select count(*) n from decisions where state='open'"),
      hasCapture: !!latestCapture(db, dataDir)};
  } catch { return {}; } finally { db.close(); }
}
/** La captura más reciente que existe en disco; una ruta relativa es de `<datos>/artifacts` (como en la semilla). */
function latestCapture(db: DatabaseSync, dataDir: string): string | null {
  const path = db.prepare("select path from artifacts where kind='screenshot' order by created_at desc limit 1").get()?.path as string | undefined;
  const full = path && (isAbsolute(path) ? path : join(dataDir, 'artifacts', path));
  return full && existsSync(full) ? full : null;
}

/** La última captura de un proyecto registrado (para la portada); null si no hay. */
export function projectCapture(port: number): string | null {
  const entry = read().find(e => e.port === port && alive(e.pid));
  if (!entry || !existsSync(dbFile(entry.dataDir))) return null;
  const db = new DatabaseSync(dbFile(entry.dataDir), {readOnly: true});
  try { return latestCapture(db, entry.dataDir); } catch { return null; } finally { db.close(); }
}

/** `GET /projects`: los servicios vivos de esta máquina (el actual primero), sin tokens ni rutas de datos. */
export function listProjects(currentDataDir: string): ProjectCard[] {
  const entries = read();
  if (!entries.some(e => same(e.dataDir, currentDataDir))) {
    const dir = dirname(resolve(currentDataDir));
    entries.push({name: projectInfo(currentDataDir)?.name ?? dir, dir, dataDir: resolve(currentDataDir), port: 0, pid: process.pid, startedAt: ''});
  }
  // un servicio caído sin pasar por stop sigue en la lista como parado hasta el próximo arranque de cualquiera
  return entries.map(e => ({name: e.name, dir: e.dir, port: e.port, alive: same(e.dataDir, currentDataDir) || alive(e.pid), current: same(e.dataDir, currentDataDir), ...summary(e.dataDir)}))
    .sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name, 'es'));
}
