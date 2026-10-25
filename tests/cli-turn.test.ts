import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cli, cliFixture, api } from './cli-helpers.ts';

// hito 22: el worker pide Unreal desde su terminal (`nomos worker turn TAREA --wait|--release`)
test('worker turn valida sus opciones, exige un worker vivo y --release sin turno no suelta nada', async t => {
  const {dataDir, port} = await cliFixture(t); cli(dataDir, 'start', '--port', String(port), '--no-open');
  const task = await api(dataDir, '/tasks', {title: 'J2.2 Callejón', area: 'escenarios', spec: '', acceptance: []});
  assert.notEqual(cli(dataDir, 'worker', 'turn', task.id).status, 0, 'sin --wait ni --release');
  assert.notEqual(cli(dataDir, 'worker', 'turn', task.id, '--wait', '--release').status, 0);
  const waiting = cli(dataDir, 'worker', 'turn', task.id, '--wait');
  assert.notEqual(waiting.status, 0, 'sin worker en marcha no hay turno que pedir');
  const released = cli(dataDir, 'worker', 'turn', task.id, '--release');
  assert.equal(released.status, 0, released.stderr);
  assert.deepEqual(JSON.parse(released.stdout), {released: false});
  const status = JSON.parse(cli(dataDir, 'status').stdout);
  assert.deepEqual(status.unreal, []);
});
