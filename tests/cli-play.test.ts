import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { cli, cliFixture } from './cli-helpers.ts';

test('CLI play --status|play|play --stop usan /play y dicen por qué no hay build', async t => {
  const {dataDir, port} = await cliFixture(t); assert.equal(cli(dataDir, 'start', '--port', String(port), '--no-open').status, 0);
  writeFileSync(join(dataDir, 'Juego.uproject'), '{}');
  assert.equal(JSON.parse(cli(dataDir, 'play', '--status').stdout).reason, 'Todavía no hay ninguna build');
  const none = cli(dataDir, 'play');
  assert.notEqual(none.status, 0);
  assert.match(none.stderr, /Todavía no hay ninguna build/);
  const dir = join(dataDir, 'Build', 'Windows-actual'); mkdirSync(dir, {recursive: true});
  copyFileSync(process.execPath, join(dir, 'Juego.exe'));
  writeFileSync(join(dir, 'espera.mjs'), 'setTimeout(() => {}, 60_000);');
  writeFileSync(join(dataDir, 'config.json'), JSON.stringify({play: {args: ['espera.mjs']}}));
  const started = cli(dataDir, 'play'); assert.equal(started.status, 0, started.stderr);
  const pid = JSON.parse(started.stdout).running.pid;
  assert.equal(JSON.parse(cli(dataDir, 'play', '--status').stdout).running.pid, pid);
  const twice = cli(dataDir, 'play'); assert.notEqual(twice.status, 0); assert.ok(twice.stderr.includes(`Ya hay una partida abierta (pid ${pid})`), twice.stderr);
  assert.equal(JSON.parse(cli(dataDir, 'play', '--stop').stdout).running, null);
  assert.notEqual(cli(dataDir, 'play', '--stop', '--status').status, 0, 'una sola opción');
});
