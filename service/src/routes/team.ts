import { body, json } from '../http.ts';
import { appendEvent } from '../store.ts';
import { listPeers, teamConfig, identity } from '../team.ts';
import { text, type Context } from './context.ts';

/** Hito 29: `GET /team` (yo y los peers) y `POST /team/ask` (petición a otra persona; viaja en mi tarjeta). */
export async function team({db, req, res, url, dataDir}: Context): Promise<boolean> {
  if (url.pathname === '/team' && req.method === 'GET') {
    const config = dataDir ? teamConfig(dataDir) : null;
    json(res, 200, {me: config ? {id: identity(dataDir!).id, name: config.name, frente: config.frente} : null, peers: listPeers(db)});
    return true;
  }
  if (url.pathname !== '/team/ask' || req.method !== 'POST') return false;
  const data = await body(req);
  if (!dataDir || !teamConfig(dataDir)) throw new Error('invalid_team_disabled');
  if (!text(data.to) || !text(data.text) || data.title !== undefined && !text(data.title) || data.taskId !== undefined && !text(data.taskId))
    throw new Error('invalid_team_request');
  const request = {to: data.to.trim(), title: (data.title as string | undefined)?.trim() ?? data.text.trim().slice(0, 80), text: data.text.trim(),
    at: new Date().toISOString(), ...(data.taskId ? {taskId: data.taskId as string} : {})};
  appendEvent(db, 'team.ask', null, request);
  json(res, 201, request);
  return true;
}
