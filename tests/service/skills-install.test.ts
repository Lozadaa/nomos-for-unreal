import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gameSkills, installSkills } from '../../service/src/skills-install.ts';
import { installedSkills } from '../../service/src/skills.ts';
import { removeDir } from '../remove-dir.ts';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'nomos-skills-')), source = join(root, 'skills'), game = join(root, 'Juego');
  for (const name of ['game-ui-art-director', 'ue-umg-ui', 'ue-visual-qa', 'nomos']) {
    mkdirSync(join(source, name, 'references'), {recursive: true});
    writeFileSync(join(source, name, 'SKILL.md'), `---\nname: ${name}\n---\nv1\n`);
    writeFileSync(join(source, name, 'references', 'a.md'), 'ref\n');
  }
  mkdirSync(game);
  return {root, source, game, close: () => removeDir(root)};
}

test('instala las tres skills de UI en <juego>/.claude/skills y es idempotente', () => {
  const f = fixture();
  try {
    const first = installSkills(f.game, f.source);
    assert.deepEqual(first.map(r => [r.name, r.action]), gameSkills.map(name => [name, 'installed']));
    assert.equal(readFileSync(join(f.game, '.claude', 'skills', 'ue-umg-ui', 'references', 'a.md'), 'utf8'), 'ref\n');
    assert.ok(!existsSync(join(f.game, '.claude', 'skills', 'nomos')), 'la skill del director no se copia al juego');
    assert.deepEqual(installSkills(f.game, f.source).map(r => r.action), ['unchanged', 'unchanged', 'unchanged']);
    assert.deepEqual(installedSkills(f.game).map(s => s.name), gameSkills);
  } finally { f.close(); }
});

test('actualiza una copia sin tocar y nunca sobrescribe un SKILL.md modificado en el juego', () => {
  const f = fixture();
  try {
    installSkills(f.game, f.source);
    writeFileSync(join(f.source, 'ue-umg-ui', 'SKILL.md'), '---\nname: ue-umg-ui\n---\nv2\n');
    writeFileSync(join(f.source, 'ue-visual-qa', 'SKILL.md'), '---\nname: ue-visual-qa\n---\nv2\n');
    const local = join(f.game, '.claude', 'skills', 'ue-visual-qa', 'SKILL.md');
    writeFileSync(local, '---\nname: ue-visual-qa\n---\nmío\n');
    const result = installSkills(f.game, f.source);
    assert.deepEqual(result.map(r => r.action), ['unchanged', 'updated', 'kept-local']);
    assert.match(readFileSync(join(f.game, '.claude', 'skills', 'ue-umg-ui', 'SKILL.md'), 'utf8'), /v2/);
    assert.match(readFileSync(local, 'utf8'), /mío/);
    assert.match(readFileSync(join(f.game, '.claude', 'skills', 'ue-visual-qa', '.nomos-skill.new', 'SKILL.md'), 'utf8'), /v2/);
    assert.match(result[2].message!, /cambios locales/);
    assert.deepEqual(installSkills(f.game, f.source).map(r => r.action), ['unchanged', 'unchanged', 'kept-local']);
  } finally { f.close(); }
});

test('nomos skills install --data .nomos instala en el juego padre de la carpeta de datos', async () => {
  const {spawnSync} = await import('node:child_process');
  const root = mkdtempSync(join(tmpdir(), 'nomos-skills-cli-'));
  try {
    const nomos = join(import.meta.dirname, '..', '..', 'skills', 'nomos', 'scripts', 'nomos.ts');
    const run = spawnSync(process.execPath, [nomos, 'skills', 'install', '--data', join(root, '.nomos')], {encoding: 'utf8'});
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(run.stdout).map((r: {name: string; action: string}) => [r.name, r.action]), gameSkills.map(n => [n, 'installed']));
    assert.ok(existsSync(join(root, '.claude', 'skills', 'ue-visual-qa', 'SKILL.md')));
    assert.equal(spawnSync(process.execPath, [nomos, 'skills', 'borrar'], {encoding: 'utf8'}).status, 1);
  } finally { removeDir(root); }
});
