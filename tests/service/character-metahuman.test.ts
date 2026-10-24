import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTask, getTask } from '../../service/src/repo/tasks.ts';
import { listArtifacts } from '../../service/src/repo/artifacts.ts';
import { listDecisions, resolveDecision } from '../../service/src/repo/decisions.ts';
import { listLeases } from '../../service/src/leases.ts';
import { filtered } from '../../service/src/repo/rows.ts';
import type { Run } from '../../service/src/model.ts';
import { assetFixture } from './asset-fixture.ts';

function setup() {
  const f = assetFixture();
  const task = createTask(f.db, {title: 'Héroe MetaHuman propio', area: 'animacion'});
  const run = (id = 'mh-1') => f.run('character.metahuman', {taskId: task.id, name: 'Kratos_Heroe'}, id);
  return {...f, exec: f.run, task, run, runs: () => filtered<Run>(f.db, 'runs', {taskId: task.id})};
}

test('MetaHuman por script: creado y ensamblado, Blueprint en /Game/MetaHumans e informe con nombre', async () => {
  const f = setup();
  try {
    process.env.KRATOS_FAKE = 'ok';
    const result = await f.run();
    assert.equal(result.ok, true);
    assert.equal(result.blueprint, '/Game/MetaHumans/Kratos_Heroe/BP_Kratos_Heroe');
    assert.deepEqual(listArtifacts(f.db, {taskId: f.task.id}).map(a => (a.provenance as any).label), ['MetaHuman · informe']);
    assert.equal(f.runs()[0].state, 'done');
    assert.deepEqual(listLeases(f.db), []);
  } finally { f.close(); }
});

test('Review Focus 5: si pide la nube o la GUI, la run queda esperando externo con Decisión y guion, sin darse por hecha', async () => {
  const f = setup();
  try {
    process.env.KRATOS_FAKE = 'cloud';
    const result = await f.run();
    assert.equal(result.deferred, true);
    const [decision] = listDecisions(f.db, 'open');
    assert.match(decision.reason, /MetaHuman por script no terminó: .*nube/);
    assert.deepEqual(decision.options.map(o => o.id), ['editor', 'engine']);
    assert.match(decision.options[0].description, /1\. .*5\. /);
    const [run] = f.runs();
    assert.equal(run.state, 'running');
    assert.equal(run.metadata.phase, 'waiting');
    assert.match(getTask(f.db, f.task.id)!.waitReason!, /^Esperando externo/);
    // reintento de la orden mientras se decide: no relanza el editor
    assert.equal((await f.run()).deferred, true);
    assert.equal(listArtifacts(f.db, {taskId: f.task.id}).length, 1);
    resolveDecision(f.db, decision.id, 'editor', 'usuario');
    const assisted = await f.run();
    assert.equal(assisted.assisted, true);
    assert.equal(f.runs()[0].state, 'cancelled');
    assert.match(getTask(f.db, f.task.id)!.waitReason!, /Esperando al usuario/);
    assert.notEqual(getTask(f.db, f.task.id)!.state, 'done');
  } finally { f.close(); }
});

test('sin el plugin activo en el proyecto: la misma Decisión, con activar el plugin en el guion', async () => {
  const f = setup();
  try {
    process.env.KRATOS_FAKE = 'noplugin';
    assert.equal((await f.run()).deferred, true);
    const [decision] = listDecisions(f.db, 'open');
    assert.match(decision.reason, /plugin MetaHumanCharacter/);
    assert.match(decision.options[0].description, /Activa el plugin MetaHumanCharacter/);
  } finally { f.close(); }
});

test('nombre inválido', async () => {
  const f = setup();
  try {
    await assert.rejects(f.exec('character.metahuman', {taskId: f.task.id, name: '../fuera'}), /invalid_metahuman_payload/);
    await assert.rejects(f.exec('character.metahuman', {taskId: f.task.id}), /invalid_metahuman_payload/);
  } finally { f.close(); }
});
