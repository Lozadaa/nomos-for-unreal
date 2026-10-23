import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../service/src/db.ts';
import { claim, enqueue } from '../../service/src/commands.ts';
import { recoverCommands } from '../../service/src/recovery.ts';
import { startRunner } from '../../service/src/runner.ts';
import { createTask, getTask, moveTask } from '../../service/src/repo/tasks.ts';
import { startRun } from '../../service/src/repo/runs.ts';
import { recordTestRun } from '../../service/src/repo/artifacts.ts';
import { acquire, listLeases } from '../../service/src/leases.ts';
import { listEvents } from '../../service/src/store.ts';
import { waitFor } from './wait.ts';

const row = (db: ReturnType<typeof openDb>, id: string) => db.prepare('select state,error,heartbeat_at from commands where id=?').get(id)!;
const alive = `runner:${process.pid}:otro`;

test('el runner late mientras un comando corre y deja de latir al terminar', async () => {
  const db = openDb(':memory:');
  let open!: () => void;
  const gate = new Promise<void>(accept => { open = accept; });
  const command = enqueue(db, 'checks.run', {}, 'largo');
  const stop = startRunner(db, {'checks.run': () => gate}, {intervalMs: 1, heartbeatMs: 20});
  try {
    await waitFor(() => row(db, command.id).state === 'running');
    const first = row(db, command.id).heartbeat_at as string;
    await waitFor(() => (row(db, command.id).heartbeat_at as string) > first);
    open();
    await waitFor(() => row(db, command.id).state === 'done');
  } finally { open(); stop(); await stop.drained; db.close(); }
});

test('con dueño vivo solo se recupera tras 60 s sin latido, y un sondeo vuelve a la cola una sola vez', () => {
  const db = openDb(':memory:');
  const poll = enqueue(db, 'worker.poll', {runId: 'r'}, 'poll');
  claim(db, alive);
  recoverCommands(db, {owner: 'yo', now: new Date(Date.now() + 30_000)});
  assert.equal(row(db, poll.id).state, 'running', 'latido de hace 30 s: el dueño puede estar vivo');
  recoverCommands(db, {owner: 'yo', now: new Date(Date.now() + 61_000)});
  assert.equal(row(db, poll.id).state, 'pending');
  assert.equal(listEvents(db, 0).filter(e => e.type === 'command.recovered').length, 1);
  claim(db, 'proceso-muerto');
  recoverCommands(db, {owner: 'yo'});
  assert.equal(row(db, poll.id).state, 'failed', 'la segunda vez sin latido ya no se reencola');
  assert.match(row(db, poll.id).error as string, /sin latido tras dos reinicios/);
  db.close();
});

test('checks.run sin latido falla con resultado incierto, suelta el editor y la tarea vuelve a probando con motivo', () => {
  const db = openDb(':memory:');
  const task = createTask(db, {title: 'HUD', area: 'ui', state: 'probando'});
  const command = enqueue(db, 'checks.run', {taskId: task.id}, 'checks');
  claim(db, 'proceso-muerto');
  const run = startRun(db, {taskId: task.id, role: 'qa', provider: 'unreal', metadata: {commandId: command.id}});
  const test = recordTestRun(db, {taskId: task.id, runId: run.id, checkId: 'build', result: 'running'});
  acquire(db, run.id, task.id, ['editor/Juego']);
  moveTask(db, task.id, 'probando');
  recoverCommands(db, {owner: 'yo'});
  assert.equal(row(db, command.id).state, 'failed');
  assert.match(row(db, command.id).error as string, /resultado incierto tras reinicio/);
  assert.equal(db.prepare('select state from runs where id=?').get(run.id)!.state, 'failed');
  assert.equal(db.prepare('select result from test_runs where id=?').get(test.id)!.result, 'failed');
  assert.deepEqual(listLeases(db), []);
  const after = getTask(db, task.id)!;
  assert.equal(after.state, 'probando');
  assert.match(after.waitReason!, /Resultado incierto tras reinicio/);
  const moved = listEvents(db, 0).filter(e => e.type === 'task.moved').at(-1)!;
  assert.match(String(moved.payload.reason), /Resultado incierto/);
  db.close();
});
