import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { filtered } from '../../service/src/repo/rows.ts';
import { getTask, requireTask } from '../../service/src/repo/tasks.ts';
import { addArtifact, listArtifacts, recordTestRun } from '../../service/src/repo/artifacts.ts';
import { checkGate } from '../../service/src/checks/gate.ts';
import type { Command, TestRun } from '../../service/src/model.ts';
import { checksFixture } from './checks-fixture.ts';
import { reviewFixture } from './review-fixture.ts';

const payloadOf = (c: Command) => JSON.parse(c.payload as unknown as string);

test('captura sin UI: umg failed «la captura no contiene la UI», vuelve al implementador y no hay QA', async () => {
  const f = checksFixture();
  try {
    process.env.KRATOS_FAKE = 'noui';
    const result = await f.handlers['ui.cycle']({id: 'c1', type: 'ui.cycle', payload: {taskId: f.task.id}, idempotencyKey: 'c1'} as any, f.ctx) as any;
    assert.equal(result.passed, false);
    const [row] = filtered<TestRun>(f.db, 'test_runs', {taskId: f.task.id});
    assert.deepEqual([row.checkId, row.result], ['umg', 'failed']);
    assert.match(f.events('test.failed')[0].summary, /la captura no contiene la UI/);
    const [send] = filtered<Command>(f.db, 'commands', {type: 'worker.send'});
    assert.equal(payloadOf(send).runId, f.implementer.id);
    assert.equal(filtered<Command>(f.db, 'commands', {type: 'review.start'}).length, 0);
  } finally { f.close(); }
});

test('con UI: dos resoluciones → dos capturas con procedencia, umg running y review.start de QA con Claude', async () => {
  const f = checksFixture();
  try {
    process.env.KRATOS_FAKE = 'ok';
    const result = await f.handlers['ui.cycle']({id: 'c2', type: 'ui.cycle', payload: {taskId: f.task.id}, idempotencyKey: 'c2'} as any, f.ctx) as any;
    const shots = listArtifacts(f.db, {taskId: f.task.id, kind: 'screenshot'});
    assert.deepEqual(shots.map(s => (s.provenance as any).resolution), ['1280x720', '1920x1080']);
    for (const shot of shots) {
      const p = shot.provenance as any;
      assert.ok(existsSync(shot.path) && existsSync(p.control));
      assert.equal(p.map, '/Game/Maps/Nivel1');
      assert.equal(p.widget, 'WBP_Vida_C');
      assert.ok(p.diffRatio >= 0.005);
    }
    const [row] = filtered<TestRun>(f.db, 'test_runs', {taskId: f.task.id});
    assert.deepEqual([row.result, row.config], ['running', '1280x720, 1920x1080']);
    const [review] = filtered<Command>(f.db, 'commands', {type: 'review.start'});
    assert.deepEqual(payloadOf(review), {taskId: f.task.id, implementerRunId: f.implementer.id, provider: 'claude', qa: {testRunId: result.testRunId}});
    assert.equal(checkGate(f.db, f.task.id).ok, false, 'sin veredicto de QA no se integra');
  } finally { f.close(); }
});

test('KRATOS_DONE de un worker ui encola ui.cycle con clave por run y corrección; otras áreas no', async t => {
  const {fixture} = await import('./worker-fixture.ts');
  const {uiCycleKey} = await import('../../service/src/handlers/ui-cycle.ts');
  for (const area of ['ui', 'qa']) {
    const f = fixture(t);
    f.db.prepare('update tasks set area=? where id=?').run(area, f.task.id);
    await f.start();
    f.output('KRATOS_DONE {"summary":"HUD listo","commits":[],"tests":"passed"}');
    await f.invoke('worker.poll', {runId: f.run().id});
    const cycles = filtered<Command>(f.db, 'commands', {type: 'ui.cycle'});
    assert.deepEqual(cycles.map(c => [payloadOf(c), c.idempotencyKey]),
      area === 'ui' ? [[{taskId: f.task.id, runId: f.run().id}, uiCycleKey(f.run())]] : []);
  }
});

async function qaReview(t: any, verdict: string) {
  const f = await reviewFixture(t);
  const test = recordTestRun(f.db, {taskId: f.task.id, runId: f.implementer.id, checkId: 'umg', result: 'running', commit: 'abc'});
  const dir = join(f.dataDir, 'artifacts', 'tests', test.id); mkdirSync(dir, {recursive: true});
  writeFileSync(join(dir, 'ui-1280x720.png'), 'png'); writeFileSync(join(dir, 'ui-1280x720-control.png'), 'png');
  addArtifact(f.db, {taskId: f.task.id, runId: f.implementer.id, kind: 'screenshot', path: join(dir, 'ui-1280x720.png'),
    provenance: {testRunId: test.id, resolution: '1280x720', map: '/Game/Maps/Nivel1', control: join(dir, 'ui-1280x720-control.png')}});
  const state = f.state(); state.treePath = join(f.dir, 'qa-tree'); state.terminalHandle = 'term_qa'; state.tail = [];
  writeFileSync(f.file, JSON.stringify(state));
  await f.invoke('review.start', {taskId: f.task.id, implementerRunId: f.implementer.id, provider: 'claude', qa: {testRunId: test.id}});
  const brief = readFileSync(join(f.reviewTree().path, '.kratos-brief.md'), 'utf8');
  assert.match(brief, /QA visual/);
  assert.match(brief, /\.kratos-review\/ui-1280x720\.png` · 1280x720 · mapa \/Game\/Maps\/Nivel1/);
  assert.ok(existsSync(join(f.reviewTree().path, '.kratos-review', 'ui-1280x720-control.png')));
  assert.ok(f.reviewer().skills.includes('ue-visual-qa'));
  assert.deepEqual(f.reviewer().metadata.qa, {testRunId: test.id});
  f.output(verdict); await f.poll();
  return {f, test};
}

test('QA aprobado: TestRun umg passed sin marcar aprobada la revisión de código', async t => {
  const {f, test: row} = await qaReview(t, 'KRATOS_REVIEW {"approved":true,"findings":[]}');
  assert.equal(filtered<TestRun>(f.db, 'test_runs', {id: row.id})[0].result, 'passed');
  assert.equal(requireTask(f.db, f.task.id).reviewApproved, 0);
  assert.equal(f.reviewer().state, 'done');
});

test('QA rechazado: umg failed y los hallazgos vuelven al mismo implementador', async t => {
  const {f, test: row} = await qaReview(t,
    'KRATOS_REVIEW {"approved":false,"findings":[{"file":"WBP_Vida","line":1,"severity":"bloqueante","note":"1280×720: contraste 2,1:1 sobre el cielo"}]}');
  assert.equal(filtered<TestRun>(f.db, 'test_runs', {id: row.id})[0].result, 'failed');
  const send = filtered<Command>(f.db, 'commands', {type: 'worker.send'}).at(-1)!;
  assert.equal(payloadOf(send).runId, f.implementer.id);
  assert.match(payloadOf(send).text, /Correcciones de QA visual:\nWBP_Vida:1 \[bloqueante\] 1280×720: contraste 2,1:1/);
  assert.equal(getTask(f.db, f.task.id)!.state, 'implementando');
});
