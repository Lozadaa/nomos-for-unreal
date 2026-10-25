import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './worker-fixture.ts';
import { enqueue, defer } from '../../service/src/commands.ts';
import { getTask } from '../../service/src/repo/tasks.ts';
import { updateRun } from '../../service/src/repo/worker.ts';
import { taskFailures } from '../../service/src/failure-kind.ts';
import { readConfig } from '../../service/src/config.ts';

// hito 16 (2026-10-24 23:13 UTC): Orca se actualizó solo y su CLI respondía esto unos minutos; J1.7 y J1.8 se marcaron
// failed aunque sus workers seguían vivos y terminaron
const updating = 'Could not read Orca runtime metadata at C:\\Users\\u\\AppData\\Roaming\\orca\\orca-runtime.json. Start the Orca app first.';
const orca = (f: ReturnType<typeof fixture>, down: boolean) => { const s = f.state(); s.updating = down ? updating : undefined; writeFileSync(f.file, JSON.stringify(s)); };
async function poll(f: ReturnType<typeof fixture>) {
  const cmd = enqueue(f.db, 'worker.poll', {runId: f.run().id, generation: 0}, 'poll:' + crypto.randomUUID());
  f.db.prepare("update commands set state='running',attempts=1 where id=?").run(cmd.id);
  const result = await f.handlers['worker.poll']({...cmd, state: 'running'}, f.ctx) as {deferred?: true; reason: string; delayMs: number};
  if (result?.deferred) defer(f.db, cmd.id, result.reason, result.delayMs); // lo que hace el runner
  return result;
}
const ago = (f: ReturnType<typeof fixture>, minutes: number) =>
  updateRun(f.db, f.run().id, {orcaUnreachableSince: new Date(Date.now() - minutes * 60_000).toISOString()});

test('Orca ausente 2 min durante una run en marcha: la run sigue, la tarjeta lo dice y termina bien al volver', async t => {
  const f = fixture(t); await f.start();
  orca(f, true);
  assert.deepEqual(await poll(f), {deferred: true, reason: 'Orca no responde', delayMs: 30_000});
  assert.equal(f.run().state, 'running');
  assert.ok(Date.parse(f.run().metadata.orcaUnreachableSince!));
  ago(f, 2);
  assert.deepEqual(await poll(f), {deferred: true, reason: 'Orca no responde', delayMs: 30_000});
  assert.equal(f.run().state, 'running'); assert.equal(getTask(f.db, f.task.id)!.blockedReason, null);
  const failure = taskFailures(f.db).get(f.task.id)!;
  assert.equal(failure.kind, 'connection'); assert.equal(failure.text, 'Orca no responde desde hace 2 min');
  orca(f, false); f.output('NOMOS_DONE {"summary":"Implementado","commits":["abc"],"tests":"passed"}');
  await poll(f);
  assert.equal(f.run().state, 'done'); assert.equal(f.run().metadata.orcaUnreachableSince, undefined);
  assert.equal(getTask(f.db, f.task.id)!.state, 'revisando');
});

test('Orca ausente 11 min: la run pasa a failed incierta, como antes', async t => {
  const f = fixture(t); await f.start();
  orca(f, true); await poll(f); ago(f, 11);
  await assert.rejects(poll(f), /Start the Orca app first/);
  assert.equal(f.run().state, 'failed'); assert.equal(f.run().metadata.uncertain, true);
});

test('orca.graceMinutes en config.json acorta o alarga la espera', async t => {
  const f = fixture(t); await f.start();
  writeFileSync(join(f.dataDir, 'config.json'), JSON.stringify({concurrency: {codex: 2, claude: 2}, orca: {graceMinutes: 1}}));
  orca(f, true); await poll(f); ago(f, 2);
  await assert.rejects(poll(f));
  assert.equal(f.run().state, 'failed');
  writeFileSync(join(f.dataDir, 'config.json'), JSON.stringify({orca: {graceMinutes: -1}}));
  assert.throws(() => readConfig(f.dataDir), /invalid_worker_config/);
});

test('arrancar un worker con Orca actualizándose se difiere como Orca cerrado', async t => {
  const f = fixture(t); orca(f, true);
  const cmd = enqueue(f.db, 'worker.start', {taskId: f.task.id, provider: 'codex', role: 'programmer', skills: []}, 'arranque');
  f.db.prepare("update commands set state='running',attempts=1 where id=?").run(cmd.id);
  assert.deepEqual(await f.handlers['worker.start']({...cmd, state: 'running'}, f.ctx), {deferred: true, reason: 'Orca no está abierto', delayMs: 30_000});
});
