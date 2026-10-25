import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error: script .mjs sin tipos
import { renameRepo, renameText } from '../scripts/renombrar-nomos.mjs';
import { removeDir } from './remove-dir.ts';

test('renameText: identificadores, rutas y textos; GitHub al repo nuevo', () => {
  assert.equal(renameText('KRATOS_DONE en .kratos/kratos.db; «Esperando a Kratos»; KratosEvent'),
    'NOMOS_DONE en .nomos/nomos.db; «Esperando a Nomos»; NomosEvent');
  assert.equal(renameText('node skills/kratos/scripts/kratos.ts start --data .kratos'), 'node skills/nomos/scripts/nomos.ts start --data .nomos');
  assert.equal(renameText('https://github.com/Lozadaa/kratos/pull/3'), 'https://github.com/Lozadaa/nomos-for-unreal/pull/3');
});

test('renameText deja los nombres reales: carpetas del usuario, ramas, contenido de los juegos y la nota histórica', () => {
  for (const real of ['C:/Users/richa/Documents/Unreal Projects/KratosFabTest', 'nivel2-04-kratosfabtest.jpg', 'KratosJuegoH4',
    'C:/Users/richa/orca/workspaces/kratos/hito2-worker', 'C:\\Users\\richa\\orca\\workspaces\\kratos', '/Game/Kratos/Maps/AnimTest',
    'Juego/Content/Kratos/Marcador.uasset', 'tagged(world, "KratosCamera2")', 'Docs/README-kratos.md', 'Scripts/kratos-hito3/ammo.mjs',
    'outputs/kratos-fab-nivel1/', 'rama kratos/653957cf', 'node skills/nomos/scripts/kratos.ts status', 'Nomos for Unreal se llamó Kratos hasta el 2026-10-24'])
    assert.equal(renameText(real), real);
  assert.equal(renameText('kratos start en KratosFabTest'), 'nomos start en KratosFabTest');
});

test('renameRepo: reescribe texto, mueve con git mv, no toca binarios ni la lista de compatibilidad, y es idempotente', t => {
  const root = mkdtempSync(join(tmpdir(), 'nomos-renombre-'));
  t.after(() => removeDir(root));
  const git = (...args: string[]) => execFileSync('git', args, {cwd: root, encoding: 'utf8'});
  git('init', '-q');
  mkdirSync(join(root, 'skills/kratos/scripts'), {recursive: true}); mkdirSync(join(root, 'service/src'), {recursive: true});
  writeFileSync(join(root, 'skills/kratos/scripts/kratos.ts'), 'kratos\n');
  writeFileSync(join(root, 'skills/kratos/logo.png'), Buffer.from([0x89, 0, 0x6b, 0x72, 0x61, 0x74, 0x6f, 0x73]));
  writeFileSync(join(root, 'service/src/legacy.ts'), "const old = '.kratos';\n");
  git('add', '.'); git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base');
  assert.deepEqual(renameRepo(root), {edited: 1, moved: 2});
  assert.equal(readFileSync(join(root, 'skills/nomos/scripts/nomos.ts'), 'utf8'), 'nomos\n');
  assert.equal(readFileSync(join(root, 'skills/nomos/logo.png')).includes(Buffer.from('kratos')), true);
  assert.equal(readFileSync(join(root, 'service/src/legacy.ts'), 'utf8'), "const old = '.kratos';\n");
  assert.equal(existsSync(join(root, 'skills/kratos')), false);
  assert.match(git('status', '--short'), /R[ M] skills\/kratos\/scripts\/kratos\.ts -> skills\/nomos\/scripts\/nomos\.ts/);
  assert.deepEqual(renameRepo(root), {edited: 0, moved: 0});
});
