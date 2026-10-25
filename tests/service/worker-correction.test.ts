import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fixture } from './worker-fixture.ts';
import { listEvents } from '../../service/src/store.ts';
import { requireTask } from '../../service/src/repo/tasks.ts';

// hito 18, dos casos de Block Kings: un NOMOS_DONE viejo tras la corrección cerraba la run con el worker aún corrigiendo,
// y worker.waiting saltaba una y otra vez mientras el worker escribía código sin preguntar nada
const poll = (f: ReturnType<typeof fixture>) => f.invoke('worker.poll', {runId: f.run().id, generation: f.run().metadata.pollGeneration ?? 0});
const waits = (f: ReturnType<typeof fixture>) => listEvents(f.db, 0).filter(e => e.type === 'worker.waiting');
const claude = (f: ReturnType<typeof fixture>) => f.invoke('worker.start', {taskId: f.task.id, provider: 'claude', role: 'implementacion', skills: ['tdd']});
const idle = (f: ReturnType<typeof fixture>, value: boolean) => writeFileSync(f.file, JSON.stringify({...f.state(), idle: value}));

async function corrected(t: any) {
  const f = fixture(t);
  await f.start(); await poll(f);
  f.output('NOMOS_DONE {"summary":"Terminado","commits":["primero"],"tests":"passed"}'); await poll(f);
  assert.equal(f.run().state, 'done');
  await f.invoke('worker.send', {runId: f.run().id, text: 'Fusiona main y vuelve a empaquetar'});
  assert.equal(f.run().state, 'running');
  const commit = () => {
    const tree = f.tree().path; writeFileSync(join(tree, 'fusion.txt'), 'main\n');
    for (const args of [['add', 'fusion.txt'], ['commit', '-m', 'Fusiona main']]) execFileSync('git', ['-C', tree, ...args], {windowsHide: true});
  };
  return {...f, commit};
}

test('tras la corrección, un NOMOS_DONE sin commit posterior se ignora y la run sigue viva', async t => {
  const f = await corrected(t);
  f.output('NOMOS_DONE {"summary":"Terminado otra vez","commits":["primero"],"tests":"passed"}'); await poll(f);
  assert.equal(f.run().state, 'running');
  assert.equal(requireTask(f.db, f.task.id).state, 'implementando');
  assert.deepEqual(listEvents(f.db, 0).filter(e => e.type === 'worker.done_ignored').map(e => e.payload.reason), ['sin commit tras la corrección']);
  f.commit();
  f.output('NOMOS_DONE {"summary":"Fusionado y empaquetado","commits":["fusion"],"tests":"passed"}'); await poll(f);
  assert.equal(f.run().state, 'done');
  assert.equal(requireTask(f.db, f.task.id).state, 'revisando');
});

test('tras la corrección, NOMOS_DONE sin cambios declarados (commits vacío) sí cuenta', async t => {
  const f = await corrected(t);
  f.output('NOMOS_DONE {"summary":"No hacía falta tocar nada","commits":[],"tests":"passed"}'); await poll(f);
  assert.equal(f.run().state, 'done');
});

test('el NOMOS_DONE que ya estaba en pantalla antes de la corrección no cierra la run', async t => {
  const f = await corrected(t);
  f.output('NOMOS_DONE {"summary":"Terminado","commits":["primero"],"tests":"passed"}'); await poll(f);
  assert.equal(f.run().state, 'running');
});

test('worker escribiendo código: ni «Do you want to» a media salida ni el reposo sin pregunta emiten worker.waiting', async t => {
  const f = fixture(t, {FAKE_ORCA_MODE: 'claude'});
  await claude(f); await poll(f);
  const before = waits(f).length;
  f.output('// Do you want to keep the ragdoll? decided: yes', 'void AFighter::Knockdown()', '{', '  Ragdoll();', '}'); await poll(f);
  assert.equal(waits(f).length, before, 'una frase en el código no es un permiso');
  idle(f, true);
  for (let i = 0; i < 8; i++) await poll(f);
  assert.equal(waits(f).length, before, 'quieto pero su última salida no es una pregunta');
});

test('quieto un rato con una pregunta al final: worker.waiting una vez; la misma espera no se repite', async t => {
  const f = fixture(t, {FAKE_ORCA_MODE: 'claude'});
  await claude(f); await poll(f);
  const before = waits(f).length;
  f.output('He terminado la parte A. ¿Sigo con la parte B?'); idle(f, true);
  await poll(f); await poll(f);
  assert.equal(waits(f).length, before, '10 s quieto aún no es «un rato»');
  for (let i = 0; i < 6; i++) await poll(f);
  assert.equal(waits(f).length, before + 1);
  f.output('He terminado la parte A. ¿Sigo con la parte B?');
  for (let i = 0; i < 8; i++) await poll(f);
  assert.equal(waits(f).length, before + 1, 'la misma pregunta otra vez es la misma espera');
});
