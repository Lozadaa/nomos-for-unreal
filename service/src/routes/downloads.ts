import { json } from '../http.ts';
import { appendEvent } from '../store.ts';
import { readDownload } from '../handlers/asset-download.ts';
import { choice, id, type Context } from './context.ts';

/** Descargas asistidas del Launcher (nivel 2); «Ya lo añadí» solo adelanta la siguiente comprobación. */
export async function downloads({db, req, res, url}: Context): Promise<boolean> {
  const check = /^\/downloads\/([^/]+)\/check$/.exec(url.pathname);
  if (req.method === 'POST' && check) {
    const download = readDownload(db, id(check[1]));
    if (!download) throw new Error('unknown_download');
    const changed = db.prepare("update commands set not_before=null, updated_at=? where idempotency_key=? and state='pending'")
      .run(new Date().toISOString(), `detect:${download.id}`).changes;
    if (changed) appendEvent(db, 'download.checking', null, {downloadId: download.id});
    json(res, 202, {downloadId: download.id, state: download.state, checking: changed > 0});
    return true;
  }
  if (req.method !== 'GET' || url.pathname !== '/downloads') return false;
  const state = choice(url.searchParams.get('state'), ['pending', 'completed', 'timeout', 'cancelled']);
  const rows = db.prepare(`select d.id, d.entry_id entryId, c.name, d.state from downloads d
    left join catalog_entries c on c.id=d.entry_id where ? is null or d.state=? order by d.rowid`).all(state ?? null, state ?? null);
  json(res, 200, rows.map(row => {
    const download = readDownload(db, row.id as string)!;
    return {id: download.id, entryId: download.entryId, name: row.name, state: download.state, targetProject: download.targetProject,
      requestedAt: download.requestedAt, completedAt: download.completedAt, instructions: download.detail.instructions, taskId: download.detail.taskId};
  }));
  return true;
}
