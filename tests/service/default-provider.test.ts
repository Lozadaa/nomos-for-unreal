import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { concurrency, readConfig, roleModel, opencodeModel } from '../../service/src/config.ts';
import { launchCommand } from '../../service/src/handlers/worker-launch.ts';
import { chooseProvider } from '../../service/src/scheduler-provider.ts';
import { removeDir } from '../remove-dir.ts';

const idle={codex:0,claude:0,opencode:0};
test('Claude es el proveedor por defecto; Codex apagado salvo que config.json lo habilite',()=>{
  assert.deepEqual(concurrency({}),{codex:0,claude:2,opencode:0,revisor:1});
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
  const dir=mkdtempSync(join(tmpdir(),'nomos-default-'));t.after(()=>removeDir(dir));
  writeFileSync(join(dir,'config.json'),'{"defaultProvider":"codex"}');assert.equal(readConfig(dir).defaultProvider,'codex');
  writeFileSync(join(dir,'config.json'),'{"defaultProvider":"otro"}');assert.throws(()=>readConfig(dir),/invalid_worker_config/);
});
test('readConfig valida workerModel y models; un modelo por rol',t=>{
  const dir=mkdtempSync(join(tmpdir(),'nomos-model-'));t.after(()=>removeDir(dir));
  const cmd=(role:string,qa=false)=>launchCommand('claude',roleModel(readConfig(dir),role,qa));
  assert.equal(cmd('implementacion'),'claude --model opus --dangerously-skip-permissions');
  assert.equal(cmd('gameplay'),'claude --model opus --dangerously-skip-permissions','un rol de juego es implementación');
  for(const role of ['revisor','integrador','animacion']) assert.equal(roleModel({},role),'sonnet',role);
  assert.equal(cmd('revisor',true),'claude --model sonnet --dangerously-skip-permissions');
  for(const model of ['sonnet','opus','haiku']) {
    writeFileSync(join(dir,'config.json'),JSON.stringify({workerModel:model}));
    assert.equal(roleModel(readConfig(dir),'implementacion'),model);assert.equal(roleModel(readConfig(dir),'revisor'),'sonnet');
  }
  writeFileSync(join(dir,'config.json'),JSON.stringify({workerModel:'haiku',models:{implementacion:'sonnet',revisor:'opus',qa:'haiku'}}));
  assert.equal(cmd('implementacion'),'claude --model sonnet --dangerously-skip-permissions');
  assert.equal(cmd('revisor'),'claude --model opus --dangerously-skip-permissions');
  assert.equal(cmd('revisor',true),'claude --model haiku --dangerously-skip-permissions');
  for(const bad of ['"gpt"','""','1','null','["opus"]']) {
    writeFileSync(join(dir,'config.json'),`{"workerModel":${bad}}`);assert.throws(()=>readConfig(dir),/invalid_worker_config/,bad);
  }
  for(const bad of ['{"revisor":"gpt"}','{"otro":"opus"}','[]','"opus"']) {
    writeFileSync(join(dir,'config.json'),`{"models":${bad}}`);assert.throws(()=>readConfig(dir),/invalid_worker_config/,bad);
  }
});

test('una tarea asignada a un proveedor apagado dice cuál y cómo encenderlo, no «sin proveedor»', () => {
  assert.deepEqual(chooseProvider('implementacion', {}, idle, undefined, 'codex'),
    {reason: 'Codex apagado: dale cupo en config.json'});
  assert.deepEqual(chooseProvider('implementacion', {concurrency: {codex: 0, claude: 0}}, idle),
    {reason: 'Sin proveedor habilitado'});
});
test('readConfig valida opencodeModel; beam-free gratuito por defecto, nunca el modelo del usuario',t=>{
  const dir=mkdtempSync(join(tmpdir(),'nomos-opencode-model-'));t.after(()=>removeDir(dir));
  assert.equal(opencodeModel(readConfig(dir)),'opencode/beam-free');
  for(const model of ['opencode/deepseek-v4.1-flash-free','opencode-go/claude-haiku-5-5']) {
    writeFileSync(join(dir,'config.json'),JSON.stringify({opencodeModel:model}));assert.equal(opencodeModel(readConfig(dir)),model);
  }
  for(const bad of ['"sonnet"','"openai/gpt-5"','"opencode/"','"opencode/a b"','"opencode/x\\" & del"','1','null']) {
    writeFileSync(join(dir,'config.json'),`{"opencodeModel":${bad}}`);assert.throws(()=>readConfig(dir),/invalid_worker_config/,bad);
  }
});

test('OpenCode solo entra si la tarea lo pide y hay cupo; nunca por defecto',()=>{
  const on={concurrency:{claude:1,opencode:1}};
  assert.deepEqual(chooseProvider('implementacion',on,idle,undefined,'opencode'),{provider:'opencode',reason:'Disponible'});
  assert.equal(chooseProvider('implementacion',on,idle).provider,'claude','sin pedirlo no se elige');
  assert.equal(chooseProvider('implementacion',{...on,defaultProvider:'opencode'},idle).provider,'claude','defaultProvider no lo activa');
  assert.equal(chooseProvider('implementacion',{concurrency:{claude:0,opencode:3}},idle).provider,undefined);
  assert.deepEqual(chooseProvider('implementacion',on,{...idle,opencode:1},undefined,'opencode'),{reason:'Sin hueco en opencode'});
});
test('OpenCode sin cupo dice cómo encenderlo',()=>{
  for(const config of [{},{concurrency:{claude:2,opencode:0}}])
    assert.deepEqual(chooseProvider('implementacion',config,idle,undefined,'opencode'),{reason:'OpenCode apagado: dale cupo en config.json'});
});
test('OpenCode nunca hace arte, UI ni QA aunque la tarea lo pida',()=>{
  for(const role of ['arte','ui','qa'])
    assert.deepEqual(chooseProvider(role,{concurrency:{claude:1,opencode:2}},idle,undefined,'opencode'),
      {reason:'OpenCode no hace arte, UI ni QA: asígnala a Claude'});
});
test('el revisor de OpenCode es siempre Claude; OpenCode nunca revisa',()=>{
  const all={concurrency:{codex:2,claude:1,opencode:2}};
  assert.deepEqual(chooseProvider('revisor',all,idle,'opencode'),{provider:'claude',reason:'Disponible',sameProvider:false});
  assert.deepEqual(chooseProvider('revisor',all,{...idle,claude:1},'opencode'),{reason:'El revisor de OpenCode es Claude: sin hueco en claude'});
  assert.deepEqual(chooseProvider('revisor',{concurrency:{claude:0,opencode:2}},idle,'opencode'),
    {reason:'El revisor de OpenCode es Claude: dale cupo a claude en config.json'});
  assert.equal(chooseProvider('revisor',{concurrency:{claude:0,opencode:2}},idle,'claude').provider,undefined,'OpenCode no revisa a Claude');
  assert.equal(chooseProvider('revisor',all,{...idle,claude:1},'claude').provider,'codex');
});
