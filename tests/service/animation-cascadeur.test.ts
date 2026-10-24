import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTask, getTask } from '../../service/src/repo/tasks.ts';
import { listArtifacts } from '../../service/src/repo/artifacts.ts';
import { listDecisions, resolveDecision } from '../../service/src/repo/decisions.ts';
import { acquire, release } from '../../service/src/leases.ts';
import { startRun } from '../../service/src/repo/runs.ts';
import { filtered } from '../../service/src/repo/rows.ts';
import type { Run } from '../../service/src/model.ts';
import { assetFixture } from './asset-fixture.ts';

const fakeCsc = {bin: process.execPath, baseArgs: [join(import.meta.dirname, '..', 'fakes', 'cascadeur.mjs')]};
const clip = '/Game/Characters/Mannequins/Anims/Unarmed/Attack/MM_Attack_01';

function setup() {
  const f = assetFixture({cascadeur: () => fakeCsc});
  const task = createTask(f.db, {title: 'Ataque limpio', area: 'animacion'});
  const payload = {taskId: task.id, action: 'cleanup', sourceClip: clip, why: 'retarget_rejected', mesh: '/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple'};
  const run = (extra: object = {}, id = 'csc-1') => f.run('animation.cascadeur', {...payload, ...extra}, id);
  return {...f, task, run, runs: () => filtered<Run>(f.db, 'runs', {taskId: task.id})};
}

test('camino automático: Unreal exporta, Cascadeur limpia sin ventana (FBX sin mallas, Z arriba, binario) y Unreal importa el clip', async () => {
  const f = setup();
  try {
    process.env.KRATOS_FAKE = 'ok'; process.env.KRATOS_CSC_FAKE = 'ok';
    const result = await f.run();
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.clip, '/Game/Kratos/Cascadeur/MM_Attack_01_cascadeur');
    const job = JSON.parse(readFileSync(join(f.dataDir, 'cascadeur', 'jobs', `${f.runs()[0].id}.json`), 'utf8'));
    assert.equal(job.action, 'cleanup');
    assert.deepEqual(job.export, {up_axis: 'Z', mode: 'Binary', meshes: false});
    assert.ok(existsSync(join(f.dataDir, 'cascadeur', 'out', `${f.runs()[0].id}.fbx`)));
    assert.deepEqual(listArtifacts(f.db, {taskId: f.task.id}).map(a => (a.provenance as any).label), ['Cascadeur · informe']);
    assert.equal(f.runs()[0].state, 'done');
  } finally { f.close(); }
});

test('Review Focus 7: sin el flag, la run espera con Decisión y guion; el FBX dejado a mano en out/ reanuda solo', async () => {
  const f = setup();
  try {
    process.env.KRATOS_FAKE = 'ok'; process.env.KRATOS_CSC_FAKE = 'noflag';
    const first = await f.run();
    assert.equal(first.deferred, true);
    const [decision] = listDecisions(f.db, 'open');
    assert.match(decision.reason, /Cascadeur no terminó solo/);
    assert.match(decision.options[0].description, /Commands › Kratos › cleanup/);
    const [run] = f.runs();
    assert.equal(run.state, 'running');
    assert.match(getTask(f.db, f.task.id)!.waitReason!, /^Esperando externo: Cascadeur/);
    assert.equal((await f.run()).deferred, true, 'sin archivo sigue esperando, sin relanzar nada');
    mkdirSync(join(f.dataDir, 'cascadeur', 'out'), {recursive: true});
    writeFileSync(join(f.dataDir, 'cascadeur', 'out', `${run.id}.fbx`), 'fbx a mano');
    const resumed = await f.run();
    assert.equal(resumed.ok, true);
    assert.equal(listDecisions(f.db, 'open').length, 0, 'la Decisión se cierra al llegar el archivo');
  } finally { f.close(); }
});

test('sin licencia de exportación FBX: Capacidades lo dice y la Decisión ofrece exportar a mano o usar solo retarget', async () => {
  const f = setup();
  try {
    process.env.KRATOS_FAKE = 'ok'; process.env.KRATOS_CSC_FAKE = 'license';
    assert.equal((await f.run()).deferred, true);
    const [decision] = listDecisions(f.db, 'open');
    assert.deepEqual(decision.options.map(o => o.label), ['Exportar a mano', 'Usar solo retarget', 'Activar licencia']);
    assert.match(decision.options[2].description, /Indie o Pro \(https:\/\/cascadeur\.com\/plans\)/);
    assert.match(decision.reason, /licencia/);
    const check = f.db.prepare("select state, detail from capability_checks where id='cascadeur'").get() as {state: string; detail: string};
    assert.equal(check.state, 'roto');
    assert.match(check.detail, /^Plan Basic: solo guarda \.casc; la exportación FBX exige Indie o Pro/);
    resolveDecision(f.db, decision.id, 'retarget', 'usuario');
    assert.deepEqual(await f.run(), {fallback: 'retarget'});
    assert.equal(f.runs()[0].state, 'cancelled');
  } finally { f.close(); }
});

test('política: Cascadeur solo si falta el clip, el QA rechazó el retarget o lo pide el usuario; un clip nuevo pide Decisión', async () => {
  const f = setup();
  try {
    await assert.rejects(f.run({why: undefined}), /cascadeur_not_justified/);
    await assert.rejects(f.run({why: 'por_defecto'}), /cascadeur_not_justified/);
    await assert.rejects(f.run({action: 'rig'}), /invalid_cascadeur_payload/);
    process.env.KRATOS_FAKE = 'ok'; process.env.KRATOS_CSC_FAKE = 'ok';
    // crear un clip no se hace por script: author va siempre por el camino asistido, aunque haya licencia
    const authored = await f.run({action: 'author', why: 'clip_missing', notes: 'patada giratoria'}, 'csc-2');
    assert.equal(authored.deferred, true);
    assert.match(listDecisions(f.db, 'open')[0].reason, /Cascadeur no terminó solo: crear un clip nuevo es trabajo de animador/);
  } finally { f.close(); }
});

test('el clip de Cascadeur pasa por character.setup (QA) antes de nada; un clip nuevo pide su Decisión solo con ese QA en verde', async () => {
  const f = setup();
  try {
    process.env.KRATOS_FAKE = 'ok'; process.env.KRATOS_CSC_FAKE = 'ok';
    const result = await f.run();
    const setups = (f.db.prepare("select payload from commands where type='character.setup'").all() as {payload: string}[]).map(r => JSON.parse(r.payload));
    assert.deepEqual(setups, [{taskId: f.task.id, mesh: '/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple', animations: [result.clip]}]);
    assert.equal(listDecisions(f.db, 'open').length, 0, 'cleanup no es un clip nuevo: su puerta es la comprobación animation');
  } finally { f.close(); }
});

test('Review Focus 7 con el editor ocupado al reanudar: no re-exporta ni pisa el FBX hecho a mano', async () => {
  const f = setup();
  try {
    process.env.KRATOS_FAKE = 'ok'; process.env.KRATOS_CSC_FAKE = 'noflag';
    await f.run();
    const [run] = f.runs(), out = join(f.dataDir, 'cascadeur', 'out', `${run.id}.fbx`);
    mkdirSync(join(out, '..'), {recursive: true}); writeFileSync(out, 'fbx a mano');
    const other = createTask(f.db, {title: 'Otra', area: 'assets'}), holder = startRun(f.db, {taskId: other.id, role: 'arte', provider: 'unreal'});
    acquire(f.db, holder.id, other.id, ['editor/Juego']);
    assert.equal((await f.run()).deferred, true);
    release(f.db, holder.id);
    process.env.KRATOS_CSC_FAKE = 'ok';
    assert.equal((await f.run()).ok, true);
    assert.equal(readFileSync(out, 'utf8'), 'fbx a mano');
  } finally { f.close(); }
});

test('«Activar licencia»: con la licencia ya activa, el trabajo se repite en una run nueva y sigue solo', async () => {
  const f = setup();
  try {
    process.env.KRATOS_FAKE = 'ok'; process.env.KRATOS_CSC_FAKE = 'license';
    await f.run();
    resolveDecision(f.db, listDecisions(f.db, 'open')[0].id, 'license', 'usuario');
    process.env.KRATOS_CSC_FAKE = 'ok';
    const again = await f.run();
    assert.equal(again.ok, true, JSON.stringify(again));
    assert.deepEqual(f.runs().map(r => r.state), ['cancelled', 'done']);
  } finally { f.close(); }
});
