import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../service/src/db.ts';
import { start, readServiceInfo, isAlive } from '../../service/src/server.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { repairArtifactPaths } from '../../service/src/repair-paths.ts';
import { listEvents } from '../../service/src/store.ts';
import { removeDir } from '../remove-dir.ts';

const put = (file: string) => { mkdirSync(join(file, '..'), {recursive: true}); writeFileSync(file, 'x'); };

/** Base con rutas absolutas de una carpeta de datos vieja (`…/Esquina/.kratos`) que ya no existe; los archivos están en la nueva. */
function movedProject(t: test.TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'nomos-repair-')), dataDir = join(root, 'BlockKings', '.nomos');
  const old = join(root, 'Esquina', '.kratos');
  t.after(async () => {
    const info = readServiceInfo(dataDir);
    if (info && await isAlive(info)) await fetch(`http://127.0.0.1:${info.port}/admin/stop`, {method: 'POST', headers: {Authorization: `Bearer ${info.token}`}});
    await new Promise(resolve => setTimeout(resolve, 40));
    removeDir(root);
  });
  mkdirSync(dataDir, {recursive: true});
  const db = openDb(join(dataDir, 'nomos.db'));
  const task = createTask(db, {title: 'Combate', area: 'gameplay'});
  const raw = (id: string, path: string, preview: string | null = null) => db.prepare(
    "insert into artifacts(id,task_id,run_id,kind,path,preview_path,provenance,license,created_at,updated_at) values (?,?,null,'screenshot',?,?,'{}',null,'t','t')")
    .run(id, task.id, path, preview);
  put(join(dataDir, 'artifacts', 'tests', 'u1', 'clip.mp4')); put(join(dataDir, 'artifacts', 'tests', 'u1', 'medio.png'));
  put(join(dataDir, 'artifacts', 'tests', 'u2', 'log.txt')); put(join(dataDir, 'archive', task.id, 'manifest.json'));
  put(join(root, 'Fuera', 'Juego.exe'));
  // barras invertidas (Windows) y barras normales: las dos formas que hay en las bases reales
  raw('back', join(old, 'artifacts', 'tests', 'u1', 'clip.mp4').replaceAll('/', '\\'), join(old, 'artifacts', 'tests', 'u1', 'medio.png').replaceAll('/', '\\'));
  raw('fwd', join(old, 'artifacts', 'tests', 'u2', 'log.txt').replaceAll('\\', '/'));
  raw('lost', join(old, 'artifacts', 'tests', 'u3', 'perdido.png'));
  raw('outside', join(root, 'Fuera', 'Juego.exe'));
  raw('relative', 'review-1.json');
  db.prepare('update tasks set archive_path=? where id=?').run(join(old, 'archive', task.id), task.id);
  return {root, dataDir, old, db, task};
}

test('al arrancar, las rutas absolutas de la carpeta vieja pasan a relativas y el servicio sirve los archivos', async t => {
  const p = movedProject(t);
  p.db.close();
  const {port, token} = await start({dataDir: p.dataDir, port: 0});
  const get = (path: string) => fetch(`http://127.0.0.1:${port}${path}`, {headers: {Authorization: `Bearer ${token}`}});
  for (const path of ['/artifacts/back/file', '/artifacts/back/preview', '/artifacts/fwd/file', `/tasks/${p.task.id}/archive/manifest.json`])
    assert.equal((await get(path)).status, 200, path);
  const db = openDb(join(p.dataDir, 'nomos.db'));
  try {
    const rows = Object.fromEntries(db.prepare('select id,path,preview_path from artifacts').all().map(r => [r.id, [r.path, r.preview_path]]));
    assert.deepEqual(rows.back, ['tests/u1/clip.mp4', 'tests/u1/medio.png']);
    assert.deepEqual(rows.fwd, ['tests/u2/log.txt', null]);
    assert.equal(rows.lost[0], join(p.old, 'artifacts', 'tests', 'u3', 'perdido.png'), 'sin reubicado: intacta');
    assert.equal(rows.outside[0], join(p.root, 'Fuera', 'Juego.exe'), 'el archivo existe: intacta');
    assert.equal(rows.relative[0], 'review-1.json');
    assert.equal(db.prepare('select archive_path from tasks where id=?').get(p.task.id)!.archive_path, `archive/${p.task.id}`);
    const events = listEvents(db, 0).filter(e => e.type === 'artifacts.repaired').map(e => e.payload);
    assert.deepEqual(events, [{rewritten: 4, missing: 1}]);
    const log = readdirSync(join(p.dataDir, 'logs')).map(f => readFileSync(join(p.dataDir, 'logs', f), 'utf8')).join('');
    assert.match(log, /"event":"artifacts_repaired","rewritten":4,"missing":1/);
  } finally { db.close(); }
});

test('repairArtifactPaths es idempotente: la segunda pasada no reescribe ni emite evento', t => {
  const p = movedProject(t);
  try {
    assert.deepEqual(repairArtifactPaths(p.db, p.dataDir), {rewritten: 4, missing: 1});
    assert.deepEqual(repairArtifactPaths(p.db, p.dataDir), {rewritten: 0, missing: 1});
    assert.equal(listEvents(p.db, 0).filter(e => e.type === 'artifacts.repaired').length, 1);
  } finally { p.db.close(); }
});
