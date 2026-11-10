import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { nuevo } from '../../service/src/nuevo.ts';
import { removeDir } from '../remove-dir.ts';

const nomos = resolve(import.meta.dirname, '..', '..');
const git = (cwd: string, ...args: string[]) => spawnSync('git', args, {cwd, encoding: 'utf8', windowsHide: true}).stdout.trim();
/** Nomos de mentira con la semilla real (como en embed.test.ts: panel de una línea y Git propio). */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'nomos-nuevo-')), source = join(root, 'nomos');
  for (const part of ['service', 'skills', 'plantillas', 'scripts/instalar-arranque.ps1', 'package.json', 'LICENSE'])
    cpSync(join(nomos, part), join(source, part), {recursive: true});
  mkdirSync(join(source, 'panel', 'dist'), {recursive: true});
  writeFileSync(join(source, 'panel', 'dist', 'index.html'), '<title>panel</title>');
  git(source, 'init', '-q'); git(source, 'config', 'user.email', 't@t'); git(source, 'config', 'user.name', 't');
  git(source, 'add', '-A'); git(source, 'commit', '-qm', 'nomos');
  return {root, source, close: () => removeDir(root)};
}
const binary = /\.(uasset|umap|ttf|otf|png|jpg|wav)$/i;
function files(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name), rel = path.slice(base.length + 1).replace(/\\/g, '/');
    if (/^(\.git|Tools|\.claude)(\/|$)/.test(rel)) return [];
    return statSync(path).isDirectory() ? files(path, base) : [rel];
  });
}

test('jam: nomos nuevo crea el juego desde la semilla, con su nombre, su motor, Git y Nomos dentro', () => {
  const f = fixture();
  try {
    const dest = join(f.root, 'Prueba');
    const created = nuevo('Prueba', {dest, source: f.source});
    assert.ok(created.length > 0);
    for (const path of ['Prueba.uproject', 'Source/Prueba/PruebaGameMode.h', 'Source/Prueba.Target.cs', 'Tools/Nomos/VERSION', 'docs/aprendido.md'])
      assert.ok(existsSync(join(dest, path)), path);
    for (const rel of files(dest).filter(r => !binary.test(r)))
      assert.doesNotMatch(readFileSync(join(dest, rel), 'utf8'), /semilla/i, `${rel} aún dice Semilla`);
    const uproject = JSON.parse(readFileSync(join(dest, 'Prueba.uproject'), 'utf8'));
    assert.equal(uproject.EngineAssociation, '5.9');
    assert.equal(uproject.Modules[0].Name, 'Prueba');
    assert.match(readFileSync(join(dest, 'Source/Prueba/PruebaPlayerController.cpp'), 'utf8'), /PRUEBA_AUTO/);
    assert.equal(git(dest, 'rev-list', '--count', 'HEAD'), '1');
    assert.equal(git(dest, 'log', '-1', '--format=%s'), 'Proyecto Prueba desde la semilla de Nomos');
    assert.equal(git(dest, 'status', '--short'), '', 'todo commiteado');
  } finally { f.close(); }
});

test('jam: nombre con espacios o tildes, o destino que ya existe → error sin escribir nada', () => {
  const f = fixture();
  try {
    for (const name of ['mi juego', 'Ñu', 'ab', 'Juego Uno', 'Canción'])
      assert.throws(() => nuevo(name, {dest: join(f.root, 'x'), source: f.source}), /nombre/i, name);
    assert.ok(!existsSync(join(f.root, 'x')));
    const taken = join(f.root, 'Ocupado');
    mkdirSync(taken); writeFileSync(join(taken, 'nota.txt'), 'mío');
    assert.throws(() => nuevo('Ocupado', {dest: taken, source: f.source}), /existe/);
    assert.deepEqual(readdirSync(taken), ['nota.txt']);
  } finally { f.close(); }
});

test('revisión final: si algo falla a mitad (aquí, sin panel/dist), nomos nuevo no deja la carpeta a medias', () => {
  const f = fixture();
  try {
    rmSync(join(f.source, 'panel', 'dist'), {recursive: true});
    const dest = join(f.root, 'Roto');
    assert.throws(() => nuevo('Roto', {dest, source: f.source}), /panel\/dist/);
    assert.ok(!existsSync(dest), 'se puede reintentar con el mismo nombre');
  } finally { f.close(); }
});
