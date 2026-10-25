import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checksFixture } from './checks-fixture.ts';
import { listArtifacts } from '../../service/src/repo/artifacts.ts';
import { locatedPath } from '../../service/src/data-paths.ts';
import { cleanSource, diskText } from '../../service/src/retention.ts';
import { cliPath } from '../cli-helpers.ts';
import type { Launch } from '../../service/src/checks/run.ts';

const GB = 1024 ** 3;
const env = () => { process.env.NOMOS_FAKE = 'ok'; };
/** El ejecutable falso deja captura y log dentro del paquete; `copy` imita al director copiándolo a `Build/Windows-actual`. */
const game = (run: Partial<Launch> = {}, copy?: string) => async (exe: string): Promise<Launch> => {
  const saved = join(dirname(exe), 'Juego', 'Saved');
  mkdirSync(join(saved, 'Logs'), {recursive: true}); writeFileSync(join(saved, 'Logs', 'Juego.log'), 'LogInit: Display: arranque\n');
  mkdirSync(join(saved, 'Screenshots'), {recursive: true}); writeFileSync(join(saved, 'Screenshots', 'HighresScreenshot00000.png'), 'png');
  if (copy) { mkdirSync(copy, {recursive: true}); copyFileSync(exe, join(copy, 'Juego.exe')); copyFileSync(join(dirname(exe), 'build-info.json'), join(copy, 'build-info.json')); }
  return {exitCode: null, seconds: 30, killed: true, ...run};
};
const testDirs = (dataDir: string) => readdirSync(join(dataDir, 'artifacts', 'tests')).map(id => join(dataDir, 'artifacts', 'tests', id));

test('la comprobación build borra su paquete al terminar y conserva log, capturas y log del juego; el artefacto build queda retirado', async () => {
  const f = checksFixture({files: ['Config/DefaultGame.ini'], deps: {launch: game()}});
  try {
    env(); await f.run();
    const [dir] = testDirs(f.dataDir);
    assert.equal(existsSync(join(dir, 'build')), false, 'el paquete no se queda en artifacts/tests');
    assert.ok(existsSync(join(dir, 'log.txt')));
    const artifacts = listArtifacts(f.db, {taskId: f.task.id}), root = join(f.dataDir, 'artifacts');
    for (const a of artifacts.filter(a => a.kind !== 'build')) assert.ok(existsSync(locatedPath(root, a.path)), `${a.kind} ${a.path} sigue en disco`);
    assert.ok(artifacts.some(a => a.kind === 'screenshot') && artifacts.some(a => (a.provenance as {source?: string}).source === 'game-log'));
    const build = artifacts.find(a => a.kind === 'build')!;
    assert.equal((build.provenance as {removed?: boolean}).removed, true);
  } finally { f.close(); }
});

test('si Build/Windows-actual es la misma build, el artefacto build pasa a apuntar allí', async () => {
  const f = checksFixture({files: ['Config/DefaultGame.ini']});
  const actual = join(f.projectDir, 'Build', 'Windows-actual');
  f.deps.launch = game({}, actual);
  try {
    env(); await f.run();
    const build = listArtifacts(f.db, {taskId: f.task.id}).find(a => a.kind === 'build')!;
    assert.equal(build.path, join(actual, 'Juego.exe'));
    assert.equal((build.provenance as {removed?: boolean}).removed, undefined);
    assert.ok(existsSync(join(actual, 'Juego.exe')), 'la build del proyecto nunca se toca');
  } finally { f.close(); }
});

test('un paquete que falla también se borra y deja el log del juego', async () => {
  const f = checksFixture({files: ['Config/DefaultGame.ini'], deps: {launch: game({exitCode: 3, seconds: 4, killed: false})}});
  try {
    env(); await f.run();
    const [dir] = testDirs(f.dataDir);
    assert.equal(existsSync(join(dir, 'build')), false);
    assert.match(f.events('test.failed').at(-1)!.summary, /El proceso terminó a los 4 s/);
    const log = listArtifacts(f.db, {taskId: f.task.id}).find(a => (a.provenance as {source?: string}).source === 'game-log')!;
    assert.ok(existsSync(locatedPath(join(f.dataDir, 'artifacts'), log.path)));
  } finally { f.close(); }
});

test('con menos de 10 GB libres no se empaqueta: no disponible y pide nomos clean', async () => {
  const f = checksFixture({files: ['Config/DefaultGame.ini'], deps: {launch: game(), freeBytes: () => 6 * GB}});
  try {
    env(); await f.run();
    const [dir] = testDirs(f.dataDir);
    assert.equal(existsSync(join(dir, 'build')), false, 'ni siquiera arrancó BuildCookRun');
    assert.match(f.events('test.unavailable').at(-1)!.summary, /Disco: 6 GB libres.*ejecuta nomos clean/);
  } finally { f.close(); }
});

test('el aviso de disco: por debajo de 30 GB pide nomos clean', () => {
  assert.equal(diskText(24 * GB), 'Disco: 24 GB libres · ejecuta nomos clean');
  assert.equal(diskText(120.4 * GB), 'Disco: 120 GB libres');
});

function tree() {
  const root = mkdtempSync(join(tmpdir(), 'nomos-origen-'));
  for (const d of ['Saved/StagedBuilds/Windows', 'Saved/Paquete-J1', 'Saved/Paquete-J2', 'Saved/Logs', 'Build/Windows-actual', 'Build/Otra'])
    { mkdirSync(join(root, d), {recursive: true}); writeFileSync(join(root, d, 'f.bin'), 'x'); }
  return root;
}

test('copiar una build a Build/Windows-actual limpia el árbol de origen y nunca lo copiado', () => {
  const src = tree(), project = tree();
  try {
    cleanSource(src, join(project, 'Build', 'Windows-actual'));
    assert.deepEqual(readdirSync(join(src, 'Saved')), ['Logs']);
    assert.deepEqual(readdirSync(join(src, 'Build')), ['Otra']);
    // el director empaqueta en el propio proyecto: su Windows-actual es el destino y se queda
    cleanSource(project, join(project, 'Build', 'Windows-actual'));
    assert.deepEqual(readdirSync(join(project, 'Saved')), ['Logs']);
    assert.ok(existsSync(join(project, 'Build', 'Windows-actual', 'f.bin')));
  } finally { rmSync(src, {recursive: true, force: true}); rmSync(project, {recursive: true, force: true}); }
});

test('nomos build stamp Build/Windows-actual limpia los paquetes del árbol desde el que se estampa', () => {
  const root = tree();
  try {
    const git = (...args: string[]) => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
    git('init', '-q', '-b', 'main'); git('config', 'user.email', 'n@n'); git('config', 'user.name', 'Nomos');
    writeFileSync(join(root, '.gitignore'), 'Saved/\nBuild/\n'); git('add', '.'); git('commit', '-qm', 'base');
    execFileSync(process.execPath, [cliPath, 'build', 'stamp', join(root, 'Build', 'Windows-actual')], {cwd: root, encoding: 'utf8'});
    assert.ok(existsSync(join(root, 'Build', 'Windows-actual', 'build-info.json')));
    assert.deepEqual(readdirSync(join(root, 'Saved')), ['Logs']);
    // estampar otra carpeta (un paquete de prueba del worker) no borra nada
    execFileSync(process.execPath, [cliPath, 'build', 'stamp', join(root, 'Build', 'Otra')], {cwd: root, encoding: 'utf8'});
    assert.ok(existsSync(join(root, 'Build', 'Windows-actual', 'f.bin')));
  } finally { rmSync(root, {recursive: true, force: true}); }
});
