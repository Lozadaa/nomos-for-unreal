import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { cli, cliFixture, api } from './cli-helpers.ts';
import { requestBaseline } from '../service/src/approvals.ts';
import { readServiceInfo } from '../service/src/service-info.ts';

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

// hito 28: una línea base propuesta sale con el tipo baseline, sirve sus imágenes y se rechaza desde la terminal
test('nomos approval list distingue baseline; reject borra la propuesta', async t => {
  const {dataDir, port} = await cliFixture(t); cli(dataDir, 'start', '--port', String(port), '--no-open');
  const task = await api(dataDir, '/tasks', {title: 'Arena', spec: '', area: 'gameplay', acceptance: []});
  const proposal = join(dataDir, 'propuesta.png'); writeFileSync(proposal, 'png');
  const db = new DatabaseSync(join(dataDir, 'nomos.db'));
  try { requestBaseline(db, task.id, {name: 'map-L_Arena-1280x720', proposal, baseline: join(dataDir, 'base.png'), current: null, diff: null}); } finally { db.close(); }
  const [item] = JSON.parse(cli(dataDir, 'approval', 'list').stdout).items;
  assert.deepEqual([item.type, item.title], ['baseline', 'Línea base: map L_Arena 1280x720']);
  const info = readServiceInfo(dataDir)!, get = (what: string) => fetch(`http://127.0.0.1:${info.port}/approvals/${item.id}/baseline/${what}`,
    {headers: {Authorization: `Bearer ${info.token}`, Connection: 'close'}});
  assert.equal(await (await get('propuesta')).text(), 'png');
  assert.equal((await get('actual')).status, 404);
  const rejected = cli(dataDir, 'approval', 'reject', item.id);
  assert.equal(rejected.status, 0, rejected.stderr);
  assert.equal(JSON.parse(rejected.stdout).state, 'changes');
  assert.equal(existsSync(proposal), false);
});
