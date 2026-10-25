import type { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join, posix, win32 } from 'node:path';
import { appendEvent } from './store.ts';
import { transaction } from './repo/rows.ts';
import { writeLog } from './log.ts';

/** `C:\…\artifacts\tests\u\a.png` o `/…/artifacts/…` de una carpeta que ya no existe → la parte tras `/<folder>/`
 *  si existe bajo `<dataDir>/<folder>`; undefined si no hay reubicado. Prueba cada aparición del segmento. */
function relocated(dataDir: string, folder: string, path: string): string | undefined {
  const flat = path.replaceAll('\\', '/'), segment = `/${folder}/`;
  for (let at = flat.toLowerCase().indexOf(segment); at >= 0; at = flat.toLowerCase().indexOf(segment, at + 1)) {
    const rest = flat.slice(at + segment.length);
    if (rest && existsSync(join(dataDir, folder, rest))) return rest;
  }
  return undefined;
}

/** Hito 15: bases de antes guardaban rutas absolutas; si la carpeta de datos se movió (renombrar el proyecto,
 *  `.kratos` → `.nomos`) se reescriben como relativas. Nunca toca una ruta cuyo archivo existe ni una sin reubicado. */
export function repairArtifactPaths(db: DatabaseSync, dataDir: string): {rewritten: number; missing: number} {
  let rewritten = 0, missing = 0;
  const fix = (value: unknown, folder: string, stored: (rest: string) => string): string | undefined => {
    if (typeof value !== 'string' || !(win32.isAbsolute(value) || posix.isAbsolute(value)) || existsSync(value)) return undefined;
    const rest = relocated(dataDir, folder, value);
    if (rest === undefined) { missing++; return undefined; }
    rewritten++;
    return stored(rest);
  };
  transaction(db, () => {
    for (const row of db.prepare('select id,path,preview_path from artifacts').all()) {
      const path = fix(row.path, 'artifacts', rest => rest), preview = fix(row.preview_path, 'artifacts', rest => rest);
      if (path !== undefined) db.prepare('update artifacts set path=? where id=?').run(path, row.id as string);
      if (preview !== undefined) db.prepare('update artifacts set preview_path=? where id=?').run(preview, row.id as string);
    }
    for (const row of db.prepare('select id,archive_path from tasks where archive_path is not null').all()) {
      const archive = fix(row.archive_path, 'archive', rest => `archive/${rest}`);
      if (archive !== undefined) db.prepare('update tasks set archive_path=? where id=?').run(archive, row.id as string);
    }
    if (rewritten) appendEvent(db, 'artifacts.repaired', null, {rewritten, missing});
  });
  if (rewritten) writeLog(dataDir, {event: 'artifacts_repaired', rewritten, missing});
  return {rewritten, missing};
}
