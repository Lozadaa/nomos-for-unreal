import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture } from './route-fixture.ts';
import { claim, complete, enqueue, fail } from '../../service/src/commands.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { startRun } from '../../service/src/repo/runs.ts';
import { listEvents } from '../../service/src/store.ts';
import { OrcaError } from '../../service/src/adapters/orca.ts';
import { failureKind, taskFailures } from '../../service/src/failure-kind.ts';
import { limits, readConfig, visualTolerance } from '../../service/src/config.ts';

test('el tipo de fallo distingue conexión, ejecución y capacidad ausente', () => {
  assert.equal(failureKind(new OrcaError('not_running', 'cerrado')), 'connection');
  assert.equal(failureKind(new OrcaError('timeout', 'lento')), 'execution');
  assert.equal(failureKind(new Error('unreal_missing')), 'capability_missing');
  assert.equal(failureKind(new Error('spawn blender ENOENT')), 'capability_missing');
  assert.equal(failureKind(new Error('fetch failed')), 'connection');
  assert.equal(failureKind(new Error('invalid_checks_target')), 'execution');
});

test('cada tarea expone su estado de fallo como texto corto; la cancelación solicitada y la confirmada son estados distintos', async () => {
  const f = await fixture();
  try {
    const a = createTask(f.db, {title: 'Conexión', area: 'qa'}), b = createTask(f.db, {title: 'Parada', area: 'qa'});
    const c = createTask(f.db, {title: 'Sin fallo', area: 'qa'});
    const start = enqueue(f.db, 'checks.run', {taskId: a.id}, 'a'); claim(f.db, 'w');
    fail(f.db, start.id, 'Orca terminó', {retry: false, kind: 'connection'});
    assert.equal(listEvents(f.db, 0).filter(e => e.type === 'command.failed').at(-1)!.payload.kind, 'connection');
    const run = startRun(f.db, {taskId: b.id, role: 'programmer', provider: 'claude'});
    const stop = enqueue(f.db, 'worker.stop', {runId: run.id}, 'b');
    assert.equal(taskFailures(f.db).get(b.id)!.kind, 'cancel_requested');
    claim(f.db, 'w'); complete(f.db, stop.id);
    const ok = enqueue(f.db, 'checks.run', {taskId: c.id}, 'c'); claim(f.db, 'w'); complete(f.db, ok.id);
    const listed = await (await f.request('/tasks')).json() as {id: string; failure?: {kind: string; text: string}}[];
    const by = (id: string) => listed.find(t => t.id === id)!;
    assert.deepEqual([by(a.id).failure!.kind, by(a.id).failure!.text], ['connection', 'Sin conexión']);
    assert.deepEqual([by(b.id).failure!.kind, by(b.id).failure!.text], ['cancel_confirmed', 'Cancelación confirmada']);
    assert.equal(by(c.id).failure, undefined);
    const detail = await (await f.request(`/tasks/${a.id}`)).json() as {task: {failure?: {kind: string}}};
    assert.equal(detail.task.failure!.kind, 'connection');
  } finally { await f.close(); }
});

test('límites y tolerancia visual configurables con defectos; valores inválidos rechazan la configuración', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nomos-config-'));
  try {
    assert.equal(visualTolerance(readConfig(dir)), 0.02);
    assert.deepEqual(limits(readConfig(dir)), {corrections: 3});
    writeFileSync(join(dir, 'config.json'), '{"visualTolerance":0.05,"limits":{"corrections":5}}');
    assert.equal(visualTolerance(readConfig(dir)), 0.05);
    assert.deepEqual(limits(readConfig(dir)), {corrections: 5});
    for (const bad of ['{"visualTolerance":2}', '{"visualTolerance":"2%"}', '{"limits":{"corrections":-1}}', '{"limits":{"otra":1}}']) {
      writeFileSync(join(dir, 'config.json'), bad);
      assert.throws(() => readConfig(dir), /invalid_worker_config/, bad);
    }
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
