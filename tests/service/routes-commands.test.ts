import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './route-fixture.ts';
import { upsertEntry } from '../../service/src/repo/catalog.ts';

test('POST /commands acepta tipos de la lista blanca y es idempotente por clave', async () => {
  const f = await fixture(true);
  try {
    const first = await f.request('/commands', {type: 'asset.index', idempotencyKey: 'asset.index:2026-10-23T17:30'});
    assert.equal(first.status, 202);
    const {commandId} = await first.json();
    const again = await (await f.request('/commands', {type: 'asset.index', idempotencyKey: 'asset.index:2026-10-23T17:30'})).json();
    assert.equal(again.commandId, commandId);
    const rows = await (await f.request('/commands')).json();
    assert.equal(rows.filter((c: any) => c.type === 'asset.index').length, 1);
  } finally { await f.close(); }
});

test('POST /commands rechaza tipos fuera de lista, cargas inválidas y entradas desconocidas', async () => {
  const f = await fixture(true);
  try {
    const call = async (data: unknown) => {
      const res = await f.request('/commands', data);
      return [res.status, (await res.json()).error];
    };
    assert.deepEqual(await call({type: 'worker.start', payload: {}, idempotencyKey: 'k1'}), [400, 'invalid_command_type']);
    assert.deepEqual(await call({type: 'catalog.prepare', payload: {}, idempotencyKey: 'k2'}), [400, 'invalid_command_type']);
    assert.deepEqual(await call({type: 'asset.index'}), [400, 'invalid_idempotency_key']);
    assert.deepEqual(await call({type: 'asset.migrate', payload: {}, idempotencyKey: 'k3'}), [400, 'invalid_command_payload']);
    assert.deepEqual(await call({type: 'asset.migrate', payload: {entryId: 'nadie'}, idempotencyKey: 'k4'}), [404, 'unknown_catalog_entry']);
    assert.deepEqual(await call({type: 'asset.meshy_generate', payload: {taskId: 't', kind: 'video', params: {}, estimatedCredits: 5}, idempotencyKey: 'k5'}), [400, 'invalid_command_payload']);
    const entry = upsertEntry(f.db, {name: 'Pack', category: 'pack', description: '', source: 'fab'});
    assert.equal((await f.request('/commands', {type: 'asset.prepare', payload: {entryId: entry.id}, idempotencyKey: 'k6'})).status, 202);
    assert.equal((await f.request('/commands', {type: 'asset.index', idempotencyKey: 'k7'}, false)).status, 401);
  } finally { await f.close(); }
});
