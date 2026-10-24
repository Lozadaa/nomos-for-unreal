import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { fixture } from './route-fixture.ts';
import { ensureBudget } from '../../service/src/repo/budget.ts';
import { seed } from '../../service/src/seed.ts';
import { addArtifact } from '../../service/src/repo/artifacts.ts';

test('archivos reales con MIME, containment, porcentajes literales y ausentes', async () => {
  const f = await fixture();
  try {
    seed(f.db);
    const artifacts = f.db.prepare('select id,path from artifacts').all();
    for (const row of artifacts) {
      const response = await f.request(`/artifacts/${row.id}/file`);
      assert.equal(response.status,200);
      const mime = String(row.path).endsWith('.glb') ? 'model/gltf-binary' : String(row.path).endsWith('.png') ? 'image/png' : 'text/plain; charset=utf-8';
      assert.equal(response.headers.get('content-type'),mime); assert.ok((await response.arrayBuffer()).byteLength);
    }
    const root = join(f.dir,'artifacts');
    writeFileSync(join(root,'100%literal.txt'),'porcentaje');
    const file = (path:string) => addArtifact(f.db,{taskId:'seed-task-06',kind:'report',path}).id;
    for (const path of ['100%literal.txt',join(root,'100%literal.txt')]) {
      const response = await f.request(`/artifacts/${file(path)}/file`); assert.equal(response.status,200); assert.equal(await response.text(),'porcentaje');
    }
    const sibling = join(f.dir,'artifacts-escape'); mkdirSync(sibling); writeFileSync(join(sibling,'secret.txt'),'secret');
    symlinkSync(sibling,join(root,'junction'),process.platform==='win32'?'junction':'dir');
    for (const path of ['../secret.txt','..\\secret.txt',join(sibling,'secret.txt'),'junction/secret.txt','C:relative.txt','bad\u0000.txt'])
      assert.equal((await f.request(`/artifacts/${file(path)}/file`)).status,400,path);
    assert.equal((await f.request(`/artifacts/${file('missing.txt')}/file`)).status,404);
    assert.equal((await f.request('/artifacts/nope/file')).status,404);
    assert.equal((await f.request('/artifacts/%FF/file')).status,400);
    assert.ok((await (await f.request('/artifacts?taskId=seed-task-06')).json()).every((a:any)=>a.taskId==='seed-task-06'));
  } finally { await f.close(); }
});

test('capacidades leen configuración de dataDir y presupuesto GET no escribe', async () => {
  const f = await fixture(true);
  try {
    const executable = join(f.dir,'blender-custom'); writeFileSync(executable,'');
    writeFileSync(join(f.dir,'config.json'),JSON.stringify({blenderPath:executable}));
    const response = await f.request('/capabilities'); assert.equal(response.status,200);
    assert.equal((await response.json()).find((c:any)=>c.id==='blender').state,'detectado');
    assert.equal((await f.request('/budget')).status,404);
    assert.equal(f.db.prepare('select count(*) n from budgets').get()!.n,0);
    ensureBudget(f.db,'workspace','first',{}); ensureBudget(f.db,'workspace','second',{});
    assert.equal((await f.request('/budget')).status,400);
    assert.equal((await f.request('/budget?scopeId=first')).status,200);
    assert.equal(f.db.prepare('select count(*) n from budgets').get()!.n,2);
  } finally { await f.close(); }
});


test('reporte HTML se sirve aislado del panel con sandbox sin scripts', async () => {
  const f = await fixture();
  try {
    seed(f.db);
    writeFileSync(join(f.dir,'artifacts','report.html'),'<script>fetch("/tasks")</script>');
    const artifact = addArtifact(f.db,{taskId:'seed-task-09',kind:'report',path:'report.html'});
    const response = await f.request(`/artifacts/${artifact.id}/file`);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'text/html; charset=utf-8');
    assert.equal(response.headers.get('content-security-policy'),"sandbox; default-src 'none'");
  } finally { await f.close(); }
});

test('hito 5b: el vídeo se sirve como video/mp4 y su miniatura (fotograma del 50 %) por /preview, con las mismas reglas', async () => {
  const f = await fixture();
  try {
    seed(f.db);
    const root = join(f.dir, 'artifacts');
    mkdirSync(join(root, 'tests', 'x'), {recursive: true});
    writeFileSync(join(root, 'tests', 'x', 'anim-1280x720.mp4'), 'mp4'); writeFileSync(join(root, 'tests', 'x', 'anim-1280x720-50.png'), 'png');
    const video = addArtifact(f.db, {taskId: 'seed-task-06', kind: 'video', path: join(root, 'tests', 'x', 'anim-1280x720.mp4'),
      previewPath: join(root, 'tests', 'x', 'anim-1280x720-50.png')});
    assert.equal((await f.request(`/artifacts/${video.id}/file`)).headers.get('content-type'), 'video/mp4');
    const preview = await f.request(`/artifacts/${video.id}/preview`);
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get('content-type'), 'image/png');
    const plain = addArtifact(f.db, {taskId: 'seed-task-06', kind: 'report', path: 'x.txt'});
    assert.equal((await f.request(`/artifacts/${plain.id}/preview`)).status, 404);
    const outside = addArtifact(f.db, {taskId: 'seed-task-06', kind: 'video', path: 'a.mp4', previewPath: 'C:/Windows/win.ini'});
    assert.equal((await f.request(`/artifacts/${outside.id}/preview`)).status, 400);
  } finally { await f.close(); }
});
