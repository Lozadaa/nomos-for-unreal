import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fixture } from './worker-fixture.ts';
import { sweepStalls } from '../../service/src/stall.ts';
import { requireTask } from '../../service/src/repo/tasks.ts';
import { requireRun } from '../../service/src/repo/worker.ts';
import { finishRun } from '../../service/src/repo/runs.ts';
import { read } from '../../service/src/repo/rows.ts';
import { resolveDecision } from '../../service/src/repo/decisions.ts';
import type { Decision } from '../../service/src/model.ts';

// hito 18 (J1.8 y J1.10 en Block Kings): NOMOS_DONE, después una corrección con commits nuevos y sin repetir la marca
const later = () => Date.now() + 11 * 60_000;
// el worker.poll que dejó el arranque: en el servicio lo consume el runner y no hace nada con la run ya terminada
const settle = (f: {db: any}) => f.db.prepare("update commands set state='done' where state='pending'").run();
async function done(t: any) {
  const f = fixture(t);
  await f.start(); const run = f.run(), tree = f.tree();
  f.output('NOMOS_DONE {"summary":"Terminado","commits":[],"tests":"passed"}');
  await f.invoke('worker.poll', {runId: run.id});
  settle(f);
  const git = (...args: string[]) => execFileSync('git', ['-C', tree.path, ...args], {encoding: 'utf8', windowsHide: true}).trim();
  const commit = (name: string) => { writeFileSync(join(tree.path, name), name + '\n'); git('add', name); git('commit', '-m', name); return git('rev-parse', 'HEAD'); };
  const idle = (value: boolean) => writeFileSync(f.file, JSON.stringify({...f.state(), idle: value}));
  const reviews = () => f.db.prepare("select payload from commands where type='review.start'").all().map(r => JSON.parse(r.payload as string));
  const events = (type: string) => f.db.prepare('select payload from events where type=? order by seq').all(type).map(r => JSON.parse(r.payload as string));
  return {...f, implementer: run, commit, idle, reviews, events, head: () => git('rev-parse', 'HEAD')};
}

test('DONE → commit nuevo → terminal quieto: Nomos pide la revisión solo, sin Decisión', async t => {
  const f = await done(t);
  assert.equal(requireRun(f.db, f.implementer.id).metadata.doneCommit, f.head(), 'la marca guarda su commit');
  const fix = f.commit('correccion.txt'); f.idle(true);
  await sweepStalls(f.ctx, later());
  assert.equal(requireTask(f.db, f.task.id).decisionId, null);
  assert.deepEqual(f.reviews().map(p => [p.taskId, p.implementerRunId]), [[f.task.id, f.implementer.id]]);
  assert.deepEqual(f.events('review.auto_requested'), [{taskId: f.task.id, commit: fix, reason: 'commits tras DONE'}]);
  await sweepStalls(f.ctx, later());
  assert.equal(f.reviews().length, 1, 'con la revisión encolada no se repite');
});

test('DONE → commit nuevo → terminal ocupado: espera, ni revisión ni Decisión', async t => {
  const f = await done(t);
  f.commit('fusion-main.txt'); f.idle(false);
  await sweepStalls(f.ctx, later());
  assert.equal(requireTask(f.db, f.task.id).decisionId, null);
  assert.deepEqual(f.reviews(), []);
  assert.deepEqual(f.events('review.auto_requested'), []);
});

test('DONE sin commits nuevos y nada en marcha: Decisión con el paso exacto; la recomendada pide la revisión', async t => {
  const f = await done(t); f.idle(true);
  await sweepStalls(f.ctx, later());
  const task = requireTask(f.db, f.task.id), decision = read<Decision>(f.db, 'decisions', task.decisionId!)!;
  assert.equal(decision.reason, `Pedir la revisión del commit ${f.head().slice(0, 7)}`);
  const recommended = decision.options.find(o => o.recommended)!;
  assert.equal(recommended.id, 'pedir_revision');
  assert.deepEqual(f.reviews(), [], 'la Decisión no la pide por su cuenta');
  resolveDecision(f.db, decision.id, recommended.id, 'director');
  await sweepStalls(f.ctx, later());
  assert.equal(f.reviews().length, 1);
  assert.deepEqual(f.events('review.auto_requested').map(e => [e.commit, e.reason, e.decisionId]), [[f.head(), 'decisión', decision.id]]);
  await sweepStalls(f.ctx, later());
  assert.equal(f.events('review.auto_requested').length, 1, 'la opción se ejecuta una vez');
});

test('implementando sin NOMOS_DONE y nada en marcha: «leer su terminal», y la recomendada lo lee', async t => {
  const f = fixture(t);
  await f.start(); const run = f.run();
  f.output('compilando…', 'listo, falta el commit');
  finishRun(f.db, run.id, 'failed', 'envío fallido'); settle(f);
  await sweepStalls(f.ctx, later());
  const decision = read<Decision>(f.db, 'decisions', requireTask(f.db, f.task.id).decisionId!)!;
  assert.equal(decision.reason, 'El worker no dio NOMOS_DONE: leer su terminal');
  const recommended = decision.options.find(o => o.recommended)!;
  assert.equal(recommended.id, 'leer_terminal');
  resolveDecision(f.db, decision.id, recommended.id, 'director');
  await sweepStalls(f.ctx, later());
  const read_ = f.db.prepare("select payload from events where type='worker.output' and json_extract(payload,'$.decisionId')=?").all(decision.id)
    .map(r => JSON.parse(r.payload as string));
  assert.equal(read_.length, 1);
  assert.ok(read_[0].lines.includes('listo, falta el commit'), JSON.stringify(read_[0]));
});

// experimento metras 2026-11-08: cada NOMOS_DONE despertaba al director solo para pedir `nomos task review`
test('NOMOS_DONE con commit nuevo: el servicio pide la revisión al momento; sin commit, con Decisión o en UI, no', async t => {
  const f = fixture(t);
  await f.start(); const run = f.run(), tree = f.tree();
  const git = (...args: string[]) => execFileSync('git', ['-C', tree.path, ...args], {encoding: 'utf8', windowsHide: true}).trim();
  writeFileSync(join(tree.path, 'README.md'), 'Juego\n'); git('add', 'README.md'); git('commit', '-m', 'README');
  f.output('NOMOS_DONE {"summary":"Terminado","commits":["README"],"tests":"passed"}');
  await f.invoke('worker.poll', {runId: run.id});
  const reviews = f.db.prepare("select payload from commands where type='review.start'").all().map(r => JSON.parse(r.payload as string));
  assert.deepEqual(reviews.map(p => [p.taskId, p.implementerRunId]), [[f.task.id, run.id]]);
  const [event] = f.db.prepare("select payload from events where type='review.auto_requested'").all().map(r => JSON.parse(r.payload as string));
  assert.deepEqual([event.commit, event.reason], [git('rev-parse', 'HEAD'), 'NOMOS_DONE']);
  // sin commit nuevo (el fixture de los otros casos) o con la UI, que la pide su QA visual: nada
  const plain = await done(t);
  assert.deepEqual(plain.reviews(), []);
  const ui = fixture(t); ui.db.prepare("update tasks set area='ui' where id=?").run(ui.task.id);
  await ui.start(); const uiTree = ui.tree();
  execFileSync('git', ['-C', uiTree.path, 'commit', '--allow-empty', '-m', 'hud'], {windowsHide: true});
  ui.output('NOMOS_DONE {"summary":"HUD","commits":["hud"],"tests":"passed"}');
  await ui.invoke('worker.poll', {runId: ui.run().id});
  assert.equal(ui.db.prepare("select count(*) n from commands where type='review.start'").get()!.n, 0);
  assert.equal(ui.db.prepare("select count(*) n from commands where type='ui.cycle'").get()!.n, 1);
});
