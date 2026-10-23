import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchCommand, readyPattern, permissionPrompt } from '../../service/src/handlers/worker-launch.ts';
import { screenMarkers } from '../../service/src/handlers/worker-markers.ts';

test('comandos y readiness conservan contratos separados por proveedor',()=>{
  assert.equal(launchCommand('codex'),'codex --yolo --no-daemon');
  assert.equal(launchCommand('claude'),'claude --model sonnet --dangerously-skip-permissions');
  assert.ok(readyPattern('codex').test('› Ask Codex'));
  for(const line of ['bypass permissions on','Try "edit file"']) assert.ok(readyPattern('claude').test(line));
  assert.equal(readyPattern('claude').test('› Ask Codex'),false);
  assert.equal(readyPattern('codex').test('bypass permissions'),false);
  for(const fn of [launchCommand,readyPattern]) {
    assert.throws(()=>fn('opencode'),/unsupported_worker_provider/);
    assert.throws(()=>fn('otro'),/invalid_worker_provider/);
  }
});
test('Claude expone el permiso con la línea intacta y Codex conserva su protocolo',()=>{
  for(const line of ['Do you want to execute this command?','  Allow this action?','Continue (y/n)']) {
    assert.equal(permissionPrompt('claude',['trabajando',line]),line);
    assert.equal(permissionPrompt('codex',[line]),null);
  }
  assert.equal(permissionPrompt('claude',['Allowed previously','Trabajo en curso']),null);
  assert.equal(permissionPrompt('opencode',['Allow']),null);
});
test('pantalla acepta viñetas Claude y continuación acotada, sin prompts ni código',()=>{
  for(const prefix of ['• ','● ','⏺ ']) {
    assert.deepEqual(screenMarkers([prefix+'KRATOS_DONE {"summary":"Listo",','  ⎿ "commits":[],"tests":"passed"}']),
      [{kind:'DONE',summary:'Listo',commits:[],tests:'passed'}]);
    assert.deepEqual(screenMarkers(['```',prefix+'KRATOS_ASK {"question":"Falso"}','```']),[]);
  }
  for(const prefix of ['› ','> ','❯ ','  ','⎿ ','- '])
    assert.deepEqual(screenMarkers([prefix+'KRATOS_DONE {"summary":"Falso","commits":[],"tests":"none"}']),[]);
});
