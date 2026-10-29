import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../service/src/db.ts';
import { doctor } from '../../service/src/doctor.ts';
import { queueGraph } from '../../service/src/graph.ts';
import { start, readServiceInfo, isAlive } from '../../service/src/server.ts';
import { removeDir } from '../remove-dir.ts';

// Hito 23: cada juego tiene su grafo de graphify y doctor comprueba graphify y ponytail.
const fakeGraphify = (dir: string) => {
  const bin = join(dir, 'graphify.cmd');
  writeFileSync(bin, '@echo off\r\nmkdir "%~1\\graphify-out" 2>nul\r\necho %*>>"%~1\\graphify-out\\calls.txt"\r\ntype nul > "%~1\\graphify-out\\graph.json"\r\n');
  return bin;
};
const game = (t: { after(fn: () => unknown): void }, config?: object) => {
  const root = mkdtempSync(join(tmpdir(), 'nomos graph-')), dataDir = join(root, '.nomos');
  mkdirSync(dataDir); writeFileSync(join(root, 'Juego.uproject'), '{}'); writeFileSync(join(root, '.gitignore'), '.nomos/\n');
  if (config) writeFileSync(join(dataDir, 'config.json'), JSON.stringify(config));
  t.after(async () => {
    const info = readServiceInfo(dataDir);
    if (info && await isAlive(info)) await fetch(`http://127.0.0.1:${info.port}/admin/stop`, {method: 'POST', headers: {Authorization: `Bearer ${info.token}`}});
    removeDir(root);
  });
  return {root, dataDir};
};

test('doctor: graphify imprescindible (PATH o ~/.local/bin) y ponytail como aviso', async t => {
  const {root, dataDir} = game(t), bin = join(root, 'bin'), home = join(root, 'home');
  mkdirSync(bin); fakeGraphify(bin); mkdirSync(join(home, '.claude'), {recursive: true});
  const db = openDb(join(dataDir, 'nomos.db'));
  try {
    const row = async (id: string, env: NodeJS.ProcessEnv) => (await doctor(dataDir, db, {env, orca: {isRunning: async () => true}})).find(r => r.id === id)!;
    assert.equal((await row('graphify', {PATH: bin, USERPROFILE: home})).state, 'ok');
    assert.equal((await row('graphify', {PATH: '', USERPROFILE: home})).state, 'falla');
    mkdirSync(join(home, '.local', 'bin'), {recursive: true}); fakeGraphify(join(home, '.local', 'bin'));
    assert.equal((await row('graphify', {PATH: '', USERPROFILE: home})).state, 'ok');
    assert.equal((await row('ponytail', {USERPROFILE: home})).state, 'aviso');
    writeFileSync(join(home, '.claude', 'settings.json'), JSON.stringify({enabledPlugins: {'ponytail@ponytail': true}}));
    assert.equal((await row('ponytail', {USERPROFILE: home})).state, 'ok');
  } finally { db.close(); }
});

test('start: sin graphify-out/ lanza graphify en segundo plano y lo ignora en Git', async t => {
  const {root, dataDir} = game(t);
  mkdirSync(join(root, 'bin')); process.env.NOMOS_GRAPHIFY = fakeGraphify(join(root, 'bin'));
  await start({dataDir, port: 0});
  for (const end = Date.now() + 15_000; !existsSync(join(root, 'graphify-out', 'calls.txt')) && Date.now() < end;) await new Promise(r => setTimeout(r, 100));
  assert.match(readFileSync(join(root, 'graphify-out', 'calls.txt'), 'utf8'), /--no-viz/);
  assert.doesNotMatch(readFileSync(join(root, 'graphify-out', 'calls.txt'), 'utf8'), /--update/);
  assert.match(readFileSync(join(root, '.gitignore'), 'utf8'), /^graphify-out\/$/m);
  assert.match(readFileSync(join(root, '.graphifyignore'), 'utf8'), /^!Source\/$/m);
});

test('queueGraph: respeta enabled:false y no duplica el proceso si hay uno en cola o en marcha', t => {
  const off = game(t, {graphify: {enabled: false}}), on = game(t);
  mkdirSync(join(on.root, 'bin')); process.env.NOMOS_GRAPHIFY = fakeGraphify(join(on.root, 'bin'));
  const dbOff = openDb(join(off.dataDir, 'nomos.db')), db = openDb(join(on.dataDir, 'nomos.db'));
  try {
    assert.equal(queueGraph(dbOff, off.dataDir), false);
    assert.equal(queueGraph(db, on.dataDir), true);
    assert.equal(queueGraph(db, on.dataDir), false);
    assert.equal(db.prepare("select count(*) n from commands where type='graph.update'").get()!.n, 1);
    process.env.NOMOS_GRAPHIFY = 'off';
    assert.equal(queueGraph(db, on.dataDir), false);
  } finally { dbOff.close(); db.close(); }
});
