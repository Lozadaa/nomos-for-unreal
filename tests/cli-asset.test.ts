import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cli, cliFixture, api } from './cli-helpers.ts';

test('CLI asset: index y search por la bandeja; generate solo hard surface; entradas desconocidas fallan', async t => {
  const {dataDir, port} = await cliFixture(t);
  // carpetas vacías: la prueba no toca los proyectos ni el Launcher reales de este equipo
  writeFileSync(join(dataDir, 'config.json'), JSON.stringify({projectsDir: join(dataDir, 'P'), vaultDir: join(dataDir, 'V'),
    megascansDir: join(dataDir, 'M'), fabCacheDirs: [], listingsDb: join(dataDir, 'none.db'), unrealPath: join(dataDir, 'UE', 'UnrealEditor-Cmd.exe')}));
  cli(dataDir, 'start', '--port', String(port), '--no-open');
  const index = cli(dataDir, 'asset', 'index');
  assert.equal(index.status, 0, index.stderr);
  const command = (await api(dataDir, '/commands')).find((c: any) => c.id === JSON.parse(index.stdout).commandId);
  assert.equal(command.type, 'asset.index');
  const search = cli(dataDir, 'asset', 'search', 'cel shader');
  assert.equal(search.status, 0, search.stderr);
  assert.deepEqual(JSON.parse(search.stdout), []);
  assert.match(cli(dataDir, 'asset', 'migrate', 'nadie').stderr, /unknown_catalog_entry/);
  const params = join(dataDir, 'params.json');
  writeFileSync(params, JSON.stringify({prompt: 'personaje con esqueleto'}));
  const rig = cli(dataDir, 'asset', 'generate', 'tarea', '--kind', 'rig', '--params-file', params, '--credits', '5');
  assert.notEqual(rig.status, 0);
  assert.match(rig.stderr, /meshy_kind_not_allowed/);
  assert.equal(cli(dataDir, 'asset', 'migrate').status, 1);
});

test('CLI asset candidates: encola asset.candidates con la tarea, la petición y los clips; tarea desconocida falla', async t => {
  const {dataDir, port} = await cliFixture(t);
  writeFileSync(join(dataDir, 'config.json'), JSON.stringify({projectsDir: join(dataDir, 'P'), vaultDir: join(dataDir, 'V'),
    megascansDir: join(dataDir, 'M'), fabCacheDirs: [], listingsDb: join(dataDir, 'none.db'), unrealPath: join(dataDir, 'UE', 'UnrealEditor-Cmd.exe')}));
  cli(dataDir, 'start', '--port', String(port), '--no-open');
  const task = await api(dataDir, '/tasks', {title: 'Héroe', spec: '', area: 'animacion', acceptance: []});
  const out = cli(dataDir, 'asset', 'candidates', '--task', task.id, 'héroe con ataque', '--animation', 'AM_ComboAttack');
  assert.equal(out.status, 0, out.stderr);
  const command = (await api(dataDir, '/commands')).find((c: any) => c.id === JSON.parse(out.stdout).commandId);
  assert.equal(command.type, 'asset.candidates');
  assert.deepEqual(command.payload, {taskId: task.id, query: 'héroe con ataque', animations: ['AM_ComboAttack']});
  assert.match(cli(dataDir, 'asset', 'candidates', '--task', 'nadie', 'héroe').stderr, /unknown_task/);
  assert.equal(cli(dataDir, 'asset', 'candidates', 'héroe').status, 1, 'sin --task es un error de uso');
});

test('CLI asset character: encola character.setup con malla, clips y objetivo MetaHuman; rutas fuera de /Game fallan', async t => {
  const {dataDir, port} = await cliFixture(t);
  writeFileSync(join(dataDir, 'config.json'), JSON.stringify({projectsDir: join(dataDir, 'P'), vaultDir: join(dataDir, 'V'),
    megascansDir: join(dataDir, 'M'), fabCacheDirs: [], listingsDb: join(dataDir, 'none.db'), unrealPath: join(dataDir, 'UE', 'UnrealEditor-Cmd.exe')}));
  cli(dataDir, 'start', '--port', String(port), '--no-open');
  const task = await api(dataDir, '/tasks', {title: 'Héroe', spec: '', area: 'animacion', acceptance: []});
  const out = cli(dataDir, 'asset', 'character', '/Game/MetaHumans/Hudson/BP_Hudson', '--task', task.id,
    '--animation', '/Game/Variant_Combat/Anims/AM_ComboAttack', '--metahuman');
  assert.equal(out.status, 0, out.stderr);
  const command = (await api(dataDir, '/commands')).find((c: any) => c.id === JSON.parse(out.stdout).commandId);
  assert.equal(command.type, 'character.setup');
  assert.equal(command.lane, 'long');
  assert.deepEqual(command.payload, {taskId: task.id, mesh: '/Game/MetaHumans/Hudson/BP_Hudson',
    animations: ['/Game/Variant_Combat/Anims/AM_ComboAttack'], targetSkeleton: 'metahuman'});
  assert.match(cli(dataDir, 'asset', 'character', 'C:/fuera', '--task', task.id, '--animation', '/Game/A').stderr, /invalid_command_payload/);
});
