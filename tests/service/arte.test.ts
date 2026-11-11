// Pasada de arte (2026-11-11): Trompo con Nomos salió con formas básicas y colores planos; el agente solo, torneado y con
// mundo alrededor. Un juez que solo mira las capturas puntúa de 0 a 3 y lo que quede por debajo de 2 vuelve al worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { filtered } from '../../service/src/repo/rows.ts';
import { getTask } from '../../service/src/repo/tasks.ts';
import { addArtifact, recordTestRun } from '../../service/src/repo/artifacts.ts';
import { checkGate } from '../../service/src/checks/gate.ts';
import { loteIds } from '../../service/src/handlers/checks.ts';
import { empaqueta, pideLote } from '../../service/src/checks/select.ts';
import { limits } from '../../service/src/config.ts';
import type { Command, TestRun } from '../../service/src/model.ts';
import { checksFixture } from './checks-fixture.ts';
import { reviewFixture } from './review-fixture.ts';

const payloadOf = (c: Command) => JSON.parse(c.payload as unknown as string);
const bien = {forma: 2, materiales: 2, suelo_fondo: 3, luz_color: 2, camara: 2, efectos: 2, coherencia: 3};

test('arte: va el último del lote; limits.arte 2 por defecto y 0 lo apaga', () => {
  assert.deepEqual(loteIds(['cpp', 'build'], {acabado: true, imagen: true, arte: true}), ['acabado', 'cpp', 'imagen', 'build', 'arte']);
  assert.deepEqual(loteIds(['cpp'], {acabado: true, imagen: true, arte: false}), ['acabado', 'cpp']);
  assert.equal(limits({}).arte, 2);
  assert.equal(limits({limits: {arte: 0}}).arte, 0);
});

test('lote: corre en la tarea que empaqueta aunque ningún criterio empiece por check:', () => {
  const t = (acceptance: string[], scope: string[] = []) => ({acceptance, scope});
  assert.equal(pideLote(t(['El trompo gira'])), false);
  assert.equal(pideLote(t(['Comprobación `imagen` sin fallos y las tres capturas miradas'])), true);
  assert.equal(pideLote(t(['Plan de arte escrito y juez de arte con todos los criterios en 2 o más'])), true);
  assert.equal(empaqueta(t(['x'], ['Build/'])), true);
  assert.equal(empaqueta(t(['Empaquetado Shipping que arranca'])), true);
});

test('lote con arte: capturas del modo demo y de detalle, prueba running y juez de arte encolado', async () => {
  const f = checksFixture({files: ['Source/Juego/JuegoAspecto.cpp', 'Config/DefaultGame.ini'], deps: {arte: true}});
  try {
    process.env.NOMOS_FAKE = 'ok';
    await f.run();
    const filas = filtered<TestRun>(f.db, 'test_runs', {taskId: f.task.id});
    const arte = filas.find(r => r.checkId === 'arte')!;
    assert.equal(arte.result, 'running');
    const shots = f.db.prepare("select path from artifacts where kind='screenshot' and json_extract(provenance,'$.testRunId')=?").all(arte.id)
      .map(r => String(r.path).split(/[\\/]/).at(-1));
    assert.deepEqual(shots.sort(), ['detalle-protagonista.png', 'final.png', 'inicio.png', 'mitad.png']);
    const [review] = filtered<Command>(f.db, 'commands', {type: 'review.start'});
    assert.deepEqual(payloadOf(review), {taskId: f.task.id, implementerRunId: f.implementer.id, provider: 'claude', arte: {testRunId: arte.id}});
    assert.equal(checkGate(f.db, f.task.id).ok, false, 'sin el juez no se integra');
  } finally { delete process.env.NOMOS_FAKE; f.close(); }
});

async function juez(t: any, verdict: string, previas = 0) {
  const f = await reviewFixture(t);
  f.db.prepare('update tasks set acceptance=? where id=?').run(JSON.stringify(['Que Trompo se vea increíble: que no parezca un prototipo']), f.task.id);
  mkdirSync(join(f.projectDir, 'docs'), {recursive: true});
  writeFileSync(join(f.projectDir, 'docs', 'direccion.md'), '# Dirección\n\n## Plan de arte\n| Qué | Herramienta |\n');
  for (let i = 0; i < previas; i++) recordTestRun(f.db, {taskId: f.task.id, runId: f.implementer.id, checkId: 'arte', result: 'failed', commit: 'abc'});
  const row = recordTestRun(f.db, {taskId: f.task.id, runId: f.implementer.id, checkId: 'arte', result: 'running', commit: 'abc'});
  const dir = join(f.dataDir, 'artifacts', 'tests', row.id); mkdirSync(dir, {recursive: true});
  for (const n of ['inicio', 'detalle-protagonista']) {
    writeFileSync(join(dir, `${n}.png`), 'png');
    addArtifact(f.db, {taskId: f.task.id, runId: f.implementer.id, kind: 'screenshot', path: join(dir, `${n}.png`), provenance: {testRunId: row.id, arte: true}});
  }
  const state = f.state(); state.treePath = join(f.dir, 'arte-tree'); state.terminalHandle = 'term_arte'; state.tail = [];
  writeFileSync(f.file, JSON.stringify(state));
  await f.invoke('review.start', {taskId: f.task.id, implementerRunId: f.implementer.id, provider: 'claude', arte: {testRunId: row.id}});
  const brief = readFileSync(join(f.reviewTree().path, '.nomos-brief.md'), 'utf8');
  f.output(verdict); await f.poll();
  return {f, row, brief};
}
const veredicto = (notas: object, findings: object[] = []) => `NOMOS_REVIEW ${JSON.stringify({approved: true, notas, findings})}`;

test('juez de arte: brief con las capturas, las frases del usuario y la dirección, sin el código; todo ≥ 2 → passed', async t => {
  const {f, row, brief} = await juez(t, veredicto(bien));
  assert.match(brief, /Juez de arte/);
  assert.match(brief, /\.nomos-review\/detalle-protagonista\.png/);
  assert.match(brief, /Que Trompo se vea increíble/);
  assert.match(brief, /## Plan de arte/);
  assert.doesNotMatch(brief, /diff\.patch/);
  assert.ok(existsSync(join(f.reviewTree().path, '.nomos-review', 'inicio.png')));
  assert.deepEqual(f.reviewer().metadata.arte, {testRunId: row.id});
  assert.equal(filtered<TestRun>(f.db, 'test_runs', {id: row.id})[0].result, 'passed');
});

test('juez de arte: un criterio < 2 vuelve al mismo worker con qué cambiar y no gasta la corrección', async t => {
  const {f, row} = await juez(t, veredicto({...bien, materiales: 1},
    [{file: 'materiales', line: 1, severity: 'mayor', note: 'Colores planos: veta de madera y barniz con brillo'}]));
  assert.equal(filtered<TestRun>(f.db, 'test_runs', {id: row.id})[0].result, 'failed');
  const send = filtered<Command>(f.db, 'commands', {type: 'worker.send'}).at(-1)!;
  assert.equal(payloadOf(send).runId, f.implementer.id);
  assert.equal(payloadOf(send).arte, true);
  assert.match(payloadOf(send).text, /Juez de arte \(pasada 1 de 2\)[\s\S]*materiales 1\/3[\s\S]*veta de madera/);
  assert.equal(getTask(f.db, f.task.id)!.state, 'implementando');
});

test('juez de arte: en la última pasada lo que queda < 2 se integra igual y queda como pendiente visual en docs/hecho.md', async t => {
  const {f, row} = await juez(t, veredicto({...bien, efectos: 1},
    [{file: 'efectos', line: 1, severity: 'mayor', note: 'Sin polvo al chocar'}]), 1);
  assert.equal(filtered<TestRun>(f.db, 'test_runs', {id: row.id})[0].result, 'passed');
  assert.equal(filtered<Command>(f.db, 'commands', {type: 'worker.send'}).filter(c => payloadOf(c).arte).length, 0);
  const tree = f.implementerTree.path;
  assert.match(readFileSync(join(tree, 'docs', 'hecho.md'), 'utf8'), /PENDIENTE VISUAL: efectos 1\/3 — Sin polvo al chocar/);
  assert.equal(execFileSync('git', ['-C', tree, 'status', '--short', '--', 'docs'], {encoding: 'utf8'}).trim(), '', 'commiteado');
});
