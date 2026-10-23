import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../service/src/db.ts';
import { createTask, moveTask } from '../../service/src/repo/tasks.ts';
import { recordTestRun } from '../../service/src/repo/artifacts.ts';
import { openDecision, resolveDecision } from '../../service/src/repo/decisions.ts';
import { checkGate } from '../../service/src/checks/gate.ts';

const setup = () => {
  const db = openDb(':memory:');
  const task = createTask(db, {title: 'HUD', area: 'ui', state: 'probando'});
  return {db, task};
};

test('probando → integrando exige el último TestRun passed de cada comprobación', () => {
  const {db, task} = setup();
  assert.throws(() => moveTask(db, task.id, 'integrando'), /invalid_transition/, 'sin pruebas no se integra');
  recordTestRun(db, {taskId: task.id, checkId: 'cpp', result: 'failed'});
  recordTestRun(db, {taskId: task.id, checkId: 'umg', result: 'passed'});
  assert.throws(() => moveTask(db, task.id, 'integrando'), /invalid_transition/);
  assert.deepEqual((checkGate(db, task.id) as any).blocking, ['cpp']);
  recordTestRun(db, {taskId: task.id, checkId: 'cpp', result: 'passed'});
  assert.equal(moveTask(db, task.id, 'integrando').state, 'integrando');
});

test('pending o running bloquean; el diff sin Unreal (none skipped) pasa', () => {
  const {db, task} = setup();
  recordTestRun(db, {taskId: task.id, checkId: 'map', result: 'running'});
  assert.equal(checkGate(db, task.id).ok, false);
  const other = createTask(db, {title: 'Docs', area: 'qa', state: 'probando'});
  recordTestRun(db, {taskId: other.id, checkId: 'none', result: 'skipped'});
  assert.equal(moveTask(db, other.id, 'integrando').state, 'integrando');
});

test('skipped/unavailable obligatoria: bloquea hasta «Continuar sin esta comprobación» resuelta sobre esas pruebas', () => {
  const {db, task} = setup();
  recordTestRun(db, {taskId: task.id, checkId: 'blueprint', result: 'passed'});
  const missing = recordTestRun(db, {taskId: task.id, checkId: 'cpp', result: 'unavailable'});
  const gate = checkGate(db, task.id) as any;
  assert.equal(gate.ok, false);
  assert.deepEqual(gate.unavailable.map((r: any) => r.id), [missing.id]);
  assert.throws(() => moveTask(db, task.id, 'integrando'), /invalid_transition/);
  const decision = openDecision(db, {taskId: task.id, reason: 'Comprobación no disponible: cpp',
    evidence: [{kind: 'gate:checks', ref: JSON.stringify([missing.id])}],
    options: [{id: 'continue', label: 'Continuar sin esta comprobación', description: 'x'}, {id: 'retry', label: 'Reintentar', description: 'y'}]});
  resolveDecision(db, decision.id, 'retry', 'usuario');
  assert.equal(checkGate(db, task.id).ok, false, '«Reintentar» no exime');
  const again = openDecision(db, {taskId: task.id, reason: 'otra', evidence: [{kind: 'gate:checks', ref: JSON.stringify([missing.id])}],
    options: [{id: 'continue', label: 'Continuar sin esta comprobación', description: 'x'}]});
  resolveDecision(db, again.id, 'continue', 'usuario');
  assert.equal(checkGate(db, task.id).ok, true);
  recordTestRun(db, {taskId: task.id, checkId: 'cpp', result: 'unavailable'});
  assert.equal(checkGate(db, task.id).ok, false, 'una prueba nueva no disponible necesita su propia Decisión');
});

test('POST /tasks/:id/checks encola checks.run con el último run implementador; POST /commands valida checks.run', async () => {
  const {fixture} = await import('./route-fixture.ts');
  const {startRun, finishRun} = await import('../../service/src/repo/runs.ts');
  const f = await fixture(true);
  try {
    const task = createTask(f.db, {title: 'HUD', area: 'ui', state: 'probando'});
    assert.equal((await f.request(`/tasks/${task.id}/checks`, {})).status, 400, 'sin run implementador terminado');
    const run = startRun(f.db, {taskId: task.id, role: 'implementacion', provider: 'claude'});
    finishRun(f.db, run.id, 'done', 'hecho');
    assert.equal((await f.request(`/tasks/${task.id}/checks`, {}, false)).status, 401);
    const first = await (await f.request(`/tasks/${task.id}/checks`, {})).json();
    const second = await (await f.request(`/tasks/${task.id}/checks`, {})).json();
    assert.notEqual(first.commandId, second.commandId, 'cada pulsación es un lanzamiento nuevo');
    const [command] = f.db.prepare("select payload, idempotency_key k from commands where type='checks.run' order by rowid").all();
    assert.deepEqual(JSON.parse(command.payload as string), {taskId: task.id, runId: run.id});
    assert.equal(command.k, `checks:${task.id}:${run.id}:0`);
    const bad = await f.request('/commands', {type: 'checks.run', payload: {taskId: task.id, files: [1]}, idempotencyKey: 'k1'});
    assert.equal(bad.status, 400);
    const ok = await f.request('/commands', {type: 'checks.run', payload: {taskId: task.id, files: ['Content/UI/WBP_Vida.uasset']}, idempotencyKey: 'k2'});
    assert.equal(ok.status, 202);
  } finally { await f.close(); }
});
