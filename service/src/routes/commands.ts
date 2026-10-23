import { json } from '../http.ts';
import { filtered } from '../repo/rows.ts';
import { choice, type Context } from './context.ts';
import type { Command } from '../model.ts';

export async function commands({db, req, res, url}: Context): Promise<boolean> {
  if (req.method !== 'GET' || url.pathname !== '/commands') return false;
  const state = choice(url.searchParams.get('state'), ['pending', 'running', 'done', 'failed']);
  const rows = filtered<Command>(db, 'commands', {state});
  json(res, 200, rows.map(row => ({...row, payload: JSON.parse(row.payload as string)})));
  return true;
}
