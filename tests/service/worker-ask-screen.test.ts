import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fixture } from './worker-fixture.ts';
import { listEvents } from '../../service/src/store.ts';

test('ASK ya contestado que sigue en pantalla no vuelve a marcar espera',async t=>{
  // Observado en la aceptación del hito 3: tras responder, cada frame nuevo reactivaba waiting.
  const f=fixture(t);await f.start();const run=f.run();
  const screen=(...lines:string[])=>writeFileSync(f.file,JSON.stringify({...f.state(),screen:lines}));
  const ask='• KRATOS_ASK {"question":"¿Puedo empezar?"}';
  screen(ask);await f.invoke('worker.poll',{runId:run.id});await f.invoke('worker.poll',{runId:run.id});
  assert.equal(f.run().metadata.waiting,true);assert.equal(f.run().metadata.question,'¿Puedo empezar?');
  screen(ask,'› CONTINUAR','• Trabajando en ammo.mjs');await f.invoke('worker.poll',{runId:run.id});
  assert.equal(f.run().metadata.waiting,false);
  screen(ask,'› CONTINUAR','• Trabajando en ammo.mjs','• Pruebas en verde');await f.invoke('worker.poll',{runId:run.id});
  assert.equal(f.run().metadata.waiting,false);
  assert.equal(listEvents(f.db,0).filter(e=>e.type==='worker.waiting').length,1);
  screen('• KRATOS_ASK {"question":"¿Otra duda?"}');await f.invoke('worker.poll',{runId:run.id});
  assert.equal(f.run().metadata.question,'¿Otra duda?');
});
