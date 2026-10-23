import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fixture } from './orca-fixture.ts';

test('readiness Claude exige su marcador, incluso con satisfied y Ask Codex históricos',async t=>{
  const f=fixture(t,{FAKE_ORCA_SATISFIED:'1'});
  writeFileSync(f.file,JSON.stringify({repos:[],tail:['› Ask Codex']}));
  assert.equal(await f.orca.terminalWaitIdle('term_fake',350,/bypass permissions|Try "/i),false);
  writeFileSync(f.file,JSON.stringify({repos:[],tail:[],screen:['Try "edit file"']}));
  assert.equal(await f.orca.terminalWaitIdle('term_fake',1000,/bypass permissions|Try "/i),true);
});
for(const timeout of [false,true]) test(`readiness Claude relee tras wait timeout=${timeout}`,async t=>{
  const f=fixture(t,{FAKE_ORCA_MODE:'claude',FAKE_ORCA_READY_AFTER_WAIT:'1',...(timeout ? {FAKE_ORCA_WAIT_TIMEOUT:'1'} : {})});
  assert.equal(await f.orca.terminalWaitIdle('term_fake',2000,/bypass permissions|Try "/i),true);
  assert.deepEqual(f.calls.map(e=>e.command[1]),['read','wait','read']);
});
