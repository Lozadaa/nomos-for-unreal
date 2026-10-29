import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { cli, cliFixture, api, until } from './cli-helpers.ts';

/** Servicio con carpetas vacías: la prueba no toca los proyectos, el Launcher ni el log reales de este equipo. */
async function service(t: TestContext) {
  const {dataDir, port} = await cliFixture(t);
  writeFileSync(join(dataDir, 'config.json'), JSON.stringify({projectsDir: join(dataDir, 'P'), vaultDir: join(dataDir, 'V'),
    megascansDir: join(dataDir, 'M'), fabCacheDirs: [], listingsDb: join(dataDir, 'none.db'), unrealPath: join(dataDir, 'UE', 'UnrealEditor-Cmd.exe'),
    launcherLogPath: join(dataDir, 'launcher.log')}));
  // hito 30: start exige un editor de Unreal; el de la prueba es un archivo vacío
  mkdirSync(join(dataDir, 'UE')); writeFileSync(join(dataDir, 'UE', 'UnrealEditor-Cmd.exe'), '');
  const started = cli(dataDir, 'start', '--port', String(port), '--no-open');
  assert.equal(started.status, 0, started.stderr);
  return dataDir;
}

test('CLI asset: index y search por la bandeja; generate solo hard surface; entradas desconocidas fallan', async t => {
  const dataDir = await service(t);
  const index = cli(dataDir, 'asset', 'index');
  assert.equal(index.status, 0, index.stderr);
  const command = async () => (await api(dataDir, '/commands')).find((c: any) => c.id === JSON.parse(index.stdout).commandId);
  assert.equal((await command()).type, 'asset.index');
  // hito 20: el índice corre en el servicio; lo que sigue no compite con él (antes fallaba a veces con el equipo cargado)
  await until(async () => ['done', 'failed'].includes((await command()).state), 60_000);
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
  const dataDir = await service(t);
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
  const dataDir = await service(t);
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

test('CLI asset metahuman: encola character.metahuman en el carril largo; un nombre con rutas falla', async t => {
  const dataDir = await service(t);
  const task = await api(dataDir, '/tasks', {title: 'MetaHuman', spec: '', area: 'animacion', acceptance: []});
  const out = cli(dataDir, 'asset', 'metahuman', 'Nomos_Heroe', '--task', task.id);
  assert.equal(out.status, 0, out.stderr);
  const command = (await api(dataDir, '/commands')).find((c: any) => c.id === JSON.parse(out.stdout).commandId);
  assert.deepEqual([command.type, command.lane, command.payload], ['character.metahuman', 'long', {taskId: task.id, name: 'Nomos_Heroe'}]);
  assert.match(cli(dataDir, 'asset', 'metahuman', '../fuera', '--task', task.id).stderr, /invalid_command_payload/);
});

test('CLI asset cascadeur: encola animation.cascadeur con la acción y el motivo; sin motivo válido, el servicio lo rechaza', async t => {
  const dataDir = await service(t);
  const task = await api(dataDir, '/tasks', {title: 'Ataque', spec: '', area: 'animacion', acceptance: []});
  const out = cli(dataDir, 'asset', 'cascadeur', '/Game/Anims/MM_Attack_01', '--task', task.id, '--action', 'cleanup', '--why', 'retarget_rejected',
    '--mesh', '/Game/Heroe/SKM_Heroe');
  assert.equal(out.status, 0, out.stderr);
  const command = (await api(dataDir, '/commands')).find((c: any) => c.id === JSON.parse(out.stdout).commandId);
  assert.deepEqual([command.type, command.lane, command.payload], ['animation.cascadeur', 'long',
    {taskId: task.id, action: 'cleanup', sourceClip: '/Game/Anims/MM_Attack_01', why: 'retarget_rejected', mesh: '/Game/Heroe/SKM_Heroe'}]);
  assert.match(cli(dataDir, 'asset', 'cascadeur', '/Game/Anims/MM_Attack_01', '--task', task.id, '--action', 'cleanup', '--why', 'retarget_rejected').stderr,
    /--mesh/, 'sin personaje no hay comprobación del clip que vuelve');
  assert.match(cli(dataDir, 'asset', 'cascadeur', '/Game/Anims/MM_Attack_01', '--task', task.id, '--action', 'cleanup', '--why', 'porque_si', '--mesh', '/Game/Heroe/SKM_Heroe').stderr,
    /cascadeur_not_justified/);
});
