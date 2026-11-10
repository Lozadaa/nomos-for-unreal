import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { embed, embeddedSkills } from '../../service/src/embed.ts';
import { freePort } from '../cli-helpers.ts';
import { removeDir } from '../remove-dir.ts';

const nomos = resolve(import.meta.dirname, '..', '..');
const git = (cwd: string, ...args: string[]) => spawnSync('git', args, {cwd, encoding: 'utf8', windowsHide: true}).stdout.trim();
/** Nomos de mentira (servicio real, panel de una línea) con su propio Git, y un juego con Git y CLAUDE.md propio. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'nomos-embed-')), source = join(root, 'nomos'), game = join(root, 'Juego');
  for (const part of ['service', 'skills', 'scripts/instalar-arranque.ps1', 'package.json', 'LICENSE']) cpSync(join(nomos, part), join(source, part), {recursive: true});
  mkdirSync(join(source, 'panel', 'dist'), {recursive: true});
  writeFileSync(join(source, 'panel', 'dist', 'index.html'), '<title>panel embebido</title>');
  for (const dir of [source, game]) {
    mkdirSync(dir, {recursive: true}); git(dir, 'init', '-q');
    git(dir, 'config', 'user.email', 't@t'); git(dir, 'config', 'user.name', 't');
  }
  git(source, 'add', '-A'); git(source, 'commit', '-qm', 'nomos');
  writeFileSync(join(game, 'CLAUDE.md'), '# Juego\n\nReglas propias.\n\n## Nomos\nviejo\n\n## Otra\nse queda\n');
  writeFileSync(join(game, 'Juego.uproject'), '{}');
  return {root, source, game, close: () => removeDir(root)};
}
const run = (game: string, ...args: string[]) => process.platform === 'win32'
  ? spawnSync('cmd', ['/c', join(game, 'nomos.cmd'), ...args], {cwd: game, encoding: 'utf8', windowsHide: true, timeout: 60_000})
  : spawnSync('sh', ['nomos.sh', ...args], {cwd: game, encoding: 'utf8', timeout: 60_000});

test('hito 30: embed deja Nomos en el juego, el envoltorio arranca el servicio y --update conserva CLAUDE.md', async () => {
  const f = fixture();
  try {
    embed(f.game, {source: f.source, skills: join(f.source, 'skills')});
    for (const path of ['Tools/Nomos/service/src/cli.ts', 'Tools/Nomos/panel/dist/index.html', 'Tools/Nomos/package.json',
      'Tools/Nomos/LICENSE', 'nomos.cmd', 'nomos.sh', ...embeddedSkills.map(n => `.claude/skills/${n}/SKILL.md`)])
      assert.ok(existsSync(join(f.game, path)), path);
    assert.equal(readFileSync(join(f.game, 'Tools/Nomos/VERSION'), 'utf8').split(' ')[0], git(f.source, 'rev-parse', '--short', 'HEAD'));
    const claude = readFileSync(join(f.game, 'CLAUDE.md'), 'utf8');
    assert.match(claude, /^# Juego\n\nReglas propias\.\n\n## Nomos\n/); assert.match(claude, /\/nomos/); assert.doesNotMatch(claude, /viejo/);
    assert.match(claude, /## Otra\nse queda\n$/);
    assert.match(readFileSync(join(f.game, '.gitignore'), 'utf8'), /^\.nomos\/$/m);
    assert.throws(() => embed(f.game, {source: f.source}), /--update/);
    const inGame = (file: string) => import(pathToFileURL(join(f.game, 'Tools/Nomos/service/src', file)).href);
    assert.equal((await inGame('skills-install.ts')).nomosSkills, join(f.game, '.claude', 'skills'), 'las skills embebidas salen de .claude/skills');
    await (await inGame('project-root.ts')).requireGameProject(f.game);
    assert.ok(existsSync(join(f.game, '.claude/skills/ue-oficio/scripts/revisar_acabado.py')), 'ue-oficio viaja con el juego');
    assert.ok(existsSync((await inGame('checks/acabado.ts')).acabadoScript()), 'el acabado embebido encuentra su script');

    const port = String(await freePort());
    const started = run(f.game, 'start', '--no-open', '--port', port, '--data', '.nomos');
    try {
      assert.equal(started.status, 0, started.stderr); assert.match(started.stdout, /ARRANCADO/);
      const status = run(f.game, 'status', '--data', '.nomos');
      assert.equal(status.status, 0, status.stderr); assert.ok(JSON.parse(status.stdout));
      const viaSkill = spawnSync(process.execPath, ['.claude/skills/nomos/scripts/nomos.ts', 'status', '--data', '.nomos'], {cwd: f.game, encoding: 'utf8', windowsHide: true});
      assert.equal(viaSkill.status, 0, viaSkill.stderr); assert.ok(JSON.parse(viaSkill.stdout), 'nomos de la skill embebida llega a Tools/Nomos');
      const url = started.stdout.match(/URL (\S+)/)![1];
      assert.match(await (await fetch(new URL('/', url), {headers: {accept: 'text/html'}})).text(), /panel embebido/, 'el panel sale de Tools/Nomos/panel/dist');
    } finally { const stop = run(f.game, "stop", "--data", ".nomos"); if (started.status === 0) assert.match(stop.stdout, /DETENIDO/); }

    writeFileSync(join(f.game, 'CLAUDE.md'), readFileSync(join(f.game, 'CLAUDE.md'), 'utf8') + '\n## Mía\nañadida\n');
    writeFileSync(join(f.game, 'Tools/Nomos/basura.txt'), 'x');
    embed(f.game, {update: true, source: f.source, skills: join(f.source, 'skills')});
    const after = readFileSync(join(f.game, 'CLAUDE.md'), 'utf8');
    assert.equal(after.match(/^## Nomos$/gm)!.length, 1);
    assert.match(after, /Reglas propias/); assert.match(after, /## Otra\nse queda/); assert.match(after, /## Mía\nañadida/);
    assert.ok(!existsSync(join(f.game, 'Tools/Nomos/basura.txt')), '--update reemplaza Tools/Nomos');
    assert.equal(readFileSync(join(f.game, '.gitignore'), 'utf8').match(/\.nomos\//g)!.length, 1);
  } finally { f.close(); }
});
