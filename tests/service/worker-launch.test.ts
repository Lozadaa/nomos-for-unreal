import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchCommand, readyPattern, permissionPrompt, launchPlan, followUp, opencodeMissing } from '../../service/src/handlers/worker-launch.ts';
import { screenMarkers } from '../../service/src/handlers/worker-markers.ts';

test('comandos y readiness conservan contratos separados por proveedor',()=>{
  assert.equal(launchCommand('codex'),'codex --yolo --no-daemon -c model_reasoning_effort=medium');
  assert.equal(launchCommand('claude'),'claude --model sonnet --dangerously-skip-permissions');
  for(const model of ['sonnet','opus','haiku'] as const) {
    assert.equal(launchCommand('claude',model),`claude --model ${model} --dangerously-skip-permissions`);
    assert.equal(launchCommand('codex',model),'codex --yolo --no-daemon -c model_reasoning_effort=medium','el modelo solo afecta a Claude');
  }
  assert.ok(readyPattern('codex').test('› Ask Codex'));
  for(const line of ['bypass permissions on','Try "edit file"']) assert.ok(readyPattern('claude').test(line));
  assert.equal(readyPattern('claude').test('› Ask Codex'),false);
  assert.equal(readyPattern('codex').test('bypass permissions'),false);
  for(const fn of [launchCommand,readyPattern]) assert.throws(()=>fn('otro'),/invalid_worker_provider/);
});
const brief='Lee el archivo .nomos-brief.md de esta carpeta y ejecuta lo que dice.';
test('OpenCode lleva el brief en el comando con modelo explícito y título corto, sin comillas para Orca',()=>{
  const plan=launchPlan('opencode','opencode/beam-free','abcd1234');
  assert.equal(plan.command,`opencode run --auto --model opencode/beam-free --title nomos-abcd1234 ${brief}`);
  assert.equal(plan.briefInCommand,true);assert.doesNotMatch(plan.command,/["'()]/,'terminalSend rechaza comillas y paréntesis');
  const claude=launchPlan('claude','opus','abcd1234');
  assert.equal(claude.command,'claude --model opus --dangerously-skip-permissions');
  assert.equal(claude.briefInCommand,false);assert.ok(claude.ready.test('bypass permissions on'));
  assert.equal(launchPlan('codex','sonnet','abcd1234').briefInCommand,false);
  for(const bad of ['sonnet','gpt-5.3-codex','opencode/','openai/gpt-5','opencode/x" & del *','opencode/a b'])
    assert.throws(()=>launchPlan('opencode',bad,'abcd1234'),/invalid_opencode_model/,bad);
  assert.equal(launchPlan('opencode','opencode-go/deepseek-v4.1-flash','abcd1234').briefInCommand,true);
});
test('OpenCode ausente del PATH se reconoce en cmd y en shells POSIX',()=>{
  for(const line of ["'opencode' is not recognized as an internal or external command,",
    "\"opencode\" no se reconoce como un comando interno o externo,","bash: opencode: command not found"])
    assert.ok(opencodeMissing(line),line);
  for(const line of ['opencode run --auto --model opencode/beam-free','NOMOS_DONE {}',"'opencodezz' is not recognized"])
    assert.equal(opencodeMissing(line),false,line);
});
test('seguimiento: OpenCode continúa su sesión con run; Claude y Codex reciben la línea tal cual',()=>{
  const line='Lee el archivo .nomos-inbox/abc.md y ejecuta lo que dice.';
  assert.equal(followUp('opencode','opencode/beam-free',line),`opencode run --continue --auto --model opencode/beam-free ${line}`);
  assert.equal(followUp('claude','sonnet',line),line);assert.equal(followUp('codex',undefined,line),line);
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
    assert.deepEqual(screenMarkers([prefix+'NOMOS_DONE {"summary":"Listo",','  ⎿ "commits":[],"tests":"passed"}']),
      [{kind:'DONE',summary:'Listo',commits:[],tests:'passed'}]);
    assert.deepEqual(screenMarkers(['```',prefix+'NOMOS_ASK {"question":"Falso"}','```']),[]);
  }
  for(const prefix of ['› ','> ','❯ ','  ','⎿ ','- '])
    assert.deepEqual(screenMarkers([prefix+'NOMOS_DONE {"summary":"Falso","commits":[],"tests":"none"}']),[]);
});
