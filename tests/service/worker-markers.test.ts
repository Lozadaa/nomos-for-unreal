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

test('Claude real (hito 7): el terminal parte la línea tras KRATOS_REVIEW y el JSON sigue en las líneas sangradas', () => {
  const screen = [
    '⏺ Revisión del HUD terminada.',
    '  Hallazgo menor. El HUD queda dentro del margen seguro de TV, que es el 5 % por lado.',
    '  KRATOS_REVIEW',
    '  {"approved":true,"findings":[{"file":".kratos-review/ui-1280x720.png","line":1,"severity":"menor","note":"Sin',
    '  ui-direction.md, revisado contra criterios mínimos. Corrección: anclar el HUD con padding del 5 %."}]}',
    '✻ Cogitated for 31s · done 7:30 PM',
  ];
  const found = screenMarkers(screen);
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'REVIEW');
  assert.equal((found[0] as {approved: boolean}).approved, true);
  assert.match((found[0] as {findings: {note: string}[]}).findings[0].note, /Sin ui-direction\.md/);
  assert.deepEqual(screenMarkers(['⏺ Listo.', '  KRATOS_DONE', '  {"summary":"Hecho","commits":["a1"],"tests":"passed"}']),
    [{kind: 'DONE', summary: 'Hecho', commits: ['a1'], tests: 'passed'}]);
  assert.deepEqual(screenMarkers(['⏺ Pregunta.', '  KRATOS_REVIEW', '  sin json']).map(m => m.kind), ['INVALID_REVIEW']);
});

test('Claude real (hito 7): mensaje largo cuya viñeta ya salió del frame; el DONE sangrado se lee igual', () => {
  const screen = [
    '    Config/Windows/WindowsEngine.ini, que sí está versionado. Arranqué el juego',
    '  - La raqueta: no se puede versionar sin esos assets.',
    '  Quedan sin seguir Build/ y los dos archivos locales.',
    '  KRATOS_DONE {"summary":"Archivos locales (DefaultEngine.ini y Content/Fab',
    '  raqueta) sacados del indice.","commits":["58f477a"],"tests":"passed"}',
    '✻ Cogitated for 2m 44s · done 8:55 PM',
    '❯',
  ];
  assert.deepEqual(screenMarkers(screen), [{kind: 'DONE', summary: 'Archivos locales (DefaultEngine.ini y Content/Fab raqueta) sacados del indice.', commits: ['58f477a'], tests: 'passed'}]);
  // la salida de herramienta sigue fuera aunque tampoco se vea su cabecera
  assert.deepEqual(screenMarkers(['  ⎿  KRATOS_DONE {"summary":"x","commits":[],"tests":"none"}']), []);
});
