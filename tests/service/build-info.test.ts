import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { openDb } from '../../service/src/db.ts';
import { latestBuild } from '../../service/src/play.ts';
import { buildSummary, readBuildInfo, writeBuildInfo } from '../../service/src/build-info.ts';
import { cliPath } from '../cli-helpers.ts';
import { checksFixture } from './checks-fixture.ts';
import { removeDir } from '../remove-dir.ts';

/** Juego con repo git real: un commit viejo y main un commit por delante. */
function repo() {
  const root = mkdtempSync(join(tmpdir(), 'nomos-origen-')), data = join(root, '.nomos');
  const git = (...args: string[]) => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'n@n'); git('config', 'user.name', 'Nomos');
  writeFileSync(join(root, '.gitignore'), '.nomos/\nBuild/\n');
  writeFileSync(join(root, 'Juego.uproject'), '{}'); git('add', '.'); git('commit', '-qm', 'viejo');
  const old = git('rev-parse', 'HEAD');
  writeFileSync(join(root, 'J1.11.txt'), 'reacciones'); git('add', '.'); git('commit', '-qm', 'J1.11');
  mkdirSync(data); const db = openDb(join(data, 'nomos.db'));
  const dir = join(root, 'Build', 'Windows-actual'); mkdirSync(dir, {recursive: true}); writeFileSync(join(dir, 'Juego.exe'), 'MZ');
  return {root, data, db, dir, old, head: git('rev-parse', 'HEAD'), git, close() { db.close(); removeDir(root); }};
}
const info = (commit: string) => ({commit, branch: 'main', builtAt: '2026-10-25T02:22:00.000Z', task: null, run: null});

test('build de HEAD de main: commit y stale false', () => {
  const r = repo();
  try {
    writeBuildInfo(r.dir, info(r.head));
    const {build} = latestBuild(r.data, r.db);
    assert.deepEqual(build!.origin, info(r.head));
    assert.equal(build!.commit, r.head);
    assert.equal(build!.stale, false);
  } finally { r.close(); }
});

test('build de un commit anterior a main: stale true', () => {
  const r = repo();
  try {
    writeBuildInfo(r.dir, info(r.old));
    const {build} = latestBuild(r.data, r.db);
    assert.equal(build!.commit, r.old);
    assert.equal(build!.stale, true);
  } finally { r.close(); }
});

test('una rama que ya fusionó main no es anterior a main', () => {
  const r = repo();
  try {
    r.git('checkout', '-qb', 'nomos/j1-10'); writeFileSync(join(r.root, 'j110.txt'), 'x'); r.git('add', '.'); r.git('commit', '-qm', 'J1.10');
    writeBuildInfo(r.dir, info(r.git('rev-parse', 'HEAD'))); r.git('checkout', '-q', 'main');
    assert.equal(latestBuild(r.data, r.db).build!.stale, false);
  } finally { r.close(); }
});

test('sin build-info.json: origin null y sin stale', () => {
  const r = repo();
  try {
    const {build} = latestBuild(r.data, r.db);
    assert.equal(build!.origin, null);
    assert.equal('stale' in build!, false);
    assert.equal('commit' in build!, false);
  } finally { r.close(); }
});

test('un build-info.json roto cuenta como origen desconocido', () => {
  const r = repo();
  try {
    writeFileSync(join(r.dir, 'build-info.json'), '{"commit": 3');
    assert.equal(readBuildInfo(r.dir), null);
    writeFileSync(join(r.dir, 'build-info.json'), JSON.stringify({commit: '--output=x'}));
    assert.equal(readBuildInfo(r.dir), null, 'el commit tiene que ser un hash');
    assert.equal(latestBuild(r.data, r.db).build!.origin, null);
  } finally { r.close(); }
});

test('nomos build stamp <carpeta> escribe HEAD del cwd y la rama', () => {
  const r = repo();
  try {
    const out = execFileSync(process.execPath, [cliPath, 'build', 'stamp', r.dir], {cwd: r.root, encoding: 'utf8'});
    const saved = JSON.parse(readFileSync(join(r.dir, 'build-info.json'), 'utf8'));
    assert.equal(saved.commit, r.head);
    assert.equal(saved.branch, 'main');
    assert.ok(Date.parse(saved.builtAt));
    assert.equal(saved.task, null); assert.equal(saved.run, null);
    assert.match(out, new RegExp(r.head.slice(0, 7)));
    assert.equal(latestBuild(r.data, r.db).build!.stale, false);
  } finally { r.close(); }
});

test('la comprobación build deja build-info.json junto al ejecutable con tarea y run', async () => {
  const f = checksFixture({files: ['Config/DefaultGame.ini']});
  // hito 19: el paquete se borra al terminar; build-info.json se lee mientras el juego corre
  let saved: ReturnType<typeof readBuildInfo> = null;
  const launch = f.deps.launch!;
  f.deps.launch = async (exe, args, ms) => { saved = readBuildInfo(dirname(exe)); return launch(exe, args, ms); };
  try {
    process.env.NOMOS_FAKE = 'ok';
    await f.run();
    const run = f.events('test.running').find(e => e.check === 'build')!;
    assert.ok(saved, 'falta build-info.json');
    assert.equal(saved.commit, 'abc1234def5678');
    assert.equal(saved.task, f.task.id);
    assert.equal(saved.run, run.runId);
  } finally { f.close(); }
});

test('nomos play --status: «Build de <commit corto>, 12 min, anterior a main»', () => {
  const now = Date.parse('2026-10-25T02:34:00Z'), base = {builtAt: '2026-10-25T02:22:00.000Z'};
  const origin = info('abcdef1234567');
  assert.equal(buildSummary({...base, origin, commit: origin.commit, stale: true}, now), 'Build de abcdef1, 12 min, anterior a main');
  assert.equal(buildSummary({...base, origin, commit: origin.commit, stale: false}, now), 'Build de abcdef1, 12 min, al día con main');
  assert.equal(buildSummary({...base, origin, commit: origin.commit}, now), 'Build de abcdef1, 12 min');
  assert.equal(buildSummary({...base, origin: null}, now), 'Build de origen desconocido, 12 min');
  assert.equal(buildSummary({builtAt: '2026-10-24T23:34:00Z', origin: null}, now), 'Build de origen desconocido, 3 h');
});
