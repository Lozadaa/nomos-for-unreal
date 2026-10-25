import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { openDb } from '../../service/src/db.ts';
import { createServer } from '../../service/src/server.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { addArtifact, recordTestRun } from '../../service/src/repo/artifacts.ts';
import { latestBuild, playArgs } from '../../service/src/play.ts';
import { waitFor } from './wait.ts';
import { removeDir } from '../remove-dir.ts';

function project(uproject = true) {
  const root = mkdtempSync(join(tmpdir(), 'nomos-play-'));
  if (uproject) writeFileSync(join(root, 'Juego.uproject'), '{}');
  const data = join(root, '.nomos'); mkdirSync(data);
  const db = openDb(join(data, 'nomos.db'));
  // Windows suelta el .exe de una partida recién cerrada con algo de retraso
  return {root, data, db, close() {
    db.close();
    for (const end = Date.now() + 10_000; ;) {
      try { return removeDir(root); }
      catch (error) { if (Date.now() > end) throw error; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100); }
    }
  }};
}
/** Un «ejecutable» con fecha fija; `node` enlazado cuando hay que arrancarlo de verdad. */
function exe(file: string, when: string, runnable = false) {
  mkdirSync(dirname(file), {recursive: true});
  // copia, no enlace duro: Windows no deja borrar un enlace a la imagen del node que está corriendo
  if (runnable) copyFileSync(process.execPath, file);
  else writeFileSync(file, 'MZ');
  utimesSync(file, new Date(when), new Date(when));
  return file;
}

test('latestBuild: sin .uproject y sin builds explica el motivo', () => {
  const none = project(false), empty = project();
  try {
    assert.deepEqual(latestBuild(none.data, none.db), {build: null, reason: 'No hay ningún .uproject en el proyecto'});
    exe(join(empty.root, 'Build', 'Windows-actual', 'Otro.exe'), '2026-10-01T10:00:00Z');
    assert.deepEqual(latestBuild(empty.data, empty.db), {build: null, reason: 'Todavía no hay ninguna build'});
  } finally { none.close(); empty.close(); }
});

test('latestBuild: elige la más reciente entre Build/, artefactos y paquetes de pruebas, con su tarea', () => {
  const p = project();
  try {
    const task = createTask(p.db, {title: 'J1.6 Golpe con retroceso', area: 'gameplay'});
    exe(join(p.root, 'Build', 'Windows-actual', 'Juego.exe'), '2026-10-20T10:00:00Z');
    exe(join(p.root, 'Build', 'Windows-viejo', 'Juego.exe'), '2026-10-19T10:00:00Z');
    const run = recordTestRun(p.db, {taskId: task.id, result: 'passed', checkId: 'build'});
    const packaged = exe(join(p.data, 'artifacts', 'tests', run.id, 'build', 'Windows', 'Juego', 'Binaries', 'Win64', 'Juego.exe'), '2026-10-22T10:00:00Z');
    const {build, reason} = latestBuild(p.data, p.db);
    assert.equal(reason, null);
    assert.equal(build!.path, packaged);
    assert.equal(build!.builtAt, '2026-10-22T10:00:00.000Z');
    assert.equal(build!.size, 2);
    assert.deepEqual(build!.task, {id: task.id, code: 'J1.6', title: 'J1.6 Golpe con retroceso'});
    assert.equal(build!.check, 'build');
    // el .pak recién cocinado cuenta aunque el .exe no cambie (copias que conservan la fecha)
    const pak = join(p.root, 'Build', 'Windows-actual', 'Juego', 'Content', 'Paks', 'Juego-Windows.pak');
    exe(pak, '2026-10-23T10:00:00Z');
    const actual = latestBuild(p.data, p.db).build!;
    assert.equal(actual.path, join(p.root, 'Build', 'Windows-actual', 'Juego.exe'));
    assert.equal(actual.builtAt, '2026-10-23T10:00:00.000Z');
    assert.equal(actual.task, null);
  } finally { p.close(); }
});

test('latestBuild: un artefacto build fuera del proyecto nunca es candidato', () => {
  const p = project(), outside = mkdtempSync(join(tmpdir(), 'nomos-fuera-'));
  try {
    const task = createTask(p.db, {title: 'Empaquetar', area: 'builds'});
    addArtifact(p.db, {taskId: task.id, kind: 'build', path: exe(join(outside, 'Juego.exe'), '2026-10-24T10:00:00Z'), provenance: {check: 'build'}});
    const inside = exe(join(p.root, 'Saved', 'Paquete', 'Juego.exe'), '2026-10-21T10:00:00Z');
    addArtifact(p.db, {taskId: task.id, kind: 'build', path: inside, provenance: {check: 'build', testRunId: 'x'}});
    const {build} = latestBuild(p.data, p.db);
    assert.equal(build!.path, inside);
    assert.deepEqual(build!.task, {id: task.id, code: null, title: 'Empaquetar'});
  } finally { p.close(); removeDir(outside); }
});

test('playArgs: por defecto ventana 1920x1080; el mapa va primero y solo /Game/…', () => {
  assert.deepEqual(playArgs({}), ['-windowed', '-ResX=1920', '-ResY=1080']);
  assert.deepEqual(playArgs({play: {map: '/Game/Mapas/Arena', args: ['-log']}}), ['/Game/Mapas/Arena', '-log']);
  assert.throws(() => playArgs({play: {map: 'C:/otro.umap'}}), /invalid_play_config/);
  assert.throws(() => playArgs({play: {args: '-windowed'}}), /invalid_play_config/);
});

async function serve(p: ReturnType<typeof project>) {
  const server = createServer(p.db, 'secret', 'service/web', p.data);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const call = async (path: string, method = 'GET', auth = true) => {
    const response = await fetch(base + path, {method, headers: auth ? {Authorization: 'Bearer secret'} : {}, ...(method === 'POST' ? {body: '{}'} : {})});
    return {status: response.status, body: await response.json()};
  };
  const events = (type: string) => p.db.prepare('select payload from events where type=?').all(type).map(r => JSON.parse(r.payload as string));
  return {call, events, close: () => new Promise<void>(resolve => server.close(() => resolve()))};
}

test('POST /play arranca la build desprendida, no duplica y /play/stop la cierra', async () => {
  const p = project();
  const file = exe(join(p.root, 'Build', 'Windows-actual', 'Juego.exe'), '2026-10-22T10:00:00Z', true);
  writeFileSync(join(dirname(file), 'espera.mjs'), 'setTimeout(() => {}, 60_000);');
  writeFileSync(join(p.data, 'config.json'), JSON.stringify({play: {args: ['espera.mjs']}}));
  const s = await serve(p);
  try {
    assert.equal((await s.call('/play', 'GET', false)).status, 401);
    assert.equal((await s.call('/play/stop', 'POST', false)).status, 401);
    const before = await s.call('/play');
    assert.equal(before.body.running, null);
    assert.equal(before.body.build.path, file);
    const started = await s.call('/play', 'POST');
    assert.equal(started.status, 202);
    const pid = started.body.running.pid;
    assert.ok(Number.isSafeInteger(pid));
    assert.deepEqual(s.events('play.started'), [{path: file, pid, builtAt: '2026-10-22T10:00:00.000Z', task: null}]);
    assert.doesNotThrow(() => process.kill(pid, 0));
    const again = await s.call('/play', 'POST');
    assert.deepEqual([again.status, again.body], [409, {error: 'already_running', pid}]);
    assert.equal((await s.call('/play')).body.running.pid, pid);
    const stopped = await s.call('/play/stop', 'POST');
    assert.deepEqual([stopped.status, stopped.body.running], [200, null]);
    await waitFor(() => { try { process.kill(pid, 0); return false; } catch { return true; } });
    await waitFor(() => s.events('play.stopped').length === 1);
    assert.equal(s.events('play.stopped')[0].pid, pid);
    assert.equal((await s.call('/play')).body.lastPlayedBuiltAt, '2026-10-22T10:00:00.000Z');
  } finally { await s.close(); p.close(); }
});

test('la partida que termina sola emite play.stopped; sin build POST /play da el motivo', async () => {
  const p = project();
  const s = await serve(p);
  try {
    assert.deepEqual(await s.call('/play', 'POST'), {status: 404, body: {error: 'no_build', reason: 'Todavía no hay ninguna build'}});
    assert.deepEqual((await s.call('/play')).body, {build: null, running: null, reason: 'Todavía no hay ninguna build', lastPlayedBuiltAt: null});
    const file = exe(join(p.root, 'Build', 'Windows-actual', 'Juego.exe'), '2026-10-22T10:00:00Z', true);
    writeFileSync(join(dirname(file), 'corta.mjs'), 'setTimeout(() => {}, 300);');
    writeFileSync(join(p.data, 'config.json'), JSON.stringify({play: {args: ['corta.mjs']}}));
    assert.equal((await s.call('/play', 'POST')).status, 202);
    await waitFor(() => s.events('play.stopped').length === 1);
    assert.equal((await s.call('/play')).body.running, null);
    assert.equal((await s.call('/play/stop', 'POST')).body.running, null);
    assert.equal(s.events('play.stopped').length, 1);
  } finally { await s.close(); p.close(); }
});
