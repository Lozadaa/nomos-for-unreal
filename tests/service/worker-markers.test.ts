import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenMarkers } from '../../service/src/handlers/worker-markers.ts';

const example='• KRATOS_DONE {"summary":"Ejemplo","commits":[],"tests":"passed"}';
const actual='• KRATOS_DONE {"summary":"Real","commits":["abc"],"tests":"passed"}';
const expected=[{kind:'DONE',summary:'Real',commits:['abc'],tests:'passed'}];

test('fence abierto con cuatro backticks no cierra con tres y no acepta DONE del ejemplo',()=>{
  const frame=['````json','```',example];
  assert.deepEqual(screenMarkers(frame),[]);
  assert.deepEqual(screenMarkers([...frame,'`````   ',actual]),expected);
});

test('delimitador con texto posterior no cierra fence y no acepta DONE dentro del código',()=>{
  const frame=['```json','```not-a-closing-fence',example];
  assert.deepEqual(screenMarkers(frame),[]);
  assert.deepEqual(screenMarkers([...frame,'``` \t',actual]),expected);
});
