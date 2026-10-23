import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fixture } from './orca-fixture.ts';

for(const operation of ['idle','readiness'] as const) test(`${operation} propaga aborto local con procedencia y una sola llamada`,async t=>{
  const {orca,calls}=fixture(t,{FAKE_ORCA_HANG:'1'},{timeoutMs:100});
  await assert.rejects(operation==='idle' ? orca.terminalIsIdle('term_fake') : orca.terminalWaitIdle('term_fake',1000),
    (e:any)=>e.code==='timeout' && e.source==='process');
  assert.equal(calls.length,1);assert.equal(calls[0].error,'timeout');assert.equal(calls[0].errorSource,'process');
});

test('lista truncada no demuestra terminal único y no repite create',async t=>{
  const {orca,calls,file}=fixture(t,{FAKE_ORCA_NO_STARTUP:'1'});
  writeFileSync(file,JSON.stringify({repos:[],tail:[],terminalsTruncated:true}));
  await assert.rejects(orca.worktreeCreate('repo-1','worker','codex'),/truncada/);
  assert.deepEqual(calls.map(e=>e.command.slice(0,2)),[['worktree','create'],['terminal','list']]);
});
