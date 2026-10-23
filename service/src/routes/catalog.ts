import { json } from '../http.ts';
import { listCatalog, searchCatalog } from '../repo/catalog.ts';
import { choice, type Context } from './context.ts';

export async function catalog({db, req, res, url}: Context): Promise<boolean> {
  if (req.method !== 'GET' || url.pathname !== '/catalog') return false;
  const source = choice(url.searchParams.get('source'), [
    'fab', 'megascans', 'polyhaven', 'ambientcg', 'kenney', 'quaternius',
    'sketchfab', 'freesound', 'meshy', 'blender'
  ]);
  const state = choice(url.searchParams.get('state'), ['owned', 'downloaded', 'cached', 'imported']);
  const q = url.searchParams.get('q')?.trim();
  const filter = {source, state};
  json(res, 200, q ? searchCatalog(db, q, filter) : listCatalog(db, filter));
  return true;
}
