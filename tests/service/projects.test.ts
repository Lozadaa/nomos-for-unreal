import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../service/src/db.ts';
import { createServer } from '../../service/src/server.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { addArtifact } from '../../service/src/repo/artifacts.ts';
import { listProjects, register, registryFile, unregister } from '../../service/src/projects.ts';
import { token } from '../helpers.ts';
import { removeDir } from '../remove-dir.ts';

/** Dos juegos en carpetas propias y un registro temporal: nunca el de la máquina. */
function machine(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'nomos-proyectos-'));
  process.env.NOMOS_REGISTRY = join(root, 'registro', 'projects.json');
  const game = (name: string) => {
    const dir = join(root, name), data = join(dir, '.nomos');
    mkdirSync(data, {recursive: true}); writeFileSync(join(dir, `${name}.uproject`), '{}');
    return data;
  };
  t.after(() => { delete process.env.NOMOS_REGISTRY; removeDir(root); });
  return {root, game};
}

test('registro: nomos start apunta nombre del .uproject, carpeta, puerto y pid; stop lo quita; un pid muerto caduca; nunca el token', t => {
  const {game} = machine(t);
  const blockKings = game('BlockKings'), fab = game('KratosFabTest');
  register(fab, 8780, 999_999_999);
  register(blockKings, 51234);
  const file = readFileSync(registryFile(), 'utf8');
  assert.doesNotMatch(file, /token/i);
  const names = JSON.parse(file).map((e: {name: string}) => e.name);
  assert.deepEqual(names, ['BlockKings'], 'el pid 999999999 no existe: su entrada caduca al registrar otra');
  register(fab, 8780);
  assert.deepEqual(listProjects(blockKings).map(p => [p.name, p.current, p.alive]), [['BlockKings', true, true], ['KratosFabTest', false, true]]);
  unregister(fab);
  assert.deepEqual(listProjects(blockKings).map(p => p.name), ['BlockKings']);
});

test('GET /projects: tareas vivas y Decisiones abiertas de cada juego, sin tokens; GET /session solo para el propio origen', async t => {
  const {game} = machine(t);
  const blockKings = game('BlockKings'), fab = game('KratosFabTest');
  const other = openDb(join(fab, 'nomos.db'));
  const hud = createTask(other, {title: 'HUD', area: 'ui', state: 'implementando'});
  mkdirSync(join(fab, 'artifacts'), {recursive: true}); writeFileSync(join(fab, 'artifacts', 'captura.png'), 'png');
  addArtifact(other, {taskId: hud.id, runId: null, kind: 'screenshot', path: 'captura.png', provenance: {}, previewPath: null}); other.close();
  register(fab, 8780);
  const db = openDb(join(blockKings, 'nomos.db'));
  const web = mkdtempSync(join(tmpdir(), 'nomos-web-')); writeFileSync(join(web, 'index.html'), '<!doctype html>');
  const server = createServer(db, token, web, blockKings);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  // las pruebas de este archivo cierran el servicio antes de que machine() borre las carpetas (los after van en orden)
  const close = async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); db.close(); removeDir(web); };
  try {
  const port = (server.address() as {port: number}).port, base = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(`${base}/projects`)).status, 401);
  const response = await fetch(`${base}/projects`, {headers: {Authorization: `Bearer ${token}`}});
  const text = await response.text();
  assert.doesNotMatch(text, new RegExp(token));
  const list = JSON.parse(text) as {name: string; current: boolean; liveTasks: number; port: number}[];
  assert.deepEqual(list.map(p => [p.name, p.current]), [['BlockKings', true], ['KratosFabTest', false]]);
  assert.equal(list[1].liveTasks, 1);
  assert.equal(list[1].port, 8780);
  // la última captura con ruta relativa a artifacts/ (como la semilla) también se sirve
  assert.equal(list[1].hasCapture, true);
  const shot = await fetch(`${base}/projects/8780/capture`, {headers: {Authorization: `Bearer ${token}`}});
  assert.equal(shot.status, 200);
  assert.equal(shot.headers.get('content-type'), 'image/png');

  const session = await fetch(`${base}/session`, {headers: {'Sec-Fetch-Site': 'same-origin'}});
  assert.equal(session.status, 200);
  assert.deepEqual(await session.json(), {token});
  assert.equal((await fetch(`${base}/session`, {headers: {Origin: 'http://evil.example'}})).status, 403);
  assert.equal((await fetch(`${base}/session`, {headers: {'Sec-Fetch-Site': 'cross-site'}})).status, 403);
  // fetch no deja cambiar Host: el rebinding de DNS se imita con http.request
  const rebound = await new Promise<number>(accept => get({host: '127.0.0.1', port, path: '/session', headers: {Host: `evil.example:${port}`}}, r => { r.resume(); accept(r.statusCode!); }));
  assert.equal(rebound, 403, 'rebinding de DNS: solo el host 127.0.0.1');
  } finally { await close(); }
});
