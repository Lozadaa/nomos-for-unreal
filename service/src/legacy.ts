// Compatibilidad con el nombre anterior: Nomos for Unreal se llamó Kratos hasta el 2026-10-24.
// Retirar todo este archivo (y sus llamadas) a partir del 2026-11-24: ver docs/aceptacion-hito11.md.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { isAlive, readServiceInfo } from './service-info.ts';

/** `KRATOS_X` vale como `NOMOS_X` si este falta; devuelve los nombres viejos presentes para avisar de ellos. */
export function legacyEnv(env: Record<string, string | undefined> = process.env): string[] {
  const old = Object.keys(env).filter(name => name.startsWith('KRATOS_'));
  for (const name of old) env['NOMOS_' + name.slice(7)] ??= env[name];
  return old;
}

/** La base de una carpeta de datos: `nomos.db`, o la `kratos.db` que aún no se pudo renombrar (servicio viejo vivo). */
export function dbFile(dataDir: string): string {
  const fresh = join(dataDir, 'nomos.db'), old = join(dataDir, 'kratos.db');
  return !existsSync(fresh) && existsSync(old) ? old : fresh;
}

const running = async (dir: string) => { const info = readServiceInfo(dir); return !!info && await isAlive(info); };
/** Apunta la migración en `service.json`; `start` la conserva al reescribirlo. */
function note(dataDir: string, from: string): void {
  const file = join(dataDir, 'service.json');
  let info: Record<string, unknown> = {};
  try { info = JSON.parse(readFileSync(file, 'utf8')); } catch { /* sin service.json: se crea */ }
  writeFileSync(file, JSON.stringify({...info, migrated_from: from}), {mode: 0o600});
}
/** Lo que `start` debe conservar de un `service.json` anterior. */
export function migratedFrom(dataDir: string): string | undefined {
  try { return JSON.parse(readFileSync(join(dataDir, 'service.json'), 'utf8')).migrated_from; } catch { return undefined; }
}

/**
 * Carpeta de datos efectiva: `.nomos` que falta junto a una `.kratos` se migra (carpeta y base) si su servicio está parado;
 * si está vivo se sigue usando `.kratos` hasta el próximo arranque. Cualquier otra carpeta (`--data .kratos-hito5b-lfs`) conserva
 * su nombre y solo su `kratos.db` pasa a `nomos.db`.
 */
export async function dataDirFor(option = '.nomos'): Promise<string> {
  const dir = resolve(option), old = join(dirname(dir), '.kratos');
  if (basename(dir) === '.nomos' && !existsSync(dir) && existsSync(old)) {
    if (await running(old)) { console.warn(`Aviso: Kratos sigue en marcha en ${old}; páralo y el próximo arranque lo migra a .nomos`); return old; }
    try { renameSync(old, dir); note(dir, old); } catch { if (!existsSync(dir)) return old; }
  }
  const db = join(dir, 'kratos.db');
  if (existsSync(db) && !existsSync(join(dir, 'nomos.db')) && !await running(dir)) {
    try {
      for (const suffix of ['', '-wal', '-shm']) if (existsSync(db + suffix)) renameSync(db + suffix, join(dir, 'nomos.db' + suffix));
      note(dir, migratedFrom(dir) ?? db);
    } catch { /* abierta por otro proceso: dbFile sigue usando kratos.db */ }
  }
  return dir;
}

/** `%LOCALAPPDATA%\nomos\projects.json`; el de `%LOCALAPPDATA%\kratos` se copia la primera vez. `NOMOS_REGISTRY` manda. */
export function legacyRegistry(env: Record<string, string | undefined> = process.env): string {
  if (env.NOMOS_REGISTRY) return env.NOMOS_REGISTRY;
  const base = env.LOCALAPPDATA ?? join(homedir(), '.local', 'share'), file = join(base, 'nomos', 'projects.json');
  const old = join(base, 'kratos', 'projects.json');
  if (!existsSync(file) && existsSync(old)) try { mkdirSync(dirname(file), {recursive: true}); copyFileSync(old, file); } catch { /* sin copia: registro nuevo */ }
  return file;
}

/** Bases de antes del hito 11: el director y las tareas del propio servicio decían `kratos`; se escribe solo la primera vez. */
export function migrateBrand(db: DatabaseSync, widen: (table: string, column: string, value: string) => boolean): void {
  if (!widen('runs', 'provider', 'nomos')) return;
  db.exec(`update runs set provider='nomos' where provider='kratos';
    update tasks set assignee_provider='nomos' where assignee_provider='kratos';
    update decisions set resolved_by='nomos' where resolved_by='kratos';
    update tasks set attribution=replace(replace(attribution,'"kratos"','"nomos"'),'"Kratos"','"Nomos"') where attribution like '%"kratos"%'`);
}

/** Archivos locales del servicio en los worktrees de workers lanzados antes del hito 11: tampoco son trabajo del worker. */
export const legacyLocalPaths = ['.kratos', '.kratos-brief.md', '.kratos-inbox', '.kratos-review'];

/** Marca de las skills que Kratos copió a los juegos (`.kratos-skill.json`): siguen siendo copias propias, no cambios a mano. */
export const legacySkillMark = '.kratos-skill';

/** Ficha del personaje que Kratos dejó en la raíz de los juegos (versionada): se lee si falta la nueva. */
export const legacySpecFile = 'kratos-personaje.json';
