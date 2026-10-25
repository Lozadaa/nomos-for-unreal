import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAbsolute, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from '../../service/src/server.ts';
import { addArtifact, listArtifacts } from '../../service/src/repo/artifacts.ts';
import { createTask, getTask } from '../../service/src/repo/tasks.ts';
import { continuationBrief } from '../../service/src/handlers/continue.ts';
import { checksFixture } from './checks-fixture.ts';
import { fixture } from './route-fixture.ts';

test('una comprobación deja en la base rutas relativas a <datos>/artifacts y el servicio las sirve', async () => {
  const f = checksFixture({files: ['Content/Blueprints/BP_Puerta.uasset']});
  const server = createServer(f.db, 'secret', 'service/web', f.dataDir);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    process.env.NOMOS_FAKE = 'ok';
    await f.run();
    const artifacts = listArtifacts(f.db, {taskId: f.task.id});
    assert.ok(artifacts.length);
    for (const a of artifacts) {
      assert.ok(!isAbsolute(a.path) && !a.path.includes('\\'), a.path);
      assert.match(a.path, /^tests\//);
    }
    const report = artifacts.find(a => a.kind === 'report')!;
    const response = await fetch(`http://127.0.0.1:${(server.address() as any).port}/artifacts/${report.id}/file`, {headers: {Authorization: 'Bearer secret'}});
    assert.equal(response.status, 200);
    assert.match(await response.text(), /\S/);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); f.close(); }
});

test('addArtifact: dentro de la carpeta de datos relativa (también la miniatura); fuera, tal cual y se sirve igual que hoy', async () => {
  const f = await fixture();
  try {
    const task = createTask(f.db, {title: 'Build', area: 'builds'});
    mkdirSync(join(f.dir, 'artifacts', 'tests', 'r1'), {recursive: true});
    writeFileSync(join(f.dir, 'artifacts', 'tests', 'r1', 'clip.mp4'), 'mp4');
    writeFileSync(join(f.dir, 'artifacts', 'tests', 'r1', 'medio.png'), 'png');
    // la base del fixture vive en f.dir: addArtifact la usa como carpeta de datos sin que el caller la pase
    const video = addArtifact(f.db, {taskId: task.id, kind: 'video', path: join(f.dir, 'artifacts', 'tests', 'r1', 'clip.mp4'),
      previewPath: join(f.dir, 'artifacts', 'tests', 'r1', 'medio.png')});
    assert.deepEqual([video.path, video.previewPath], ['tests/r1/clip.mp4', 'tests/r1/medio.png']);
    assert.equal((await f.request(`/artifacts/${video.id}/preview`)).status, 200);
    const exe = join(f.dir, 'Build', 'Windows-actual', 'Juego.exe'), sibling = join(f.dir, 'artifacts-escape', 'x.txt');
    for (const path of [exe, sibling]) {
      const a = addArtifact(f.db, {taskId: task.id, kind: 'build', path});
      assert.equal(a.path, path);
      assert.equal((await f.request(`/artifacts/${a.id}/file`)).status, 400);
    }
  } finally { await f.close(); }
});

test('archive_path relativo a la carpeta de datos: el archivo de la tarea y la continuación lo encuentran', async () => {
  const f = await fixture();
  try {
    const parent = createTask(f.db, {title: 'HUD', area: 'ui', state: 'done'});
    const dir = join(f.dir, 'archive', parent.id);
    mkdirSync(dir, {recursive: true});
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({taskId: parent.id, createdAt: 'x', files: {}}));
    writeFileSync(join(dir, 'resumen.md'), '# Resumen del HUD\n');
    f.db.prepare('update tasks set archive_path=? where id=?').run(`archive/${parent.id}`, parent.id);
    assert.equal((await f.request(`/tasks/${parent.id}/archive`)).status, 200);
    assert.equal((await f.request(`/tasks/${parent.id}/archive/resumen.md`)).status, 200);
    const child = createTask(f.db, {title: 'Ajuste', area: 'ui', parentTaskId: parent.id});
    assert.match(continuationBrief(f.db, getTask(f.db, child.id)!)!, /Resumen del HUD/);
  } finally { await f.close(); }
});
