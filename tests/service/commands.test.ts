import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { openDb } from '../../service/src/db.ts';
import { enqueue, claim, complete, fail } from '../../service/src/commands.ts';
import { listEvents } from '../../service/src/store.ts';
import { removeDir } from '../remove-dir.ts';

test('enqueue conserva el comando y emite un solo evento por clave', () => {
  const db = openDb(':memory:');
  try {
    const command = enqueue(db, 'build', { taskId: 't1' }, 'key');
    assert.deepEqual(enqueue(db, 'other', {}, 'key'), command);
    assert.equal(command.state, 'pending');
    assert.equal(command.attempts, 0);
    assert.equal(command.claimedBy, null);
    assert.deepEqual(command.payload, { taskId: 't1' });
    assert.equal(db.prepare('select count(*) as n from commands').get()!.n, 1);
    const events = listEvents(db, 0);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'command.pending');
    assert.equal(events[0].messageId, null);
    assert.equal(events[0].payload.commandId, command.id);
  } finally { db.close(); }
});

test('claim toma el más antiguo y complete conserva el resultado solo en evento', () => {
  const db = openDb(':memory:');
  try {
    const first = enqueue(db, 'build', {}, 'one');
    const second = enqueue(db, 'test', {}, 'two');
    db.prepare('update commands set created_at=? where id=?').run('2020-01-01', second.id);
    const claimed = claim(db, 'worker')!;
    assert.equal(claimed.id, second.id);
    assert.equal(claimed.state, 'running');
    assert.equal(claimed.attempts, 1);
    assert.equal(claimed.claimedBy, 'worker');
    assert.ok(claimed.startedAt);
    complete(db, second.id, { artifact: 'build.zip' });
    const row = db.prepare('select * from commands where id=?').get(second.id)!;
    assert.equal(row.state, 'done');
    assert.ok(row.finished_at);
    assert.equal(row.payload, '{}');
    assert.deepEqual(listEvents(db, 0).at(-1)!.payload.result, { artifact: 'build.zip' });
    assert.equal(claim(db, 'next')!.id, first.id);
    assert.equal(claim(db, 'empty'), undefined);
  } finally { db.close(); }
});

test('fail reintenta hasta tres claims y rechaza transiciones ajenas a running', () => {
  const db = openDb(':memory:');
  try {
    const command = enqueue(db, 'build', {}, 'retry');
    assert.throws(() => complete(db, command.id));
    assert.throws(() => fail(db, command.id, 'premature'));
    for (let attempt = 1; attempt <= 3; attempt++) {
      assert.equal(claim(db, 'worker')!.attempts, attempt);
      fail(db, command.id, `error ${attempt}`);
      const row = db.prepare('select * from commands where id=?').get(command.id)!;
      assert.equal(row.state, attempt < 3 ? 'pending' : 'failed');
      assert.equal(row.attempts, attempt);
      assert.equal(row.error, `error ${attempt}`);
      assert.equal(row.claimed_by, null);
      assert.equal(Boolean(row.finished_at), attempt === 3);
    }
    const before = listEvents(db, 0);
    assert.throws(() => fail(db, command.id, 'again'));
    assert.throws(() => complete(db, command.id));
    assert.throws(() => complete(db, 'missing'));
    assert.deepEqual(listEvents(db, 0), before);
    assert.deepEqual(before.map(e => e.type), ['command.pending', 'command.running',
      'command.pending', 'command.running', 'command.pending', 'command.running', 'command.failed']);
    assert.equal(claim(db, 'empty'), undefined);
  } finally { db.close(); }
});

test('done no admite eventos terminales duplicados y rollback conserva estado', () => {
  const db = openDb(':memory:');
  try {
    const c = enqueue(db, 'build', {}, 'done');
    db.exec("create trigger reject_event before insert on events begin select raise(abort, 'event rejected'); end");
    assert.throws(() => claim(db, 'worker'), /event rejected/);
    assert.equal(db.prepare('select state from commands').get()!.state, 'pending');
    db.exec('drop trigger reject_event');
    assert.equal(claim(db, 'worker')!.attempts, 1);
    complete(db, c.id);
    const before = listEvents(db, 0);
    assert.throws(() => complete(db, c.id));
    assert.throws(() => fail(db, c.id, 'late'));
    assert.deepEqual(listEvents(db, 0), before);
    assert.equal(before.at(-1)!.type, 'command.done');
  } finally { db.close(); }
});

test('dos workers compiten por un comando en conexiones SQLite independientes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nomos-commands-'));
  const file = join(dir, 'db.sqlite');
  const db = openDb(file);
  const gate = new SharedArrayBuffer(4);
  const workers: Worker[] = [];
  let ready = 0;
  try {
    const command = enqueue(db, 'build', {}, 'race');
    const results = [1, 2].map(id => new Promise<any>((resolve, reject) => {
      const worker = new Worker(`
        const { parentPort, workerData } = await import('node:worker_threads');
        const { openDb } = await import(workerData.dbUrl);
        const { claim } = await import(workerData.commandsUrl);
        const db = openDb(workerData.file);
        parentPort.postMessage('ready');
        Atomics.wait(new Int32Array(workerData.gate), 0, 0);
        const result = claim(db, String(workerData.id));
        db.close(); parentPort.postMessage({ result });
      `, { eval: true, workerData: { file, gate, id,
        dbUrl: new URL('../../service/src/db.ts', import.meta.url).href,
        commandsUrl: new URL('../../service/src/commands.ts', import.meta.url).href } });
      workers.push(worker);
      worker.on('error', reject);
      worker.on('message', message => {
        if (message === 'ready') {
          if (++ready === 2) {
            Atomics.store(new Int32Array(gate), 0, 1);
            Atomics.notify(new Int32Array(gate), 0);
          }
        } else resolve(message.result);
      });
    }));
    const claimed = (await Promise.all(results)).filter(Boolean);
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].id, command.id);
    assert.equal(claimed[0].attempts, 1);
    assert.equal(listEvents(db, 0).filter(e => e.type === 'command.running').length, 1);
  } finally {
    await Promise.all(workers.map(w => w.terminate()));
    db.close(); removeDir(dir);
  }
});
