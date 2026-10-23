import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { integrateRun } from '../../service/src/handlers/integrate.ts';
import { filtered } from '../../service/src/repo/rows.ts';
import { createTask, getTask } from '../../service/src/repo/tasks.ts';
import { finishRun, startRun } from '../../service/src/repo/runs.ts';
import { listDecisions, resolveDecision } from '../../service/src/repo/decisions.ts';
import { listArtifacts, recordTestRun } from '../../service/src/repo/artifacts.ts';
import { listLeases } from '../../service/src/leases.ts';
import type { Command, Run } from '../../service/src/model.ts';
import { integrationFixture } from './integration-fixture.ts';
import { fixture, requestJson } from '../helpers.ts';

type F = ReturnType<typeof integrationFixture>;
const integrate = (f: F, taskId: string, id = `int-${taskId}`) =>
  integrateRun(f.command('integrate.run', {taskId}, id), f.ctx) as Promise<Record<string, any>>;
const commands = (f: F, type: string) => filtered<Command>(f.db, 'commands', {type}).map(c => ({...c, payload: JSON.parse(c.payload as unknown as string)}));
/** Simula que `checks.run` terminó con ese resultado para la tarea. */
function checksFinished(f: F, taskId: string, result: 'passed' | 'failed') {
  const command = commands(f, 'checks.run').filter(c => c.payload.taskId === taskId).at(-1)!;
  f.db.prepare("update commands set state='done' where id=?").run(command.id);
  recordTestRun(f.db, {taskId, checkId: 'cpp', result});
  return command;
}

test('merge limpio: integra con --no-ff en el workspace del proyecto, avanza master y pasa a cerrando con atribución', async () => {
  const f = integrationFixture();
  try {
    const a = f.addTask('vida');
    const result = await integrate(f, a.task.id);
    assert.equal(result.integrated, true);
    const master = f.repo.git(f.repo.dir, 'rev-parse', 'master');
    assert.equal(result.commit, master);
    assert.ok(existsSync(join(f.repo.dir, 'Source', 'Vida.cpp')), 'el checkout del usuario recibe el cambio');
    assert.ok(existsSync(join(f.dataDir, 'integration', 'Juego', 'Source', 'Vida.cpp')), 'workspace por proyecto');
    const task = getTask(f.db, a.task.id)!;
    assert.equal(task.state, 'cerrando');
    assert.equal(task.attribution.integro[0].agentName, 'Gameplay Builder');
    const [event] = f.events('integration.completed');
    assert.deepEqual([event.commit, event.branch, event.files, event.rechecked], [master, 'master', ['Source/Vida.cpp'], false]);
    assert.match(f.events('task.moved').at(-1)!.reason, /^Integrado en master@[0-9a-f]{7}$/);
    const integrator = filtered<Run>(f.db, 'runs', {taskId: a.task.id}).at(-1)!;
    assert.deepEqual([integrator.provider, integrator.role, integrator.state], ['kratos', 'integrador', 'done']);
    assert.deepEqual(listLeases(f.db), []);
    assert.equal(commands(f, 'checks.run').length, 0, 'base igual: no recomprueba');
  } finally { f.close(); }
});

test('conflicto de texto: abortMerge, workspace limpio, Decisión con diff3; «Resolver en el worktree» devuelve al responsable', async () => {
  const f = integrationFixture();
  try {
    const a = f.addTask('notas', {'notas.txt': 'uno\nDOS rama\ntres\n'});
    f.repo.commitMaster({'notas.txt': 'uno\nDOS master\ntres\n'});
    const first = await integrate(f, a.task.id);
    assert.equal(first.deferred, true);
    assert.equal(f.repo.git(join(f.dataDir, 'integration', 'Juego'), 'status', '--porcelain'), '');
    const [decision] = listDecisions(f.db, 'open');
    assert.deepEqual(decision.options.map(o => o.label), ['Resolver en el worktree', 'Descartar la integración']);
    assert.match(decision.reason, /^Conflicto al integrar en master: notas\.txt$/);
    const [report] = listArtifacts(f.db, {taskId: a.task.id, kind: 'report'});
    assert.equal((report.provenance as any).label, 'Integración · conflicto');
    assert.match(readFileSync(join(f.dataDir, 'artifacts', report.path), 'utf8'), /DOS master[\s\S]*\|\|\|\|\|\|\|[\s\S]*DOS rama/);
    assert.equal((await integrate(f, a.task.id)).deferred, true, 'mientras la Decisión está abierta, espera');
    resolveDecision(f.db, decision.id, 'resolve', 'usuario');
    assert.equal((await integrate(f, a.task.id)).returned, true);
    const [send] = commands(f, 'worker.send');
    assert.equal(send.payload.runId, a.implementer.id);
    assert.match(send.payload.text, /notas\.txt/);
    assert.equal(f.repo.git(f.repo.dir, 'show', 'master:notas.txt'), 'uno\nDOS master\ntres', 'master sin tocar');
  } finally { f.close(); }
});

test('conflicto binario (.uasset): nada se resuelve; Decisión con los shas de cada rama y quién lo integró antes', async () => {
  const f = integrationFixture();
  try {
    const mapa = f.addTask('mapa', {'Content/BP_Puerta.uasset': Buffer.from([0, 1, 2, 3])});
    const otra = f.addTask('otra', {'Content/BP_Puerta.uasset': Buffer.from([0, 9, 9, 9])});
    assert.equal((await integrate(f, otra.task.id)).integrated, true);
    const result = await integrate(f, mapa.task.id);
    assert.equal(result.deferred, true);
    const [decision] = listDecisions(f.db, 'open');
    assert.match(decision.reason, /^Conflicto binario al integrar en master: BP_Puerta\.uasset$/);
    const version = decision.evidence.find(e => e.kind === 'version')!.ref;
    const ours = f.repo.git(f.repo.dir, 'rev-parse', 'master:Content/BP_Puerta.uasset').slice(0, 7);
    const theirs = f.repo.git(f.repo.dir, 'rev-parse', 'kratos/mapa:Content/BP_Puerta.uasset').slice(0, 7);
    assert.ok(version.includes(`master ${ours}`) && version.includes(`kratos/mapa ${theirs}`), version);
    assert.match(version, /antes: Tarea otra \(integro: Gameplay Builder\)/);
    resolveDecision(f.db, decision.id, 'discard', 'usuario');
    assert.equal((await integrate(f, mapa.task.id)).discarded, true);
    assert.equal(getTask(f.db, mapa.task.id)!.state, 'probando');
  } finally { f.close(); }
});

test('dos integraciones casi a la vez: la segunda espera la reserva y al entrar recomprueba sobre la base cambiada', async () => {
  const f = integrationFixture();
  try {
    const a = f.addTask('a', {'Source/A.cpp': 'a\n'}), b = f.addTask('b', {'Source/B.cpp': 'b\n'});
    f.repo.commitMaster({'otro.txt': 'cambio externo\n'});
    const first = await integrate(f, a.task.id);
    assert.deepEqual(first, {deferred: true, reason: 'Recomprobando sobre la rama objetivo'});
    const [checks] = commands(f, 'checks.run');
    assert.deepEqual([checks.payload.files, checks.payload.dir], [['Source/A.cpp'], join(f.dataDir, 'integration', 'Juego')]);
    const second = await integrate(f, b.task.id);
    assert.equal(second.deferred, true);
    assert.match(second.reason, /^Esperando reserva: Juego/);
    assert.match(getTask(f.db, b.task.id)!.waitReason!, /Esperando reserva/);
    checksFinished(f, a.task.id, 'passed');
    assert.equal((await integrate(f, a.task.id)).integrated, true);
    assert.equal(f.events('integration.completed')[0].rechecked, true);
    assert.deepEqual(await integrate(f, b.task.id), {deferred: true, reason: 'Recomprobando sobre la rama objetivo'});
    assert.deepEqual(commands(f, 'checks.run').at(-1)!.payload.files, ['Source/B.cpp']);
  } finally { f.close(); }
});

test('la recomprobación falla: la tarea vuelve a probando con motivo y master no se toca', async () => {
  const f = integrationFixture();
  try {
    const a = f.addTask('a');
    const before = f.repo.commitMaster({'otro.txt': 'x\n'});
    await integrate(f, a.task.id);
    checksFinished(f, a.task.id, 'failed');
    assert.deepEqual(await integrate(f, a.task.id), {integrated: false});
    assert.equal(getTask(f.db, a.task.id)!.state, 'probando');
    assert.equal(f.events('task.moved').at(-1)!.reason, 'Pruebas sin pasar: cpp');
    assert.equal(f.repo.git(f.repo.dir, 'rev-parse', 'master'), before);
    assert.equal(f.repo.git(join(f.dataDir, 'integration', 'Juego'), 'rev-parse', 'HEAD'), before, 'el workspace descarta el merge');
    assert.deepEqual(listLeases(f.db), []);
  } finally { f.close(); }
});

test('solo se integra una tarea aprobada en integrando; integrando → cerrando exige motivo', async () => {
  const f = integrationFixture();
  try {
    const a = f.addTask('a', undefined, 'probando');
    await assert.rejects(integrate(f, a.task.id), /invalid_transition/);
    const {moveTask} = await import('../../service/src/repo/tasks.ts');
    f.db.prepare("update tasks set state='integrando' where id=?").run(a.task.id);
    assert.throws(() => moveTask(f.db, a.task.id, 'cerrando'), /invalid_transition/);
  } finally { f.close(); }
});

test('POST /tasks/:id/integrate encola una sola orden viva y rechaza tareas sin aprobar', async t => {
  const {server, db} = await fixture(t);
  const task = createTask(db, {title: 'HUD', area: 'ui', state: 'integrando', spec: 'x', acceptance: ['a']});
  const run = finishRun(db, startRun(db, {taskId: task.id, role: 'implementacion', provider: 'claude'}).id, 'done', 'Hecho');
  assert.equal((await requestJson(server, 'POST', `/tasks/${task.id}/integrate`, {})).status, 409);
  db.prepare('update tasks set review_approved=1 where id=?').run(task.id);
  const first = await (await requestJson(server, 'POST', `/tasks/${task.id}/integrate`, {})).json();
  const again = await (await requestJson(server, 'POST', `/tasks/${task.id}/integrate`, {})).json();
  assert.equal(first.commandId, again.commandId);
  const [command] = filtered<Command>(db, 'commands', {type: 'integrate.run'});
  assert.deepEqual(JSON.parse(command.payload as unknown as string), {taskId: task.id, runId: run.id});
  const bad = await requestJson(server, 'POST', '/commands', {type: 'checks.run', payload: {taskId: task.id, dir: 'C:/x'}, idempotencyKey: 'k1'});
  assert.equal(bad.status, 400, 'el directorio de recomprobación solo lo pone el integrador');
});
