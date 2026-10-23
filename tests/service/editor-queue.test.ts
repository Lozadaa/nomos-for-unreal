import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../service/src/db.ts';
import { createTask, getTask } from '../../service/src/repo/tasks.ts';
import { startRun } from '../../service/src/repo/runs.ts';
import { listLeases } from '../../service/src/leases.ts';
import { listEvents } from '../../service/src/store.ts';
import { withEditor } from '../../service/src/editor/queue.ts';
import type { WorkerContext } from '../../service/src/runner.ts';

const project = {dir: 'C:/Juegos/KratosFabTest', uproject: 'C:/Juegos/KratosFabTest/KratosFabTest.uproject', name: 'KratosFabTest'};
function fixture() {
  const db = openDb(':memory:'), ctx = {db} as unknown as WorkerContext;
  const job = (role: string) => {
    const task = createTask(db, {title: role, area: 'ui'});
    return startRun(db, {taskId: task.id, role, provider: 'unreal'});
  };
  return {db, ctx, job};
}

test('dos peticiones de PIE: la segunda se difiere con el motivo visible y no falla', async () => {
  const {db, ctx, job} = fixture();
  const first = job('qa'), second = job('ui');
  let release!: () => void;
  const running = withEditor(ctx, project, first, () => new Promise<string>(accept => { release = () => accept('captura'); }));
  const waiting = await withEditor(ctx, project, second, async () => 'no debe correr');
  assert.deepEqual(waiting, {deferred: true, reason: 'Editor de KratosFabTest: ocupado por qa · unreal'});
  assert.equal(getTask(db, second.taskId)!.waitReason, 'Editor de KratosFabTest: ocupado por qa · unreal');
  const busy = listEvents(db, 0).find(e => e.type === 'editor.busy')!;
  assert.deepEqual(busy.payload, {project: 'KratosFabTest', runId: first.id, taskId: first.taskId, agent: 'qa · unreal'});
  release();
  assert.equal(await running, 'captura');
  assert.deepEqual(listLeases(db), []);
  assert.equal(await withEditor(ctx, project, second, async () => 'ahora sí'), 'ahora sí');
  assert.equal(getTask(db, second.taskId)!.waitReason, null);
  db.close();
});

test('la reserva se libera en finally aunque la operación lance (editor colgado)', async () => {
  const {db, ctx, job} = fixture();
  const run = job('qa');
  await assert.rejects(withEditor(ctx, project, run, async () => { throw new Error('unreal_timeout'); }), /unreal_timeout/);
  assert.deepEqual(listLeases(db), []);
  const types = listEvents(db, 0).map(e => e.type);
  assert.ok(types.indexOf('editor.free') > types.indexOf('editor.busy'));
  db.close();
});
