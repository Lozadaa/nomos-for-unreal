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

test('Claude real (hito 5): KRATOS_DONE sangrado tras una lista con continuaciones de cuatro espacios',()=>{
  const lines=['⏺ Hecho. Resumen:','  - Paleta: 9 tokens (fondo #12141C, texto #F4F1E8). Los 16 pares texto/fondo e',
    '    icono/fondo llevan el contraste medido con la fórmula WCAG.','  - Skill no cargada: game-ui-ux no existe en este entorno.',
    '  KRATOS_DONE {"summary":"docs/ui-direction.md con las ocho secciones, contrastes medidos (mín. 5,0:1), tamaños',
    '  1080p/720p y barra de vida del HUD; provisional porque este worktree no trae',
    '  Content/","commits":["b242d513ab59fe1edda47cace61cd0302b48d9b3"],"tests":"passed"}','✻ Cogitated for 51s · done 4:17 PM'];
  const [marker]=screenMarkers(lines);
  assert.equal(marker?.kind,'DONE');
  assert.deepEqual((marker as any).commits,['b242d513ab59fe1edda47cace61cd0302b48d9b3']);
  assert.match((marker as any).summary,/no trae Content\/$/);
});
