import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliPath, freePort, stopService } from './cli-helpers.ts';
import { readServiceInfo } from '../service/src/service-info.ts';
import { removeDir } from './remove-dir.ts';

// Hito 22: tras un reinicio, los servicios registrados vuelven solos al iniciar sesión.
const node = (env: object, ...args: string[]) => spawnSync(process.execPath, [cliPath, ...args],
  {encoding: 'utf8', windowsHide: true, timeout: 90_000, env: {...process.env, ...env}});

test('autostart run levanta los servicios registrados con su --data y su puerto; los vivos no se tocan', async t => {
  const root = mkdtempSync(join(tmpdir(), 'nomos-arranque-')), game = join(root, 'Juego'), dataDir = join(game, '.nomos-x');
  mkdirSync(dataDir, {recursive: true}); writeFileSync(join(game, 'Juego.uproject'), '{}');
  const registry = join(root, 'projects.json'), port = await freePort();
  writeFileSync(registry, JSON.stringify([{name: 'Juego', dir: game, dataDir, port, pid: 999999, startedAt: ''},
    {name: 'Borrado', dir: join(root, 'no'), dataDir: join(root, 'no', '.nomos'), port: port + 1, pid: 999998, startedAt: ''}]));
  t.after(() => { stopService(dataDir); removeDir(root); });
  const run = node({NOMOS_REGISTRY: registry}, 'autostart', 'run');
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout.trim().split('\n').at(-1)!), [{name: 'Juego', port, started: true}]);
  assert.equal(readServiceInfo(dataDir)?.port, port);
  const again = node({NOMOS_REGISTRY: registry}, 'autostart', 'run');
  assert.deepEqual(JSON.parse(again.stdout.trim().split('\n').at(-1)!), [{name: 'Juego', port, started: false}]);
  const status = JSON.parse(node({NOMOS_REGISTRY: registry}, 'autostart', 'status').stdout);
  assert.equal(status.task, 'Nomos - arranque');
  assert.deepEqual(status.services.map((s: any) => s.port), [port]);
  assert.notEqual(node({}, 'autostart', 'luego').status, 0);
});

test('instalar-arranque.ps1 -WhatIf enseña la tarea sin registrarla', {skip: process.platform !== 'win32'}, () => {
  const script = join(import.meta.dirname, '..', 'scripts', 'instalar-arranque.ps1');
  const run = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-WhatIf', '-Nombre', 'Nomos - prueba en seco'],
    {encoding: 'utf8', windowsHide: true, timeout: 60_000});
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Nomos - prueba en seco/);
  assert.match(run.stdout, /autostart run/);
  assert.match(run.stdout, /What if|Qué pasaría si/i);
  assert.notEqual(spawnSync('schtasks', ['/Query', '/TN', 'Nomos - prueba en seco'], {windowsHide: true}).status, 0, 'no quedó registrada');
});
