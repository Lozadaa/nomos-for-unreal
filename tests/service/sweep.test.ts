import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../../service/src/db.ts';
import { createOrca } from '../../service/src/adapters/orca.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { startRun, finishRun } from '../../service/src/repo/runs.ts';
import { requireRun } from '../../service/src/repo/worker.ts';
import { startRunner } from '../../service/src/runner.ts';
import { closeIdleTerminals, sweepTerminals, workerProcesses } from '../../service/src/sweep.ts';
import { removeDir } from '../remove-dir.ts';

function setup(t:any) {
  const dir=mkdtempSync(join(tmpdir(),'nomos-sweep-')),file=join(dir,'orca.json'),db=openDb(join(dir,'nomos.db'));
  writeFileSync(file,JSON.stringify({repos:[],tail:['hola']}));
  const orcaOptions={bin:process.execPath,args:[fileURLToPath(new URL('../fakes/orca.ts',import.meta.url))],env:{FAKE_ORCA_STATE:file}};
  t.after(()=>{db.close();removeDir(dir);});
  const run=(state:string,role:string,taskState:string,ref:string)=>{
    const task=createTask(db,{title:ref,area:'qa',state:taskState as any});
    const r=startRun(db,{taskId:task.id,role,provider:'claude',sessionRef:ref});
    if(state!=='running') finishRun(db,r.id,state as any,'fin');
    return r.id;
  };
  return {db,orca:createOrca(orcaOptions),orcaOptions,run,closed:()=>JSON.parse(readFileSync(file,'utf8')).closed ?? []};
}

test('cierra el terminal de revisores terminados, runs fallidas o canceladas y tareas hechas; conserva lo que aún se lee',async t=>{
  const f=setup(t);
  const keep=[f.run('running','implementacion','implementando','term_vivo'),f.run('done','implementacion','revisando','term_espera_revision')];
  const idle=[f.run('done','revisor','revisando','term_revisor'),f.run('failed','implementacion','preparada','term_fallo'),
    f.run('cancelled','implementacion','preparada','term_cancelado'),f.run('done','implementacion','done','term_hecha')];
  assert.deepEqual((await closeIdleTerminals(f.db,f.orca)).sort(),['term_cancelado','term_fallo','term_hecha','term_revisor']);
  assert.deepEqual(f.closed().sort(),['term_cancelado','term_fallo','term_hecha','term_revisor']);
  for(const id of idle) assert.equal(requireRun(f.db,id).metadata.terminalClosed,true);
  for(const id of keep) assert.equal(requireRun(f.db,id).metadata.terminalClosed,undefined);
  assert.deepEqual(await closeIdleTerminals(f.db,f.orca),[],'lo ya cerrado no se vuelve a tocar');
});
test('el barrido cuenta procesos vivos y avisa si hay más que runs en marcha',async t=>{
  const f=setup(t);f.run('running','implementacion','implementando','term_vivo');
  assert.deepEqual(workerProcesses(f.db),null,'sin barrido todavía no hay cuenta');
  await sweepTerminals(f.db,f.orca);
  assert.deepEqual(workerProcesses(f.db),{alive:1,expected:1,text:'procesos de workers vivos: 1'});
  // un terminal que el servicio cree en marcha pero sigue vivo tras terminar y no se deja cerrar
  const stubborn={...f.orca,terminalClose:async ()=>{}};
  f.run('done','revisor','revisando','term_tozudo');await sweepTerminals(f.db,stubborn);
  const counted=workerProcesses(f.db)!;
  assert.equal(counted.alive,2);assert.equal(counted.expected,1);
  assert.equal(counted.warning,'Hay más procesos de workers vivos (2) que runs en marcha (1)');
});
test('el runner barre al arrancar',async t=>{
  const f=setup(t);f.run('done','revisor','revisando','term_revisor');
  const stop=startRunner(f.db,{},{orcaOptions:f.orcaOptions,intervalMs:20});
  try {
    const end=Date.now()+15_000;
    while(!f.closed().includes('term_revisor')) {
      assert.ok(Date.now()<end,'el barrido inicial no cerró el terminal');await new Promise(r=>setTimeout(r,50));
    }
  } finally {stop();await stop.drained;}
});
test('nomos status lleva la cuenta del último barrido',async t=>{
  const {fixture}=await import('./route-fixture.ts');const f=await fixture();
  try {
    assert.equal((await (await f.request('/status')).json() as any).workers,null);
    const orca={terminalClose:async ()=>{},terminalAlive:async ()=>true} as any;
    const task=createTask(f.db,{title:'x',area:'qa'});startRun(f.db,{taskId:task.id,role:'implementacion',provider:'claude',sessionRef:'t'});
    await sweepTerminals(f.db,orca);
    assert.equal((await (await f.request('/status')).json() as any).workers.text,'procesos de workers vivos: 1');
  } finally {await f.close();}
});
