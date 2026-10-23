import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMeshy } from '../../service/src/adapters/meshy.ts';
import { meshyServer } from '../fakes/meshy-server.ts';

test('adaptador REST: rutas de docs.meshy.ai, id en result, tarea normalizada y saldo', async () => {
  const fake = await meshyServer();
  try {
    const meshy = createMeshy({baseUrl: fake.baseUrl, apiKey: 'clave-falsa'});
    const id = await meshy.textTo3d({prompt: 'caja de munición metálica', mode: 'preview'});
    assert.equal(fake.created[0].path, '/openapi/v2/text-to-3d');
    assert.deepEqual(fake.created[0].body, {prompt: 'caja de munición metálica', mode: 'preview'});
    await meshy.textTo3d({prompt: 'caja de munición metálica', mode: 'refine', previewTaskId: id});
    assert.equal(fake.created[1].body.preview_task_id, id);
    await meshy.remesh({inputTaskId: id, targetPolycount: 5000, topology: 'quad'});
    assert.equal(fake.created[2].path, '/openapi/v1/remesh');
    assert.equal((await meshy.getTask('text', id)).status, 'IN_PROGRESS');
    const done = await meshy.getTask('text', id);
    assert.equal(done.status, 'SUCCEEDED');
    assert.match(done.modelUrls.glb, /job-1\.glb$/);
    assert.equal(done.creditsUsed, 5);
    assert.equal((await meshy.listTasks('text')).length, 2);
    assert.equal(await meshy.balance(), 900);
  } finally { await fake.close(); }
});

test('sin clave: meshy_missing_key; rig y animate no existen: meshy_kind_not_allowed', async () => {
  await assert.rejects(createMeshy({apiKey: ''}).balance(), /meshy_missing_key/);
  const meshy = createMeshy({apiKey: 'x', fetch: (async () => { throw new Error('no debe llamar'); }) as typeof fetch});
  for (const kind of ['rig', 'animate', 'video'])
    await assert.rejects(meshy.create(kind as 'text', {}), /meshy_kind_not_allowed/);
  assert.ok(!('rig' in meshy) && !('animate' in meshy), 'el adaptador no expone rig ni animate');
});
