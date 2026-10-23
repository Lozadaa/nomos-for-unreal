import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { filtered } from '../../service/src/repo/rows.ts';
import { getTask, moveTask } from '../../service/src/repo/tasks.ts';
import { recordTestRun, updateTestRun } from '../../service/src/repo/artifacts.ts';
import { listDecisions } from '../../service/src/repo/decisions.ts';
import { startRun } from '../../service/src/repo/runs.ts';
import { appendEvent } from '../../service/src/store.ts';
import { advance } from '../../service/src/handlers/checks.ts';
import { summarize } from '../../service/src/checks/run.ts';
import { createUnrealCmd } from '../../service/src/adapters/unreal-cmd.ts';
import type { Command, TestRun } from '../../service/src/model.ts';
import { checksFixture } from './checks-fixture.ts';

const rows = (f: {db: any; task: {id: string}}) => filtered<TestRun>(f.db, 'test_runs', {taskId: f.task.id});
const COMMIT = 'abc1234def5678';

test('Crítico 1: diff solo WBP con QA en curso → checks.run no encola otro ciclo y la aprobación del QA integra', async () => {
  const f = checksFixture({files: ['Content/UI/WBP_Vida.uasset']});
  try {
    const qa = recordTestRun(f.db, {taskId: f.task.id, runId: f.implementer.id, checkId: 'umg', result: 'running', commit: COMMIT});
    assert.equal((await f.run()).passed, false);
    const placeholder = rows(f).find(r => r.id !== qa.id)!;
    assert.deepEqual([placeholder.checkId, placeholder.result, placeholder.commit], ['umg', 'pending', COMMIT], 'la fila del lote lleva el commit');
    assert.equal(filtered<Command>(f.db, 'commands', {type: 'ui.cycle'}).length, 0, 'el ciclo en curso basta');
    updateTestRun(f.db, qa.id, {result: 'passed'});
    assert.equal(advance(f.ctx, f.task.id), true, 'la aprobación del QA desbloquea la puerta pese a la fila pendiente del lote');
    assert.equal(getTask(f.db, f.task.id)!.state, 'integrando');
  } finally { f.close(); }
});

test('Crítico 1: sin ciclo UMG para el commit se encola uno con clave propia aunque el del DONE ya exista', async () => {
  const f = checksFixture({files: ['Content/UI/WBP_Vida.uasset']});
  try {
    const {enqueue} = await import('../../service/src/commands.ts');
    const {uiCycleKey} = await import('../../service/src/handlers/ui-cycle.ts');
    enqueue(f.db, 'ui.cycle', {taskId: f.task.id, runId: f.implementer.id}, uiCycleKey(f.implementer));
    f.db.prepare("update commands set state='done' where type='ui.cycle'").run();
    await f.run();
    const cycles = filtered<Command>(f.db, 'commands', {type: 'ui.cycle'});
    assert.equal(cycles.length, 2);
    assert.equal(cycles[1].state, 'pending');
  } finally { f.close(); }
});

test('Importante 2: una comprobación que el diff ya no exige no bloquea la puerta', async () => {
  const f = checksFixture({files: ['Source/Juego/Vida.cpp']});
  try {
    process.env.KRATOS_FAKE = 'fail';
    await f.run();
    assert.equal(rows(f)[0].result, 'failed');
    moveTask(f.db, f.task.id, 'probando');
    f.setFiles(['docs/notas.md']);
    const again = await f.run();
    assert.equal(again.advanced, true);
    assert.equal(getTask(f.db, f.task.id)!.state, 'integrando');
  } finally { f.close(); }
});

test('Importante 3: un asset borrado no se valida como si debiera existir', async () => {
  const f = checksFixture({files: ['Content/Maps/Viejo.umap', 'Content/Maps/Nuevo.umap']});
  try {
    const {rmSync} = await import('node:fs');
    rmSync(join(f.projectDir, 'Content', 'Maps', 'Viejo.umap'));
    process.env.KRATOS_FAKE = 'ok';
    assert.equal((await f.run()).passed, true);
    const log = rows(f)[0].reportPath!;
    const {readFileSync} = await import('node:fs');
    const text = readFileSync(log, 'utf8');
    assert.match(text, /\/Game\/Maps\/Nuevo/);
    assert.doesNotMatch(text, /\/Game\/Maps\/Viejo/);
  } finally { f.close(); }
});

test('Importante 4: una Decisión de checks caducada se regenera y espera; no relanza el lote', async () => {
  const f = checksFixture({files: ['Content/Blueprints/BP_Puerta.uasset'], engine: false});
  try {
    assert.equal((await f.run({taskId: f.task.id}, 'cmd-s')).deferred, true);
    const before = rows(f).length;
    appendEvent(f.db, 'worker.output', null, {taskId: f.task.id, lines: ['otro run escribe']});
    const [open] = listDecisions(f.db, 'open');
    const {resolveDecision} = await import('../../service/src/repo/decisions.ts');
    assert.throws(() => resolveDecision(f.db, open.id, 'continue', 'usuario'), /decision_stale/);
    const again = await f.run({taskId: f.task.id}, 'cmd-s');
    assert.equal(again.deferred, true);
    assert.equal(rows(f).length, before, 'sin filas nuevas');
    assert.equal(listDecisions(f.db, 'open').length, 1, 'la Decisión vuelve a estar abierta');
  } finally { f.close(); }
});

test('Importante 5: el resumen conserva el titular aunque no diga «error»', () => {
  const lines = ['Tiempo máximo agotado: se cerró el editor', ...Array.from({length: 40}, (_, i) => `LogX: Error: ruido ${i}`)];
  const out = summarize(lines);
  assert.equal(out[0], 'Tiempo máximo agotado: se cerró el editor');
  assert.equal(out.length, 30);
  const cpp = Array.from({length: 400}, (_, i) => `a.cpp(${i}): error C2065`);
  assert.deepEqual(summarize(cpp), cpp.slice(0, 30));
});

test('Importante 6: el script de la captura con espacios en la ruta llega por variable de entorno', async () => {
  process.env.KRATOS_FAKE = 'ok';
  const fake = join(import.meta.dirname, '..', 'fakes', 'unreal-cmd.mjs');
  const script = 'C:/Archivos de Juan, Pérez/kratos_pie_capture.py';
  const {mkdtempSync} = await import('node:fs');
  const {tmpdir} = await import('node:os');
  const shot = join(mkdtempSync(join(tmpdir(), 'kratos-shot-')), 'ui.png');
  const run = await createUnrealCmd({bin: process.execPath, baseArgs: [fake]}).runPython('C:/J/Juego.uproject', script, {KRATOS_SHOT: shot}, 5000,
    {render: {width: 1280, height: 720}});
  const args = run.reportJson!.args as string[];
  const exec = args.find(a => a.startsWith('-ExecCmds='))!;
  assert.doesNotMatch(exec, /,|Archivos/, 'sin comas ni la ruta dentro de ExecCmds');
  assert.equal(run.reportJson!.script, script);
});

test('Importante 7: tras un reinicio, las filas en curso del run reutilizado se vuelven a ejecutar', async () => {
  const f = checksFixture({files: ['Content/Blueprints/BP_Puerta.uasset']});
  try {
    process.env.KRATOS_FAKE = 'ok';
    const command = {id: 'cmd-r'};
    const run = startRun(f.db, {taskId: f.task.id, role: 'qa', provider: 'unreal', metadata: {commandId: command.id}});
    recordTestRun(f.db, {taskId: f.task.id, runId: run.id, checkId: 'blueprint', result: 'running', commit: COMMIT});
    const result = await f.run({taskId: f.task.id}, 'cmd-r');
    assert.equal(result.passed, true);
    assert.equal(rows(f).filter(r => r.runId === run.id)[0].result, 'passed');
  } finally { f.close(); }
});
