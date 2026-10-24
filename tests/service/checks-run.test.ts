import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { filtered } from '../../service/src/repo/rows.ts';
import { getTask } from '../../service/src/repo/tasks.ts';
import { listArtifacts } from '../../service/src/repo/artifacts.ts';
import { listDecisions, resolveDecision } from '../../service/src/repo/decisions.ts';
import { acquire, listLeases } from '../../service/src/leases.ts';
import { startRun } from '../../service/src/repo/runs.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import type { Command, TestRun } from '../../service/src/model.ts';
import { checksFixture } from './checks-fixture.ts';

const rows = (f: {db: any; task: {id: string}}) => filtered<TestRun>(f.db, 'test_runs', {taskId: f.task.id});

test('Blueprint en verde: TestRun con commit, motor, log como artefacto y la tarea pasa a integrando', async () => {
  const f = checksFixture({files: ['Content/Blueprints/BP_Puerta.uasset']});
  try {
    process.env.NOMOS_FAKE = 'ok';
    const result = await f.run();
    assert.equal(result.passed, true);
    assert.equal(result.advanced, true);
    const [row] = rows(f);
    assert.deepEqual([row.checkId, row.result, row.commit, row.engineVersion], ['blueprint', 'passed', 'abc1234def5678', '5.8.3']);
    assert.ok(row.reportPath!.endsWith(`tests\\${row.id}\\log.txt`) || row.reportPath!.endsWith(`tests/${row.id}/log.txt`));
    assert.ok(listArtifacts(f.db, {taskId: f.task.id, kind: 'report'}).some(a => a.path === row.reportPath));
    assert.deepEqual(f.events('test.passed').map(e => e.check), ['blueprint']);
    assert.equal(getTask(f.db, f.task.id)!.state, 'integrando');
    assert.deepEqual(listLeases(f.db), [], 'la reserva del editor se libera');
  } finally { f.close(); }
});

test('C++ con 400 líneas de error: log completo en artefacto, evento con 30, vuelve al responsable con la ruta y para ahí', async () => {
  const f = checksFixture({files: ['Source/Juego/Vida.cpp', 'Content/Blueprints/BP_Puerta.uasset']});
  try {
    process.env.NOMOS_FAKE = 'fail';
    const result = await f.run();
    assert.equal(result.passed, false);
    const [cpp, bp] = rows(f);
    assert.equal(cpp.result, 'failed');
    assert.equal(bp.result, 'pending', 'el primer fallo detiene el resto');
    assert.equal(readFileSync(cpp.reportPath!, 'utf8').split('error C2065').length - 1, 800, '400 en el resumen del log y 400 en el log');
    const [event] = f.events('test.failed');
    assert.equal(event.summary.split('\n').length, 30);
    const [send] = filtered<Command>(f.db, 'commands', {type: 'worker.send'});
    const payload = JSON.parse(send.payload as unknown as string);
    assert.equal(payload.runId, f.implementer.id);
    assert.ok(payload.text.includes(cpp.reportPath!));
    assert.equal(getTask(f.db, f.task.id)!.state, 'implementando');
  } finally { f.close(); }
});

test('motor ausente: unavailable, nunca passed; Decisión «Continuar sin esta comprobación / Reintentar»', async () => {
  const f = checksFixture({files: ['Content/Blueprints/BP_Puerta.uasset'], engine: false});
  try {
    const first = await f.run({taskId: f.task.id}, 'cmd-1');
    assert.equal(first.deferred, true);
    assert.equal(rows(f)[0].result, 'unavailable');
    const [decision] = listDecisions(f.db, 'open');
    assert.deepEqual(decision.options.map(o => o.label), ['Continuar sin esta comprobación', 'Reintentar']);
    assert.equal((await f.run({taskId: f.task.id}, 'cmd-1')).deferred, true, 'mientras está abierta, espera');
    assert.equal(getTask(f.db, f.task.id)!.state, 'probando');
    resolveDecision(f.db, decision.id, 'continue', 'usuario');
    const after = await f.run({taskId: f.task.id}, 'cmd-1');
    assert.equal(after.advanced, true);
    assert.equal(getTask(f.db, f.task.id)!.state, 'integrando');
    assert.equal(rows(f).filter(r => r.result === 'passed').length, 0, 'no se inventa un passed');
  } finally { f.close(); }
});

test('mapa con assets rotos: Data Validation antes de jugar y Decisión con la lista', async () => {
  const f = checksFixture({files: ['Content/Maps/Nivel1.umap', 'Content/Props/BP_Caja.uasset']});
  try {
    process.env.NOMOS_FAKE = 'validate_fail';
    const result = await f.run({taskId: f.task.id}, 'cmd-map');
    assert.equal(result.deferred, true);
    const map = rows(f).find(r => r.checkId === 'map')!;
    assert.equal(map.result, 'failed');
    const [decision] = listDecisions(f.db, 'open');
    assert.match(decision.reason, /Assets rotos/);
    assert.ok(decision.evidence.some(e => e.kind === 'asset' && /Dependencia rota/.test(e.ref)));
    assert.equal(listArtifacts(f.db, {taskId: f.task.id, kind: 'screenshot'}).length, 0, 'no se juega con assets rotos');
    resolveDecision(f.db, decision.id, 'return', 'usuario');
    assert.equal((await f.run({taskId: f.task.id}, 'cmd-map')).returned, true);
    assert.equal(filtered<Command>(f.db, 'commands', {type: 'worker.send'}).length, 1);
  } finally { f.close(); }
});

test('mapa válido: juego a 1280×720 con captura como artefacto y mapa en el TestRun', async () => {
  const f = checksFixture({files: ['Content/Maps/Nivel1.umap']});
  try {
    process.env.NOMOS_FAKE = 'ok';
    assert.equal((await f.run()).passed, true);
    const [row] = rows(f);
    assert.deepEqual([row.result, row.map, row.config], ['passed', '/Game/Maps/Nivel1', '1280x720']);
    const [shot] = listArtifacts(f.db, {taskId: f.task.id, kind: 'screenshot'});
    assert.ok(existsSync(shot.path));
    assert.deepEqual((shot.provenance as any).resolution, '1280x720');
  } finally { f.close(); }
});

test('editor ocupado: la orden se difiere con el motivo y no ejecuta nada', async () => {
  const f = checksFixture({files: ['Content/Maps/Nivel1.umap']});
  try {
    const other = createTask(f.db, {title: 'Otra', area: 'ui'}), holder = startRun(f.db, {taskId: other.id, role: 'qa', provider: 'claude'});
    acquire(f.db, holder.id, other.id, ['editor/Juego']);
    const result = await f.run();
    assert.deepEqual(result, {deferred: true, reason: 'Editor de Juego: ocupado por qa · claude'});
    assert.ok(rows(f).every(r => r.result === 'pending'));
  } finally { f.close(); }
});

test('diff sin Unreal: test.skipped «el diff no toca Unreal» y pasa sin pruebas', async () => {
  const f = checksFixture({files: ['Scripts/kratos-hito3/health.mjs']});
  try {
    const result = await f.run();
    assert.equal(result.advanced, true);
    assert.equal(f.events('test.skipped')[0].summary, 'el diff no toca Unreal');
  } finally { f.close(); }
});

test('build: empaqueta, arranca el ejecutable y guarda captura y ejecutable como evidencia', async () => {
  const f = checksFixture({files: ['Config/DefaultGame.ini']});
  try {
    process.env.NOMOS_FAKE = 'ok';
    assert.equal((await f.run()).passed, true);
    const kinds = listArtifacts(f.db, {taskId: f.task.id}).map(a => a.kind).sort();
    assert.deepEqual(kinds, ['build', 'report', 'screenshot']);
  } finally { f.close(); }
});

test('UMG sin ciclo aprobado: se encola ui.cycle y la fila queda pendiente', async () => {
  const f = checksFixture({files: ['Content/UI/WBP_Vida.uasset']});
  try {
    const result = await f.run();
    assert.equal(result.passed, false);
    assert.equal(rows(f)[0].result, 'pending');
    assert.equal(filtered<Command>(f.db, 'commands', {type: 'ui.cycle'}).length, 1);
    assert.equal(getTask(f.db, f.task.id)!.state, 'probando');
  } finally { f.close(); }
});

test('hito 5b: un diff con la ficha del personaje y su clip pasa la comprobación animation y avanza a integrando', async () => {
  const {join} = await import('node:path');
  const {writeFileSync} = await import('node:fs');
  const {filtered} = await import('../../service/src/repo/rows.ts');
  const ff = {bin: process.execPath, baseArgs: [join(import.meta.dirname, '..', 'fakes', 'ffmpeg.mjs')]};
  const f = checksFixture({area: 'animacion', files: ['nomos-personaje.json', 'Content/Kratos/Retarget/m_tal_ovw_body/AM_ComboAttack_m_tal_ovw_body.uasset'],
    deps: {ffmpeg: () => ff}});
  try {
    process.env.NOMOS_FAKE = 'ok';
    writeFileSync(join(f.projectDir, 'nomos-personaje.json'), JSON.stringify({mesh: '/Game/MetaHumans/Hudson/BP_Hudson',
      animations: ['/Game/Variant_Combat/Anims/AM_ComboAttack'], targetSkeleton: 'metahuman'}));
    const result = await f.run();
    assert.equal(result.passed, true, JSON.stringify(f.events('test.failed')));
    const rows = filtered<any>(f.db, 'test_runs', {taskId: f.task.id});
    assert.deepEqual(rows.map((r: any) => [r.checkId, r.result]), [['animation', 'passed']]);
    assert.equal(f.db.prepare("select count(*) n from artifacts where kind='video'").get()!.n, 1);
    assert.equal(result.advanced, true);
  } finally { f.close(); }
});
