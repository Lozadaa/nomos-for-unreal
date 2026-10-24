import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './worker-fixture.ts';
import { openDb } from '../../service/src/db.ts';
import { createWorkerHandlers } from '../../service/src/handlers/worker.ts';
import { listEvents } from '../../service/src/store.ts';
import { getTask } from '../../service/src/repo/tasks.ts';
import { openDecision, resolveDecision } from '../../service/src/repo/decisions.ts';

const captured=JSON.parse(readFileSync(new URL('../fixtures/orca-screen-final.json',import.meta.url),'utf8'));
const done='NOMOS_DONE {"summary":"Primera versión","commits":["abc"],"tests":"passed"}';
function screen(f: ReturnType<typeof fixture>,lines: string[],extra: object={}) {
  const state=f.state();state.tail=state.tail.slice(0,Number(f.run().metadata.cursor));
  writeFileSync(f.file,JSON.stringify({...state,screen:lines,...extra}));
}
const outputs=(f: ReturnType<typeof fixture>)=>listEvents(f.db,0).filter(e=>e.type==='worker.output');
const poll=(f: ReturnType<typeof fixture>)=>f.invoke('worker.poll',{runId:f.run().id,generation:f.run().metadata.pollGeneration});

test('stream vacío recupera DONE real bullet+JSON en tres líneas desde snapshot y conserva cursor verdadero',async t=>{
  const f=fixture(t);await f.start();const cursor=f.run().metadata.cursor;
  screen(f,captured.tail,{screenTruncated:captured.truncated,screenCursor:'999'});
  await poll(f);
  assert.equal(f.run().state,'done');assert.match(f.run().summary!,/README en español y script creados/);
  assert.equal(f.run().metadata.cursor,cursor);assert.equal(getTask(f.db,f.task.id)!.state,'revisando');
  assert.deepEqual(f.run().metadata.lastLines,captured.tail.slice(-20));
  const output=outputs(f);assert.equal(output.length,1);
  assert.equal(output[0].payload.source,'screen');assert.equal(output[0].payload.snapshot,true);
  assert.equal(output[0].payload.historyComplete,false);assert.equal(output[0].payload.truncated,true);
});

test('ASK de pantalla espera una vez; fingerprint persistido evita duplicar output o retirar espera tras restart',async t=>{
  const f=fixture(t);await f.start();screen(f,['• NOMOS_ASK {"question":"¿Qué', '    color?"}','» Ask Codex']);
  await poll(f);assert.equal(f.run().metadata.waiting,true);assert.equal(f.run().metadata.question,'¿Qué color?');
  const fingerprint=f.run().metadata.screenFingerprint;assert.ok(fingerprint);
  const restarted=openDb(join(f.dataDir,'nomos.db'));
  try {
    f.ctx.db=restarted;Object.assign(f.handlers,createWorkerHandlers());
    await poll(f);await poll(f);
    assert.equal(f.run().metadata.screenFingerprint,fingerprint);assert.equal(f.run().metadata.waiting,true);
    assert.equal(outputs(f).length,1);assert.equal(listEvents(f.db,0).filter(e=>e.type==='worker.waiting').length,1);
  } finally {f.ctx.db=f.db;restarted.close();}
});

for(const origin of ['stream','screen'] as const) test(`DONE observado en ${origin} no termina corrección al reaparecer reenvuelto en pantalla`,async t=>{
  const f=fixture(t);await f.start();const first=f.run();
  if(origin==='stream') f.output(done);else screen(f,['• '+done]);
  await poll(f);assert.equal(f.run().state,'done');
  await f.invoke('worker.send',{runId:first.id,text:'Corrige una cosa'});
  screen(f,['• NOMOS_DONE {"summary":"Primera', '  versión", "commits": ["a b c"],', '  "tests":"passed"}', '› Lee el archivo .nomos-inbox/nuevo.md y ejecuta lo que dice.']);
  await poll(f);assert.equal(f.run().state,'running');assert.equal(f.run().metadata.correctionCount,1);
  screen(f,['Cabecera cambiada','• NOMOS_DONE {"summary":"Primera versión","commits":["abc"],"tests":"passed"}','» Ask Codex']);
  await poll(f);assert.equal(f.run().state,'running');
  screen(f,['• NOMOS_DONE {"summary":"Corregido","commits":["def"],"tests":"passed"}']);
  await poll(f);assert.equal(f.run().state,'done');assert.equal(f.run().summary,'Corregido');
  assert.equal(f.run().id,first.id);assert.equal(f.run().sessionRef,first.sessionRef);assert.equal(f.state().creates,1);
});

test('snapshots son frames independientes y preservan aparte fragmento legacy del stream',async t=>{
  const f=fixture(t);await f.start();
  f.output('NOMOS_DONE {"summary":"Frag');await poll(f);const buffer=f.run().metadata.markerBuffer;
  screen(f,['• Estado visible']);await poll(f);assert.equal(f.run().metadata.markerBuffer,buffer);
  screen(f,['• NOMOS_DONE {"summary":"No concatenar']);await poll(f);
  screen(f,['  frames","commits":[],"tests":"passed"}']);await poll(f);assert.equal(f.run().state,'running');
  f.output('mentado","commits":[],"tests":"none"}');await poll(f);
  assert.equal(f.run().state,'done');assert.equal(f.run().summary,'Fragmentado');
});

test('pantalla no confunde prosa, comandos, citas, fences ni JSON inválido con marcadores',async t=>{
  const f=fixture(t);await f.start();
  const invalid=[['Prosa '+done],['• Ran echo '+done],['> '+done],['"'+done+'"'],['  '+done],
    ['```json','• '+done,'```'],['~~~','• '+done,'~~~'],
    ['````json','```','• '+done],['```json','```not-a-closing-fence','• '+done],
    ['• NOMOS_DONE {"summary":42,"commits":[],"tests":"passed"}'],
    ['• NOMOS_DONE {"summary":"x","commits":[1],"tests":"passed"}'],
    ['• NOMOS_DONE {"summary":"x","commits":[],"tests":"passing"}'],
    ['• '+done+' texto extra'],['• NOMOS_ASK {"question":[]}']];
  for(const lines of invalid) {screen(f,lines);await poll(f);assert.equal(f.run().state,'running',JSON.stringify(lines));}
  assert.equal(listEvents(f.db,0).filter(e=>e.type==='run.finished').length,0);
});

test('cada snapshot emite máximo50 líneas, lastLines refleja pantalla actual y no afirma historial completo',async t=>{
  const f=fixture(t);await f.start();const lines=Array.from({length:70},(_,i)=>`visible ${i}`);
  screen(f,lines,{screenTruncated:true});await poll(f);await poll(f);
  assert.equal(outputs(f).length,1);assert.equal((outputs(f)[0].payload.lines as string[]).length,50);
  assert.equal(outputs(f)[0].payload.limited,true);assert.equal(outputs(f)[0].payload.historyComplete,false);
  assert.deepEqual(f.run().metadata.lastLines,lines.slice(-20));assert.equal(f.run().state,'running');
  screen(f,['Solo pantalla nueva']);await poll(f);assert.deepEqual(f.run().metadata.lastLines,['Solo pantalla nueva']);
});

test('fallback legado de fuente stream no vuelve a entregar tail histórico tras cursor vacío',async t=>{
  const f=fixture(t);await f.start();f.output('Nueva línea stream');await poll(f);
  const count=outputs(f).length;await poll(f);assert.equal(outputs(f).length,count);
});

for(const retained of [true,false]) test(`run done previo al fix conserva oldDONE al reabrir con marcador retenido=${retained}`,async t=>{
  const f=fixture(t);await f.start();f.output(done);await poll(f);assert.equal(f.run().state,'done');
  const metadata={...f.run().metadata};delete metadata.seenDoneMarkers;
  if(!retained) metadata.lastLines=[];
  f.db.prepare('update runs set metadata=? where id=?').run(JSON.stringify(metadata),f.run().id);
  await f.invoke('worker.send',{runId:f.run().id,text:'Corregir versión legacy'});
  screen(f,['• '+done]);await poll(f);assert.equal(f.run().state,'running');
});

test('legacy summary anterior protege oldDONE aunque lastLines solo conserve un marcador más antiguo',async t=>{
  const f=fixture(t);await f.start();f.output(done);await poll(f);
  const metadata={...f.run().metadata};delete metadata.seenDoneMarkers;
  metadata.lastLines=['NOMOS_DONE {"summary":"Anterior distinto","commits":[],"tests":"none"}'];
  f.db.prepare('update runs set metadata=? where id=?').run(JSON.stringify(metadata),f.run().id);
  await f.invoke('worker.send',{runId:f.run().id,text:'Corregir legacy'});
  screen(f,['• '+done]);await poll(f);assert.equal(f.run().state,'running');
});

test('Decisión durante stream vacío evita otro read de pantalla y sigue resoluble',async t=>{
  const f=fixture(t);await f.start();await poll(f);screen(f,['• Pantalla actual']);
  const read=f.ctx.orca.terminalRead;let reads=0;
  f.ctx.orca.terminalRead=async(...args)=>{reads++;const page=await read(...args);
    if(reads===1) openDecision(f.db,{taskId:f.task.id,reason:'Decidir antes de continuar',
      options:[{id:'approve',label:'Seguir',description:'Autorizar'}]});return page;};
  await poll(f);assert.equal(reads,1);
  const task=getTask(f.db,f.task.id)!;assert.ok(task.decisionId);
  assert.equal(resolveDecision(f.db,task.decisionId!,'approve','director').state,'resolved');
});
