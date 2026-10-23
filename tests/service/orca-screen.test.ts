import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fixture } from './orca-fixture.ts';

test('terminalRead conserva fuente y flags de pantalla sin confundir snapshot con cursor stream',async t=>{
  const {orca,file,calls}=fixture(t);
  writeFileSync(file,JSON.stringify({repos:[],tail:['inicial','ready'],screen:['• pantalla actual'],screenTruncated:true}));
  const stream=await orca.terminalRead('term_fake','2');
  assert.equal(stream.source,'stream');assert.equal(stream.text,'');assert.equal(stream.cursor,'2');
  const screen=await orca.terminalRead('term_fake');
  assert.deepEqual(screen,{text:'• pantalla actual',cursor:'2',source:'screen',truncated:true,limited:false});
  assert.equal(calls[0].command.includes('--cursor'),true);assert.equal(calls[1].command.includes('--cursor'),false);
});

test('snapshot pide máximo 50 líneas e informa recorte sin inventar avance del cursor',async t=>{
  const {orca,file}=fixture(t);
  writeFileSync(file,JSON.stringify({repos:[],tail:[],screen:Array.from({length:60},(_,i)=>`línea ${i}`)}));
  const page=await orca.terminalRead('term_fake');
  assert.equal(page.source,'screen');assert.equal(page.limited,true);assert.equal(page.cursor,'0');
  assert.equal(page.text.split('\n').length,50);assert.equal(page.text.split('\n')[0],'línea 10');
});
