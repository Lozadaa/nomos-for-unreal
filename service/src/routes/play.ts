import { json } from '../http.ts';
import { play, playStatus, stopPlay } from '../play.ts';
import type { Context } from './context.ts';

/** Hito 14: la última build del juego, lanzarla y cerrarla. El cliente nunca elige la ruta: la resuelve el servicio. */
export async function playRoutes({db, req, res, url, dataDir}: Context): Promise<boolean> {
  const path = url.pathname;
  if (path !== '/play' && path !== '/play/stop') return false;
  if (!dataDir) throw new Error('unknown_project');
  if (req.method === 'GET' && path === '/play') json(res, 200, playStatus(db, dataDir));
  else if (req.method !== 'POST') return false;
  else if (path === '/play/stop') json(res, 200, stopPlay(db, dataDir));
  else try { json(res, 202, play(db, dataDir)); } catch (error) {
    const {message, pid, reason} = error as Error & {pid?: number; reason?: string};
    if (message === 'already_running') json(res, 409, {error: message, pid});
    else if (message === 'no_build') json(res, 404, {error: message, reason});
    else throw error;
  }
  return true;
}
