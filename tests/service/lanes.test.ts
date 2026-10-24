import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../service/src/db.ts';
import { claim, enqueue, laneOf } from '../../service/src/commands.ts';
import { startRunner } from '../../service/src/runner.ts';
import { waitFor } from './wait.ts';

const state = (db: ReturnType<typeof openDb>, id: string) => db.prepare('select state from commands where id=?').get(id)!.state;

test('el carril sale del tipo: editor y empaquetado van al largo, el resto al normal', () => {
  assert.deepEqual(['checks.run', 'ui.cycle', 'asset.migrate', 'worker.poll', 'worker.start', 'integrate.run'].map(laneOf),
    ['long', 'long', 'long', 'normal', 'normal', 'normal']);
  const db = openDb(':memory:');
  const long = enqueue(db, 'checks.run', {}, 'largo'), normal = enqueue(db, 'worker.poll', {}, 'sondeo');
  assert.equal(long.lane, 'long');
  assert.equal(claim(db, 'w', 'normal')!.id, normal.id, 'el carril normal no toma el comando largo aunque sea más antiguo');
  assert.equal(claim(db, 'w', 'normal'), undefined);
  assert.equal(claim(db, 'w', 'long')!.id, long.id);
  db.close();
});

test('un comando largo en curso no retrasa los sondeos del carril normal; dos largos van de uno en uno', async () => {
  const db = openDb(':memory:');
  let open!: () => void, longRuns = 0, maxLong = 0, active = 0;
  const gate = new Promise<void>(accept => { open = accept; });
  const first = enqueue(db, 'checks.run', {n: 1}, 'build-1'), second = enqueue(db, 'checks.run', {n: 2}, 'build-2');
  const polls = [1, 2, 3].map(n => enqueue(db, 'worker.poll', {n}, `poll-${n}`));
  const stop = startRunner(db, {
    'checks.run': async () => { active++; maxLong = Math.max(maxLong, active); longRuns++; await gate; active--; },
    'worker.poll': async () => { await new Promise(accept => setTimeout(accept, 10)); },
  }, {intervalMs: 1});
  try {
    await waitFor(() => polls.every(p => state(db, p.id) === 'done'));
    assert.equal(state(db, first.id), 'running', 'el empaquetado sigue en marcha mientras se sondea');
    assert.equal(state(db, second.id), 'pending');
    open();
    await waitFor(() => state(db, second.id) === 'done');
    assert.equal(longRuns, 2);
    assert.equal(maxLong, 1);
  } finally { open(); stop(); await stop.drained; db.close(); }
});
