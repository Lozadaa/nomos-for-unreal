import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTask, getTask } from '../../service/src/repo/tasks.ts';
import { startRun } from '../../service/src/repo/runs.ts';
import { listArtifacts } from '../../service/src/repo/artifacts.ts';
import { listDecisions } from '../../service/src/repo/decisions.ts';
import { acquire, listLeases } from '../../service/src/leases.ts';
import { enqueue } from '../../service/src/commands.ts';
import { filtered } from '../../service/src/repo/rows.ts';
import type { TestRun } from '../../service/src/model.ts';
import { assetFixture } from './asset-fixture.ts';

const fakeFfmpeg = {bin: process.execPath, baseArgs: [join(import.meta.dirname, '..', 'fakes', 'ffmpeg.mjs')]};
const hero = '/Game/MetaHumans/Hudson/BP_Hudson', clip = '/Game/Variant_Combat/Anims/AM_ComboAttack';

function setup(ffmpeg: typeof fakeFfmpeg | null = fakeFfmpeg) {
  const f = assetFixture({ffmpeg: () => ffmpeg});
  const asset = join(f.projectDir, 'Content', 'MetaHumans', 'Hudson', 'BP_Hudson.uasset');
  mkdirSync(join(asset, '..'), {recursive: true}); writeFileSync(asset, 'x');
  const task = createTask(f.db, {title: 'Héroe MetaHuman con ataque', area: 'animacion'});
  const run = (extra: object = {}, id?: string) => f.run('character.setup', {taskId: task.id, mesh: hero, animations: [clip], targetSkeleton: 'metahuman', ...extra}, id);
  const tests = () => filtered<TestRun>(f.db, 'test_runs', {taskId: task.id});
  const labels = () => listArtifacts(f.db, {taskId: task.id}).map(a => (a.provenance as any).label as string);
  return {...f, task, run, tests, labels};
}

test('MetaHuman con el clip retargeteado: comprobación animation en verde con capturas, vídeo e informes con nombre', async () => {
  const f = setup();
  try {
    process.env.KRATOS_FAKE = 'ok';
    const result = await f.run();
    assert.equal(result.passed, true, JSON.stringify(result));
    const [row] = f.tests();
    assert.equal(row.checkId, 'animation');
    assert.equal(row.result, 'passed');
    const labels = f.labels();
    for (const res of ['1280×720', '1920×1080']) for (const pct of ['0 %', '50 %', '90 %'])
      assert.ok(labels.includes(`Animación · captura ${res} · ${pct}`), `${res} ${pct}: ${labels.join(' | ')}`);
    assert.ok(labels.includes('Animación · vídeo 1280×720 · AM_ComboAttack'), labels.join(' | '));
    assert.ok(labels.includes('Retarget · informe') && labels.includes('Deformación · informe') && labels.includes('Animación · registro'));
    assert.ok(labels.every(l => !/\.(png|json|mp4|txt)|[0-9a-f]{8}-/.test(l)), 'ningún nombre de archivo ni uuid');
    const video = listArtifacts(f.db, {taskId: f.task.id, kind: 'video'})[0];
    assert.match(readFileSync(video.path, 'utf8'), /12 fotogramas/);
    assert.match(video.previewPath!, /1280x720-50\.png$/, 'la miniatura del vídeo es el fotograma del 50 %');
    const spec = JSON.parse(readFileSync(join(f.projectDir, 'kratos-personaje.json'), 'utf8'));
    assert.deepEqual(spec, {mesh: hero, animations: [clip], targetSkeleton: 'metahuman'});
    assert.equal(getTask(f.db, f.task.id)!.waitReason, null);
    assert.deepEqual(listLeases(f.db), [], 'la reserva del editor se libera');
  } finally { f.close(); }
});

test('Review Focus 1: cadenas principales sin mapear → Decisión «Retarget manual» con guion y la tarea no avanza', async () => {
  const f = setup();
  try {
    process.env.KRATOS_FAKE = 'critical';
    const result = await f.run();
    assert.equal(result.passed, false);
    const [decision] = listDecisions(f.db, 'open');
    assert.match(decision.reason, /^Retarget manual: Spine, LeftArm sin mapear/);
    assert.deepEqual(decision.options.map(o => o.id), ['manual', 'engine']);
    assert.match(decision.options[0].description, /1\. .*RTG_SKM_Manny_Simple_m_tal_ovw_body/);
    assert.equal(f.tests()[0].result, 'failed');
    assert.equal(listArtifacts(f.db, {taskId: f.task.id, kind: 'video'}).length, 0, 'nunca se graba una animación rota');
    assert.equal(getTask(f.db, f.task.id)!.state, 'pendiente');
  } finally { f.close(); }
});

test('Review Focus 9: vídeo estático → la comprobación falla con «la animación no se reproduce»', async () => {
  const f = setup();
  try {
    process.env.KRATOS_FAKE = 'static';
    const result = await f.run();
    assert.equal(result.passed, false);
    assert.equal(f.tests()[0].result, 'failed');
    const event = f.db.prepare(`select payload from events where type='test.failed'`).get() as {payload: string};
    assert.match(JSON.parse(event.payload).summary, /la animación no se reproduce/);
    assert.match(getTask(f.db, f.task.id)!.blockedReason!, /la animación no se reproduce/);
  } finally { f.close(); }
});

test('deformación fuera de rango a mitad del clip: falla y bloquea con el instante y el hueso', async () => {
  const f = setup();
  try {
    process.env.KRATOS_FAKE = 'deform';
    assert.equal((await f.run()).passed, false);
    assert.match(getTask(f.db, f.task.id)!.blockedReason!, /50 %.*head/);
  } finally { f.close(); }
});

test('Review Focus 10: malla estirada hacia la raíz o prendas sin seguir al cuerpo → falla con el motivo', async () => {
  for (const [mode, text] of [['stretch', /malla estirada hacia la raíz: pelvis a 0/], ['clothes', /prendas sin seguir al cuerpo: Torso/]] as const) {
    const f = setup();
    try {
      process.env.KRATOS_FAKE = mode;
      assert.equal((await f.run()).passed, false, mode);
      assert.match(getTask(f.db, f.task.id)!.blockedReason!, text);
    } finally { f.close(); }
  }
});

test('el vídeo junta la cámara frontal y la lateral en un solo MP4 (hstack)', async () => {
  const f = setup();
  try {
    process.env.KRATOS_FAKE = 'ok';
    await f.run();
    const video = listArtifacts(f.db, {taskId: f.task.id, kind: 'video'})[0];
    assert.match(readFileSync(video.path, 'utf8'), /hstack/);
    assert.equal((video.provenance as any).angles, 2);
  } finally { f.close(); }
});

test('sin ffmpeg: fotogramas en un zip con nombre y el resumen lo dice; nunca un vídeo inventado', async () => {
  const f = setup(null);
  try {
    process.env.KRATOS_FAKE = 'ok';
    assert.equal((await f.run()).passed, true);
    assert.equal(listArtifacts(f.db, {taskId: f.task.id, kind: 'video'}).length, 0);
    assert.ok(f.labels().includes('Animación · fotogramas 1280×720 · AM_ComboAttack'));
    const zip = listArtifacts(f.db, {taskId: f.task.id}).find(a => a.path.endsWith('.zip'))!;
    assert.equal(readFileSync(zip.path).readUInt32LE(0), 0x04034b50);
    const event = f.db.prepare(`select payload from events where type='test.passed'`).get() as {payload: string};
    assert.match(JSON.parse(event.payload).summary, /sin ffmpeg/);
  } finally { f.close(); }
});

test('Review Focus 4: con el editor ocupado por otra tarea, diferido «Esperando editor» sin pisar la reserva', async () => {
  const f = setup();
  try {
    const other = createTask(f.db, {title: 'Otra', area: 'assets'});
    const holder = startRun(f.db, {taskId: other.id, role: 'arte', provider: 'unreal'});
    assert.equal(acquire(f.db, holder.id, other.id, ['editor/Juego']).ok, true);
    const result = await f.run();
    assert.equal(result.deferred, true);
    assert.match(result.reason, /Editor de Juego: ocupado/);
    assert.match(getTask(f.db, f.task.id)!.waitReason!, /^Esperando editor/);
    assert.deepEqual(listLeases(f.db).map(l => l.runId), [holder.id]);
    assert.equal(f.tests().length, 0, 'no se lanza nada');
  } finally { f.close(); }
});

test('malla aún sin migrar con la migración en cola: diferido «Esperando migración»; sin migración, error', async () => {
  const f = setup();
  try {
    const entry = f.entry('Hudson');
    enqueue(f.db, 'asset.migrate', {entryId: entry.id}, `migrate:${entry.id}:Juego`);
    const waiting = await f.run({mesh: '/Game/MetaHumans/Emory/BP_Emory'});
    assert.equal(waiting.deferred, true);
    assert.match(waiting.reason, /Esperando migración/);
    f.db.prepare("update commands set state='done'").run();
    await assert.rejects(f.run({mesh: '/Game/MetaHumans/Emory/BP_Emory'}, 'otra'), /character_mesh_missing/);
    assert.ok(!existsSync(join(f.projectDir, 'kratos-personaje.json')));
  } finally { f.close(); }
});

test('payload inválido', async () => {
  const f = setup();
  try {
    await assert.rejects(f.run({mesh: 'C:/fuera.uasset'}), /invalid_character_payload/);
    await assert.rejects(f.run({animations: []}), /invalid_character_payload/);
    await assert.rejects(f.run({targetSkeleton: 'otro'}), /invalid_character_payload/);
  } finally { f.close(); }
});
