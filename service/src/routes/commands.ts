import { body, json } from '../http.ts';
import { filtered, read } from '../repo/rows.ts';
import { enqueue } from '../commands.ts';
import { choice, text, type Context } from './context.ts';
import type { CatalogEntry, Command } from '../model.ts';
import { finalizePayload, integratePayload } from './task-closing.ts';

type Payload = Record<string, unknown>;
const optionalText = (value: unknown) => value === undefined || text(value);
function entry(db: Context['db'], p: Payload): void {
  if (!text(p.entryId) || !optionalText(p.targetProject)) throw new Error('invalid_command_payload');
  if (!read<CatalogEntry>(db, 'catalog_entries', p.entryId)) throw new Error('unknown_catalog_entry');
}
/** Órdenes que el panel y la skill pueden encolar; el resto de tipos solo los crea el propio servicio. */
const validators: Record<string, (db: Context['db'], payload: Payload) => void> = {
  'asset.index': () => {},
  'asset.migrate': entry,
  'asset.prepare': entry,
  'asset.request_download': entry,
  'asset.candidates': (db, p) => {
    const strings = (v: unknown) => v === undefined || Array.isArray(v) && v.every(x => text(x));
    if (!text(p.taskId) || !text(p.query) || !strings(p.kinds) || !strings(p.animations) || !optionalText(p.targetProject))
      throw new Error('invalid_command_payload');
    if (!read(db, 'tasks', p.taskId)) throw new Error('unknown_task');
  },
  'checks.run': (db, p) => {
    if (!text(p.taskId) || !optionalText(p.runId) || p.dir !== undefined || p.files !== undefined
      && (!Array.isArray(p.files) || !p.files.every(f => typeof f === 'string'))) throw new Error('invalid_command_payload');
    if (!read(db, 'tasks', p.taskId)) throw new Error('unknown_task');
  },
  'integrate.run': (db, p) => { if (!optionalText(p.runId)) throw new Error('invalid_command_payload'); integratePayload(db, p.taskId); },
  'finalize.run': (db, p) => { finalizePayload(db, p.taskId); },
  'task.continue': (db, p) => {
    if (!text(p.taskId) || !text(p.text) || p.childId !== undefined) throw new Error('invalid_command_payload');
    if (read<{state: string}>(db, 'tasks', p.taskId)?.state !== 'done') throw new Error('invalid_transition');
  },
  'ui.cycle': (db, p) => {
    const pairs = p.resolutions === undefined || Array.isArray(p.resolutions) && p.resolutions.every(r => Array.isArray(r) && r.length === 2
      && r.every(n => Number.isSafeInteger(n) && n >= 320 && n <= 7680));
    if (!text(p.taskId) || !optionalText(p.runId) || !optionalText(p.map) || !pairs || p.widgets !== undefined
      && (!Array.isArray(p.widgets) || !p.widgets.every(w => text(w)))) throw new Error('invalid_command_payload');
    if (!read(db, 'tasks', p.taskId)) throw new Error('unknown_task');
  },
  'asset.meshy_generate': (_db, p) => {
    // Meshy solo para piezas hard surface: sin rig ni animate (decisión del usuario, 2026-10-23)
    if (!['text', 'image', 'remesh'].includes(p.kind as string)) throw new Error('meshy_kind_not_allowed');
    if (!text(p.taskId) || !p.params || typeof p.params !== 'object' || Array.isArray(p.params)
      || typeof p.estimatedCredits !== 'number' || !Number.isFinite(p.estimatedCredits) || p.estimatedCredits < 0)
      throw new Error('invalid_command_payload');
  },
};

export async function commands({db, req, res, url}: Context): Promise<boolean> {
  if (url.pathname !== '/commands') return false;
  if (req.method === 'POST') {
    const data = await body(req);
    if (typeof data.type !== 'string' || !Object.hasOwn(validators, data.type)) throw new Error('invalid_command_type');
    const payload = (data.payload ?? {}) as Payload;
    if (typeof payload !== 'object' || Array.isArray(payload)) throw new Error('invalid_command_payload');
    if (!text(data.idempotencyKey) || data.idempotencyKey.length > 200) throw new Error('invalid_idempotency_key');
    validators[data.type](db, payload);
    const command = enqueue(db, data.type, payload, data.idempotencyKey);
    json(res, 202, {commandId: command.id, state: command.state});
    return true;
  }
  if (req.method !== 'GET') return false;
  const state = choice(url.searchParams.get('state'), ['pending', 'running', 'done', 'failed']);
  const rows = filtered<Command>(db, 'commands', {state});
  json(res, 200, rows.map(row => ({...row, payload: JSON.parse(row.payload as string)})));
  return true;
}
