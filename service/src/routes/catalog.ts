import { existsSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, sep } from 'node:path';
import { json } from '../http.ts';
import { listCatalog, searchCatalog } from '../repo/catalog.ts';
import { read } from '../repo/rows.ts';
import { assetConfig } from '../catalog/paths.ts';
import type { CatalogEntry } from '../model.ts';
import { choice, id, type Context } from './context.ts';

const images: Record<string, string> = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp'};
/** Las miniaturas son rutas locales: el panel recibe una URL del propio servicio, nunca la ruta del disco. */
const withUrl = (entry: CatalogEntry) => ({...entry,
  thumbnailUrl: entry.thumbnailPath && existsSync(entry.thumbnailPath) ? `/catalog/${encodeURIComponent(entry.id)}/thumbnail` : null});

/** Solo se sirven imágenes dentro de las carpetas que indexa el catálogo o de los artefactos del servicio. */
async function thumbnail(res: Context['res'], dataDir: string | undefined, path: string | null): Promise<void> {
  if (!path || path.includes('\0')) throw new Error('unknown_file');
  const type = images[extname(path).toLowerCase()];
  if (!type) throw new Error('invalid_thumbnail_path');
  const config = assetConfig(dataDir ?? '.');
  const roots = [config.projectsDir, config.vaultDir, config.megascansDir, ...config.fabCacheDirs,
    ...(dataDir ? [`${dataDir}${sep}artifacts`] : [])];
  let actual: string;
  try { actual = await realpath(path); } catch { throw new Error('unknown_file'); }
  const allowed = await Promise.all(roots.map(root => realpath(root).then(real => {
    const rel = relative(real, actual);
    return !!rel && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
  }, () => false)));
  if (!allowed.some(Boolean)) throw new Error('invalid_thumbnail_path');
  if ((await stat(actual)).size > 5 * 1024 * 1024) throw new Error('invalid_thumbnail_size');
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
  res.writeHead(200, {'Content-Type': type});
  res.end(await readFile(actual));
}

export async function catalog({db, req, res, url, dataDir}: Context): Promise<boolean> {
  if (req.method !== 'GET') return false;
  const match = /^\/catalog\/([^/]+)(\/thumbnail)?$/.exec(url.pathname);
  if (match) {
    const entry = read<CatalogEntry>(db, 'catalog_entries', id(match[1]));
    if (!entry) throw new Error('unknown_catalog_entry');
    if (match[2]) await thumbnail(res, dataDir, entry.thumbnailPath);
    else json(res, 200, withUrl(entry));
    return true;
  }
  if (url.pathname !== '/catalog') return false;
  const source = choice(url.searchParams.get('source'), [
    'fab', 'megascans', 'polyhaven', 'ambientcg', 'kenney', 'quaternius',
    'sketchfab', 'freesound', 'meshy', 'blender', 'engine'
  ]);
  const state = choice(url.searchParams.get('state'), ['owned', 'downloaded', 'cached', 'imported']);
  const q = url.searchParams.get('q')?.trim();
  const filter = {source, state};
  json(res, 200, (q ? searchCatalog(db, q, filter) : listCatalog(db, filter)).map(withUrl));
  return true;
}
