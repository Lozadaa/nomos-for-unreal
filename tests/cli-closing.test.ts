import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { cli, cliFixture, api } from './cli-helpers.ts';
import { openDb } from '../service/src/db.ts';
import { startRun, finishRun } from '../service/src/repo/runs.ts';

test('CLI task integrate|finalize|continue y pausar|reanudar llaman a sus rutas', async t => {
  const {dataDir, port} = await cliFixture(t); assert.equal(cli(dataDir, 'start', '--port', String(port), '--no-open').status, 0);
  const task = await api(dataDir, '/tasks', {title: 'HUD', area: 'ui', spec: 'Barra', acceptance: ['Se ve']});
  const db = openDb(join(dataDir, 'kratos.db'));
  finishRun(db, startRun(db, {taskId: task.id, role: 'implementacion', provider: 'claude'}).id, 'done', 'Hecho');
  db.prepare("update tasks set state='integrando',review_approved=1 where id=?").run(task.id); db.close();
  const integrate = cli(dataDir, 'task', 'integrate', task.id); assert.equal(integrate.status, 0, integrate.stderr);
  const commands = await api(dataDir, '/commands');
  assert.equal(commands.find((c: any) => c.id === JSON.parse(integrate.stdout).commandId).type, 'integrate.run');
  assert.notEqual(cli(dataDir, 'task', 'finalize', task.id).status, 0, 'solo desde cerrando');
  assert.notEqual(cli(dataDir, 'task', 'continue', task.id, '--text', 'Más grande').status, 0, 'solo sobre done');
  const db2 = openDb(join(dataDir, 'kratos.db')); db2.prepare("update tasks set state='done' where id=?").run(task.id); db2.close();
  const cont = cli(dataDir, 'task', 'continue', task.id, '--text', 'Más grande'); assert.equal(cont.status, 0, cont.stderr);
  assert.equal((await api(dataDir, '/tasks/' + JSON.parse(cont.stdout).taskId)).task.parentTaskId, task.id);
  assert.equal(JSON.parse(cli(dataDir, 'pausar').stdout).paused, true);
  assert.equal(JSON.parse(cli(dataDir, 'reanudar').stdout).paused, false);
});
