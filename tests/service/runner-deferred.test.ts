import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../service/src/db.ts';
import { enqueue } from '../../service/src/commands.ts';
import { startRunner } from '../../service/src/runner.ts';
import { listEvents } from '../../service/src/store.ts';
import { waitFor } from './wait.ts';

test('cualquier handler que devuelve {deferred, reason} difiere el comando sin gastar intentos', async () => {
  const db = openDb(':memory:');
  enqueue(db, 'asset.migrate', {entryId: 'e1'}, 'migrate:e1:Juego');
  let calls = 0;
  const stop = startRunner(db, {'asset.migrate': async () => { calls++; return {deferred: true, reason: 'Esperando reserva: editor/Juego'}; }},
    {intervalMs: 1, context: {dataDir: import.meta.dirname}});
  try {
    await waitFor(() => listEvents(db, 0).some(e => e.type === 'command.deferred'));
    const row = db.prepare('select state, attempts, error, not_before from commands').get()!;
    assert.equal(row.state, 'pending');
    assert.equal(row.attempts, 0);
    assert.equal(row.error, 'Esperando reserva: editor/Juego');
    assert.ok(Date.parse(row.not_before as string) > Date.now());
    assert.equal(calls, 1);
  } finally { stop(); await stop.drained; db.close(); }
});

test('un resultado con deferred:false o sin razón completa el comando', async () => {
  const db = openDb(':memory:');
  enqueue(db, 'asset.index', {}, 'a'); enqueue(db, 'asset.other', {}, 'b');
  const stop = startRunner(db, {'asset.index': async () => ({deferred: false, reason: 'x'}), 'asset.other': async () => ({deferred: true})},
    {intervalMs: 1, context: {dataDir: import.meta.dirname}});
  try {
    await waitFor(() => db.prepare("select count(*) n from commands where state='done'").get()!.n === 2);
  } finally { stop(); await stop.drained; db.close(); }
});
