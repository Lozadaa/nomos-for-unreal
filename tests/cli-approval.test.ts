import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cli, cliFixture, api } from './cli-helpers.ts';

// hito 22: el director y la skill manejan «Por aprobar» desde la terminal
test('nomos approval list, comment y errores de uso; status cuenta las pendientes', async t => {
  const {dataDir, port} = await cliFixture(t); cli(dataDir, 'start', '--port', String(port), '--no-open');
  const list = cli(dataDir, 'approval', 'list');
  assert.equal(list.status, 0, list.stderr);
  assert.deepEqual(JSON.parse(list.stdout), {pending: 0, items: [], general: []});
  assert.notEqual(cli(dataDir, 'approval', 'changes', 'x').status, 0, 'cambios sin texto');
  assert.notEqual(cli(dataDir, 'approval', 'approve').status, 0, 'aprobar sin id');
  const general = cli(dataDir, 'approval', 'comment', '--text', 'Buen ritmo en general');
  assert.equal(general.status, 0, general.stderr);
  assert.ok(JSON.parse(general.stdout).messageId);
  assert.equal(JSON.parse(cli(dataDir, 'status').stdout).approvals, 0);
  const listed = await api(dataDir, '/approvals');
  assert.deepEqual(listed.general.map((c: any) => c.text), ['Buen ritmo en general']);
});
