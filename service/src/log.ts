import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

export const keepDays = 14;
const pad = (n: number) => String(n).padStart(2, '0');
/** Día local (`YYYY-MM-DD`): el archivo cambia a medianoche del equipo. */
export const logDay = (at: Date) => `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;

/** Log JSONL en `<dataDir>/logs/<día>.jsonl`: una línea síncrona por registro; al abrir un día nuevo se borran los de más de 14 días. */
export function writeLog(dataDir: string, record: Record<string, unknown>, now = new Date()): void {
  const dir = join(dataDir, 'logs'), file = join(dir, `${logDay(now)}.jsonl`);
  const fresh = !existsSync(file);
  if (fresh) mkdirSync(dir, {recursive: true});
  appendFileSync(file, JSON.stringify({at: now.toISOString(), ...record}) + '\n', 'utf8');
  if (!fresh) return;
  const oldest = logDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - keepDays));
  for (const name of readdirSync(dir))
    if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name) && name.slice(0, 10) < oldest) rmSync(join(dir, name), {force: true});
}

const folders = new WeakMap<DatabaseSync, string | null>();
/** Carpeta de datos de una base en disco; `null` para `:memory:`. */
function folderOf(db: DatabaseSync): string | null {
  if (!folders.has(db)) {
    const file = db.prepare('pragma database_list').all().find(row => row.name === 'main')?.file as string | undefined;
    folders.set(db, file ? dirname(file) : null);
  }
  return folders.get(db)!;
}

/** Nunca bloquea ni rompe el evento que lo origina: un disco lleno o una carpeta borrada se ignoran. */
export function logEvent(db: DatabaseSync, record: Record<string, unknown>): void {
  try {
    const dir = folderOf(db);
    if (dir) writeLog(dir, record);
  } catch { /* el log es auxiliar */ }
}
