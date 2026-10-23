import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { concurrency, readConfig } from '../../service/src/config.ts';
import { chooseProvider } from '../../service/src/scheduler-provider.ts';

const idle={codex:0,claude:0,opencode:0};
test('Claude es el proveedor por defecto; Codex apagado salvo que config.json lo habilite',()=>{
  assert.deepEqual(concurrency({}),{codex:0,claude:2,opencode:0});
  assert.equal(chooseProvider('implementacion',{},idle).provider,'claude');
  assert.equal(chooseProvider('implementacion',{},{...idle,claude:2}).provider,undefined,'sin config nunca usa Codex');
  assert.equal(chooseProvider('implementacion',{concurrency:{claude:2}},{...idle,claude:2}).provider,undefined,'codex:0 nunca usa Codex');
  const both={concurrency:{codex:1,claude:1}};
  assert.equal(chooseProvider('implementacion',both,idle).provider,'claude');
  assert.equal(chooseProvider('implementacion',both,{...idle,claude:1}).provider,'codex');
  assert.equal(chooseProvider('implementacion',{...both,defaultProvider:'codex'},idle).provider,'codex');
  assert.equal(chooseProvider('ui',{...both,defaultProvider:'codex'},idle).provider,'claude');
  assert.deepEqual(chooseProvider('revisor',{concurrency:{claude:2}},idle,'claude'),{provider:'claude',reason:'Disponible',sameProvider:true});
});
test('readConfig valida defaultProvider',t=>{
  const dir=mkdtempSync(join(tmpdir(),'kratos-default-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  writeFileSync(join(dir,'config.json'),'{"defaultProvider":"codex"}');assert.equal(readConfig(dir).defaultProvider,'codex');
  writeFileSync(join(dir,'config.json'),'{"defaultProvider":"otro"}');assert.throws(()=>readConfig(dir),/invalid_worker_config/);
});
