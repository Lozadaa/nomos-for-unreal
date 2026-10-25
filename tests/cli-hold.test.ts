import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cli, cliFixture, api } from './cli-helpers.ts';

// hito 21: el director retiene una tarea a propósito y lo ven `nomos status` y el panel
test('task hold muestra «En espera: <motivo>» en status y en las tareas; valida motivo y plazo', async t => {
  const {dataDir, port} = await cliFixture(t); cli(dataDir, 'start', '--port', String(port), '--no-open');
  const task = await api(dataDir, '/tasks', {title: 'J2.0a', area: 'gameplay', spec: '', acceptance: []});
  assert.notEqual(cli(dataDir, 'task', 'hold', task.id).status, 0, 'sin --motivo');
  assert.notEqual(cli(dataDir, 'task', 'hold', task.id, '--motivo', 'x', '--hasta', 'no válido').status, 0);
  const held = cli(dataDir, 'task', 'hold', task.id, '--motivo', 'Un Unreal pesado a la vez', '--hasta', 'integration.completed');
  assert.equal(held.status, 0, held.stderr);
  assert.equal(JSON.parse(held.stdout).waitReason, 'En espera: Un Unreal pesado a la vez');
  const status = JSON.parse(cli(dataDir, 'status').stdout);
  assert.deepEqual(status.holds, [{taskId: task.id, title: 'J2.0a', text: 'En espera: Un Unreal pesado a la vez', untilEvent: 'integration.completed'}]);
  const listed = (await api(dataDir, '/tasks')).find((x: any) => x.id === task.id);
  assert.equal(listed.waitReason, 'En espera: Un Unreal pesado a la vez');
  const minutes = cli(dataDir, 'task', 'hold', task.id, '--motivo', 'Diez minutos', '--hasta', '10');
  assert.ok(JSON.parse(minutes.stdout).hold.until, minutes.stderr);
});
