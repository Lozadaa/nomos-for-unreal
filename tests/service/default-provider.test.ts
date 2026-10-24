import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { concurrency, readConfig, workerModel } from '../../service/src/config.ts';
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
test('readConfig valida workerModel; sonnet por defecto',t=>{
  const dir=mkdtempSync(join(tmpdir(),'kratos-model-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  assert.equal(workerModel(readConfig(dir)),'sonnet');
  for(const model of ['sonnet','opus','haiku']) {
    writeFileSync(join(dir,'config.json'),JSON.stringify({workerModel:model}));assert.equal(workerModel(readConfig(dir)),model);
  }
  for(const bad of ['"gpt"','""','1','null','["opus"]']) {
    writeFileSync(join(dir,'config.json'),`{"workerModel":${bad}}`);assert.throws(()=>readConfig(dir),/invalid_worker_config/,bad);
  }
});

test('una tarea asignada a un proveedor apagado dice cuál y cómo encenderlo, no «sin proveedor»', () => {
  assert.deepEqual(chooseProvider('implementacion', {}, idle, undefined, 'codex'),
    {reason: 'Codex apagado: dale cupo en config.json'});
  assert.deepEqual(chooseProvider('implementacion', {concurrency: {codex: 0, claude: 0}}, idle),
    {reason: 'Sin proveedor habilitado'});
});
