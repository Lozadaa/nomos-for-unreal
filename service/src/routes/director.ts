import { json } from '../http.ts';
import { appendEvent, status } from '../store.ts';
import type { Context } from './context.ts';

/** Pausa o reanuda al director; el planificador consulta `director.paused` antes de repartir trabajo. */
export async function director({db, req, res, url}: Context): Promise<boolean> {
  const match = /^\/director\/(pause|resume)$/.exec(url.pathname);
  if (!match || req.method !== 'POST') return false;
  const paused = match[1] === 'pause';
  if (status(db).paused !== paused) {
    db.prepare('update director set paused=? where id=1').run(paused ? 1 : 0);
    appendEvent(db, paused ? 'director.paused' : 'director.resumed', null, {});
  }
  json(res, 200, status(db));
  return true;
}
