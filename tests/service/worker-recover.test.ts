import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './worker-fixture.ts';
import { filtered } from '../../service/src/repo/rows.ts';
import { getTask } from '../../service/src/repo/tasks.ts';
import { listEvents } from '../../service/src/store.ts';
import { recoverDeadRuns } from '../../service/src/handlers/worker-recover.ts';
import type { Run } from '../../service/src/model.ts';

// Hito 22: tras un reinicio del PC los terminales de Orca ya no existen; Nomos no espera una hora para verlo.
async function rebooted(t: any, area = 'qa', machine = {freeGb: 20, editors: 0}) {
  const f = fixture(t, {FAKE_ORCA_MODE: 'claude'});
  writeFileSync(join(f.dataDir, 'config.json'), JSON.stringify({concurrency: {claude: 2}}));
  f.db.prepare('update tasks set area=? where id=?').run(area, f.task.id);
  await f.invoke('worker.start', {taskId: f.task.id, provider: 'claude', role: 'programmer', skills: []});
  const first = f.run();
  writeFileSync(f.file, JSON.stringify({...f.state(), gone: [first.sessionRef]}));
  const ctx = {...f.ctx, probe: () => machine};
  const runs = () => filtered<Run>(f.db, 'runs', {taskId: f.task.id});
  const recover = () => f.db.prepare("select id,payload,state,error from commands where type='worker.recover'").all();
  const invokeRecover = async () => {
    const row = recover()[0] as any, cmd = {id: row.id, type: 'worker.recover', payload: JSON.parse(row.payload)} as any;
    return f.handlers['worker.recover'](cmd, ctx as any);
  };
  return {...f, ctx, first, runs, recover, invokeRecover, machine};
}

test('una run running cuyo terminal ya no existe pasa a failed y se relanza en el mismo worktree con nota', async t => {
  const f = await rebooted(t);
  assert.equal(await recoverDeadRuns(f.ctx as any), 1);
  const [old] = f.runs();
  assert.equal(old.state, 'failed'); assert.equal(old.summary, 'terminal_handle_stale');
  assert.equal(f.recover().length, 1);
  assert.equal(await recoverDeadRuns(f.ctx as any), 0, 'una sola vez');
  await f.invokeRecover();
  const [, next] = f.runs();
  assert.equal(next.state, 'running'); assert.equal(next.metadata.worktreeId, f.first.metadata.worktreeId);
  assert.equal(next.metadata.recoveredFrom, f.first.id); assert.equal(next.attempt, f.first.attempt);
  const created = f.state().created as {worktree: string; command: string}[];
  assert.equal(created.length, 1); assert.equal(created[0].worktree, `path:${f.tree().path}`);
  const brief = readFileSync(join(f.tree().path, '.nomos-brief.md'), 'utf8');
  assert.match(brief, /Existe README/);
  assert.match(brief, /## Continuación tras un reinicio/);
  const recovered = listEvents(f.db, 0).filter(e => e.type === 'run.recovered').map(e => e.payload);
  assert.deepEqual(recovered, [{taskId: f.task.id, oldRun: f.first.id, newRun: next.id}]);
  assert.equal(getTask(f.db, f.task.id)!.state, 'implementando');
  assert.ok(f.db.prepare("select 1 from commands where type='worker.poll' and json_extract(payload,'$.runId')=?").get(next.id));
});

test('el relanzamiento de una pesada espera RAM como cualquier arranque pesado', async t => {
  const f = await rebooted(t, 'animacion', {freeGb: 3, editors: 0});
  await recoverDeadRuns(f.ctx as any);
  assert.deepEqual(await f.invokeRecover(), {deferred: true, reason: '3 GB libres, hacen falta 6'});
  assert.equal(f.runs().length, 1);
  f.machine.freeGb = 12;
  await f.invokeRecover();
  assert.equal(f.runs().at(-1)!.state, 'running');
});

test('con Orca sin responder no se da por muerta ninguna run', async t => {
  const f = await rebooted(t);
  writeFileSync(f.file, JSON.stringify({...f.state(), down: true}));
  await assert.rejects(recoverDeadRuns(f.ctx as any));
  assert.equal(f.runs()[0].state, 'running');
});

test('el runner lo hace solo en su primera pasada, sin esperar a ninguna gracia', async t => {
  const f = await rebooted(t);
  const { startRunner } = await import('../../service/src/runner.ts');
  const stop = startRunner(f.db, f.handlers, {schedulerIntervalMs: 50, intervalMs: 20, context: f.ctx});
  t.after(async () => { stop(); await stop.drained; });
  for (const end = Date.now() + 15_000; Date.now() < end && f.runs().length < 2;) await new Promise(r => setTimeout(r, 50));
  assert.equal(f.runs()[0].summary, 'terminal_handle_stale');
  assert.equal(f.runs()[1]?.metadata.recoveredFrom, f.first.id);
});
