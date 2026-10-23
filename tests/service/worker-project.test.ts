import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fixture } from './worker-fixture.ts';

test('Git válido sin uproject en raíz falla antes de Orca y de crear run',async t=>{
  const f=fixture(t);
  try {unlinkSync(join(f.projectDir,'Game.uproject'));} catch {}
  await assert.rejects(f.start(),/invalid_unreal_project/);
  assert.equal(f.db.prepare('select count(*) n from runs').get()!.n,0);
  assert.deepEqual(f.state().repos,[]);
});

test('el propio repositorio Kratos se rechaza antes de efectos incluso siendo Git válido',async t=>{
  const f=fixture(t);f.ctx.projectDir=resolve(import.meta.dirname,'../..');
  await assert.rejects(f.start(),/invalid_kratos_project/);
  assert.equal(f.db.prepare('select count(*) n from runs').get()!.n,0);
  assert.deepEqual(f.state().repos,[]);
});
