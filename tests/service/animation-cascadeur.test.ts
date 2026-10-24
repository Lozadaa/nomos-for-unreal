import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTask, getTask } from '../../service/src/repo/tasks.ts';
import { listArtifacts } from '../../service/src/repo/artifacts.ts';
import { listDecisions, resolveDecision } from '../../service/src/repo/decisions.ts';
import { filtered } from '../../service/src/repo/rows.ts';
import type { Run } from '../../service/src/model.ts';
import { assetFixture } from './asset-fixture.ts';

const fakeCsc = {bin: process.execPath, baseArgs: [join(import.meta.dirname, '..', 'fakes', 'cascadeur.mjs')]};
const clip = '/Game/Characters/Mannequins/Anims/Unarmed/Attack/MM_Attack_01';

function setup() {
  const f = assetFixture({cascadeur: () => fakeCsc});
  const task = createTask(f.db, {title: 'Ataque limpio', area: 'animacion'});
  const payload = {taskId: task.id, action: 'cleanup', sourceClip: clip, why: 'retarget_rejected'};
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
    assert.deepEqual(decision.options.map(o => o.id), ['manual', 'retarget']);
    assert.match(decision.reason, /licencia/);
    const check = f.db.prepare("select state, detail from capability_checks where id='cascadeur'").get() as {state: string; detail: string};
    assert.equal(check.state, 'roto');
    assert.match(check.detail, /exportación FBX/);
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
    const authored = await f.run({action: 'author', why: 'clip_missing', notes: 'patada giratoria'}, 'csc-2');
    assert.equal(authored.ok, true);
    const [decision] = listDecisions(f.db, 'open');
    assert.match(decision.reason, /Clip nuevo de Cascadeur/);
  } finally { f.close(); }
});
