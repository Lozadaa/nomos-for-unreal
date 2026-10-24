import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checksFixture } from './checks-fixture.ts';
import { filtered } from '../../service/src/repo/rows.ts';
import { getTask } from '../../service/src/repo/tasks.ts';
import { listDecisions } from '../../service/src/repo/decisions.ts';
import type { Run, TestRun } from '../../service/src/model.ts';

const montage = 'Content/Esquina/Combate/AM_Golpe.uasset';
const ff = {bin: process.execPath, baseArgs: [join(import.meta.dirname, '..', 'fakes', 'ffmpeg.mjs')]};
const rows = (f: ReturnType<typeof checksFixture>) => filtered<TestRun>(f.db, 'test_runs', {taskId: f.task.id}).map(r => [r.checkId, r.result]);
const character = (f: ReturnType<typeof checksFixture>) => writeFileSync(join(f.projectDir, 'kratos-personaje.json'),
  JSON.stringify({mesh: '/Game/Esquina/Kratos/SKM_Kratos', animations: ['/Game/Esquina/Combate/AM_Golpe']}));

test('Esquina J1.2: montajes sin personaje no exigen animation; sin Decisión y la puerta pasa', async () => {
  const f = checksFixture({area: 'animacion', files: [montage]});
  try {
    process.env.KRATOS_FAKE = 'ok';
    const result = await f.run();
    assert.equal(result.passed, true);
    assert.equal(result.advanced, true);
    assert.deepEqual(listDecisions(f.db, 'open'), []);
    assert.deepEqual(rows(f), [['none', 'skipped']]);
    assert.match(f.events('test.skipped').at(-1)!.summary, /animation no aplica: no hay personaje montado ni malla con clips en el diff/);
    assert.equal(getTask(f.db, f.task.id)!.state, 'integrando');
  } finally { f.close(); }
});

test('con otras comprobaciones, animation que no aplica queda dicha en el resumen del lote', async () => {
  const f = checksFixture({area: 'animacion', files: [montage, 'Content/Blueprints/BP_Kratos.uasset']});
  try {
    process.env.KRATOS_FAKE = 'ok';
    const result = await f.run();
    assert.equal(result.advanced, true);
    assert.deepEqual(rows(f), [['blueprint', 'passed']]);
    const run = filtered<Run>(f.db, 'runs', {taskId: f.task.id}).find(r => r.provider === 'unreal')!;
    assert.match(run.summary!, /animation no aplica/);
  } finally { f.close(); }
});

test('con kratos-personaje.json en el árbol, animation sigue exigida aunque el diff solo traiga el montaje', async () => {
  const f = checksFixture({area: 'animacion', files: [montage], deps: {ffmpeg: () => ff}});
  try {
    process.env.KRATOS_FAKE = 'ok';
    character(f);
    assert.equal((await f.run()).passed, true, JSON.stringify(f.events('test.failed')));
    assert.deepEqual(rows(f), [['animation', 'passed']]);
  } finally { f.close(); }
});

test('animation que sí aplica pero no se puede ejecutar sigue abriendo la Decisión', async () => {
  const f = checksFixture({area: 'animacion', files: [montage], engine: false});
  try {
    character(f);
    assert.equal((await f.run()).deferred, true);
    assert.deepEqual(rows(f), [['animation', 'unavailable']]);
    assert.deepEqual(listDecisions(f.db, 'open').map(d => d.reason), ['Comprobación no disponible: animation']);
  } finally { f.close(); }
});
