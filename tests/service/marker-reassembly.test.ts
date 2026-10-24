import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { screenMarkers, streamMarkers } from '../../service/src/handlers/worker-markers.ts';
import { renderBrief } from '../../service/src/brief.ts';
import { fixture } from './worker-fixture.ts';
import { requireTask } from '../../service/src/repo/tasks.ts';

const summary='Corregidos los 6 hallazgos de la revisión de J1.6, cada uno con su prueba vista en rojo antes: derribo de duración fija, '
  +'guard break con retroceso y hitstop, lanzado sin acabar dentro del que lanza, agarre y KO cortan el deslizamiento; 50/50 y 158,6 fps.';
const done=JSON.stringify({summary,commits:['d3648b8','1ff2cc6','59a5962'],tests:'passed'});
/** Lo que devuelve Orca de una línea larga en un terminal de 80 columnas: filas cortadas a mitad de palabra, sin sangría. */
const wrap=(line:string,width=80)=>line.match(new RegExp(`.{1,${width}}`,'g'))!;
const tail=['  - Documentación: causa.md incluye ahora la tabla.','✻ Crunched for 31m 33s · done 6:44 PM','❯ '];

for(const prefix of ['','● ','  ']) {
  test(`pantalla a 80 columnas: la marca partida se reensambla (prefijo ${JSON.stringify(prefix)})`,()=>{
    const found=screenMarkers(['● Hecho.',...wrap(`${prefix}NOMOS_DONE ${done}`),...tail]);
    assert.deepEqual(found,[{kind:'DONE',summary,commits:['d3648b8','1ff2cc6','59a5962'],tests:'passed'}]);
  });
  test(`stream: la marca partida con prefijo ${JSON.stringify(prefix)} se reensambla, también entre dos lecturas`,()=>{
    const rows=wrap(`${prefix}NOMOS_DONE ${done}`);
    assert.equal(streamMarkers([...rows,...tail],'').found[0]?.kind,'DONE');
    const first=streamMarkers(rows.slice(0,2),'');
    assert.deepEqual(first.found,[]);
    assert.equal((streamMarkers([...rows.slice(2),...tail],first.buffer).found[0] as any)?.summary,summary);
  });
}
test('una marca que no parsea en 40 líneas u 8 KB se abandona sin colgar el sondeo',()=>{
  const rows=['NOMOS_DONE {"summary":"sin cerrar',...Array.from({length:60},(_,i)=>`linea ${i}`),'","commits":[],"tests":"none"}'];
  assert.deepEqual(screenMarkers(rows),[]);
  assert.deepEqual(streamMarkers(rows,'').found,[]);
});
test('el brief enseña las dos formas y recomienda el archivo para JSON largo',async t=>{
  const f=fixture(t);
  const brief=renderBrief(f.task,{provider:'claude',role:'programmer',skills:[]} as any);
  assert.match(brief,/\.nomos-inbox\/done\.json/);assert.match(brief,/\.nomos-inbox\/ask\.json/);assert.match(brief,/NOMOS_DONE \{/);
});
test('canal por archivo: done.json en el worktree termina la run antes que el terminal y se consume',async t=>{
  const f=fixture(t);await f.start();
  const inbox=join(f.tree().path,'.nomos-inbox');mkdirSync(inbox,{recursive:true});
  writeFileSync(join(inbox,'done.json'),JSON.stringify({summary:'Hecho por archivo\ncon dos líneas',commits:['abc'],tests:'passed'},null,2));
  await f.invoke('worker.poll',{runId:f.run().id});
  assert.equal(f.run().state,'done');assert.equal(f.run().summary,'Hecho por archivo\ncon dos líneas');
  assert.equal(requireTask(f.db,f.task.id).state,'revisando');assert.equal(existsSync(join(inbox,'done.json')),false);
});
test('canal por archivo: ask.json deja la run esperando con la pregunta; un JSON a medio escribir espera al siguiente sondeo',async t=>{
  const f=fixture(t);await f.start();
  const inbox=join(f.tree().path,'.nomos-inbox');mkdirSync(inbox,{recursive:true});
  writeFileSync(join(inbox,'ask.json'),'{"question":"¿Uso el');
  await f.invoke('worker.poll',{runId:f.run().id,generation:0});
  assert.notEqual(f.run().metadata.waiting,true);assert.equal(existsSync(join(inbox,'ask.json')),true);
  writeFileSync(join(inbox,'ask.json'),'{"question":"¿Uso el maniquí?"}');
  await f.invoke('worker.poll',{runId:f.run().id,generation:0});
  assert.equal(f.run().metadata.waiting,true);assert.equal(f.run().metadata.question,'¿Uso el maniquí?');
  assert.equal(existsSync(join(inbox,'ask.json')),false);
});
