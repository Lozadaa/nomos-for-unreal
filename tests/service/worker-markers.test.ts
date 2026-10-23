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
test('Codex real: marcador en continuación de un mensaje con viñeta, nunca en salida de herramienta',()=>{
  // Pantalla capturada en la aceptación del hito 3 (KratosFabTest, 2026-10-23).
  const frame=['• Ran if (Test-Path -LiteralPath .agents/ue-project-context.md) { Get-Content …','  └ (no output)',
    '• KRATOS_SKILLS ["ue-project-context"]','  El brief exige esta confirmación','  antes de escribir código. No he modificado archivos.',
    '  KRATOS_ASK {"question":"¿Puedo empezar? Responde CONTINUAR_HITO3_A"}','• Hook failed','  └ hook exited with code 1'];
  assert.deepEqual(screenMarkers(frame),[{kind:'SKILLS',skills:['ue-project-context']},
    {kind:'ASK',question:'¿Puedo empezar? Responde CONTINUAR_HITO3_A'}]);
  assert.deepEqual(screenMarkers(['• Resumen','  KRATOS_DONE {"summary":"Real","commits":[],"tests":"passed"}']),
    [{kind:'DONE',summary:'Real',commits:[],tests:'passed'}]);
  for(const head of [['• Ran cat .kratos-brief.md','  └ Plantilla'],['› Lee el brief'],[]])
    assert.deepEqual(screenMarkers([...head,'  KRATOS_DONE {"summary":"Falso","commits":[],"tests":"none"}']),[]);
});
