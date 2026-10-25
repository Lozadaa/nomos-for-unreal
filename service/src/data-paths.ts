import type { DatabaseSync } from 'node:sqlite';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** La carpeta de la base abierta (en producción, la carpeta de datos); undefined en memoria. */
export function databaseDirectory(db: DatabaseSync): string | undefined {
  const row = db.prepare('pragma database_list').all().find(row => row.name === 'main');
  return row?.file ? dirname(row.file as string) : undefined;
}

/** Lo que se guarda en la base: relativa a `base` (con `/`) si cae dentro, para que la carpeta de datos pueda moverse
 *  (renombrar el proyecto, otro disco, otro equipo); fuera de `base`, tal cual. */
export function storedPath(base: string | undefined, path: string): string {
  if (!base || !isAbsolute(path)) return path;
  const rel = relative(resolve(base), resolve(path));
  return !rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel) ? path : rel.split(sep).join('/');
}

/** Al revés: una ruta guardada relativa cuelga de `base`; una absoluta se usa tal cual. */
export const locatedPath = (base: string, path: string) => isAbsolute(path) ? path : join(base, path);
