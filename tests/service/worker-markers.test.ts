import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenMarkers, streamMarkers } from '../../service/src/handlers/worker-markers.ts';

const example='• NOMOS_DONE {"summary":"Ejemplo","commits":[],"tests":"passed"}';
const actual='• NOMOS_DONE {"summary":"Real","commits":["abc"],"tests":"passed"}';
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
    '• NOMOS_SKILLS ["ue-project-context"]','  El brief exige esta confirmación','  antes de escribir código. No he modificado archivos.',
    '  NOMOS_ASK {"question":"¿Puedo empezar? Responde CONTINUAR_HITO3_A"}','• Hook failed','  └ hook exited with code 1'];
  assert.deepEqual(screenMarkers(frame),[{kind:'SKILLS',skills:['ue-project-context']},
    {kind:'ASK',question:'¿Puedo empezar? Responde CONTINUAR_HITO3_A'}]);
  assert.deepEqual(screenMarkers(['• Resumen','  NOMOS_DONE {"summary":"Real","commits":[],"tests":"passed"}']),
    [{kind:'DONE',summary:'Real',commits:[],tests:'passed'}]);
  for(const head of [['• Ran cat .nomos-brief.md','  └ Plantilla'],['› Lee el brief'],[]])
    assert.deepEqual(screenMarkers([...head,'  NOMOS_DONE {"summary":"Falso","commits":[],"tests":"none"}']),[]);
});

test('Claude real (hito 5): NOMOS_DONE sangrado tras una lista con continuaciones de cuatro espacios',()=>{
  const lines=['⏺ Hecho. Resumen:','  - Paleta: 9 tokens (fondo #12141C, texto #F4F1E8). Los 16 pares texto/fondo e',
    '    icono/fondo llevan el contraste medido con la fórmula WCAG.','  - Skill no cargada: game-ui-ux no existe en este entorno.',
    '  NOMOS_DONE {"summary":"docs/ui-direction.md con las ocho secciones, contrastes medidos (mín. 5,0:1), tamaños',
    '  1080p/720p y barra de vida del HUD; provisional porque este worktree no trae',
    '  Content/","commits":["b242d513ab59fe1edda47cace61cd0302b48d9b3"],"tests":"passed"}','✻ Cogitated for 51s · done 4:17 PM'];
  const [marker]=screenMarkers(lines);
  assert.equal(marker?.kind,'DONE');
  assert.deepEqual((marker as any).commits,['b242d513ab59fe1edda47cace61cd0302b48d9b3']);
  assert.match((marker as any).summary,/no trae Content\/$/);
});

test('Claude real (hito 7): el terminal parte la línea tras NOMOS_REVIEW y el JSON sigue en las líneas sangradas', () => {
  const screen = [
    '⏺ Revisión del HUD terminada.',
    '  Hallazgo menor. El HUD queda dentro del margen seguro de TV, que es el 5 % por lado.',
    '  NOMOS_REVIEW',
    '  {"approved":true,"findings":[{"file":".nomos-review/ui-1280x720.png","line":1,"severity":"menor","note":"Sin',
    '  ui-direction.md, revisado contra criterios mínimos. Corrección: anclar el HUD con padding del 5 %."}]}',
    '✻ Cogitated for 31s · done 7:30 PM',
  ];
  const found = screenMarkers(screen);
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'REVIEW');
  assert.equal((found[0] as {approved: boolean}).approved, true);
  assert.match((found[0] as {findings: {note: string}[]}).findings[0].note, /Sin ui-direction\.md/);
  assert.deepEqual(screenMarkers(['⏺ Listo.', '  NOMOS_DONE', '  {"summary":"Hecho","commits":["a1"],"tests":"passed"}']),
    [{kind: 'DONE', summary: 'Hecho', commits: ['a1'], tests: 'passed'}]);
  assert.deepEqual(screenMarkers(['⏺ Pregunta.', '  NOMOS_REVIEW', '  sin json']).map(m => m.kind), ['INVALID_REVIEW']);
});

test('Claude real (hito 7): mensaje largo cuya viñeta ya salió del frame; el DONE sangrado se lee igual', () => {
  const screen = [
    '    Config/Windows/WindowsEngine.ini, que sí está versionado. Arranqué el juego',
    '  - La raqueta: no se puede versionar sin esos assets.',
    '  Quedan sin seguir Build/ y los dos archivos locales.',
    '  NOMOS_DONE {"summary":"Archivos locales (DefaultEngine.ini y Content/Fab',
    '  raqueta) sacados del indice.","commits":["58f477a"],"tests":"passed"}',
    '✻ Cogitated for 2m 44s · done 8:55 PM',
    '❯',
  ];
  assert.deepEqual(screenMarkers(screen), [{kind: 'DONE', summary: 'Archivos locales (DefaultEngine.ini y Content/Fab raqueta) sacados del indice.', commits: ['58f477a'], tests: 'passed'}]);
  // la salida de herramienta sigue fuera aunque tampoco se vea su cabecera
  assert.deepEqual(screenMarkers(['  ⎿  NOMOS_DONE {"summary":"x","commits":[],"tests":"none"}']), []);
});

test('hito 5b: NOMOS_REVIEW partido a mitad de clave por llenar el ancho del terminal se lee entero', () => {
  const rule = '─'.repeat(60);
  const head = '● NOMOS_REVIEW {"approved":false,"findings":[{"file":"A.uasset","line":1,"sev';
  const frame = [rule.slice(0, head.length), head, '  erity":"high","note":"Borra MM_Attack_01 y AM_ComboAttack lo', '  referencia."}]}', rule.slice(0, head.length)];
  assert.deepEqual(screenMarkers(frame), [{kind: 'REVIEW', approved: false,
    findings: [{file: 'A.uasset', line: 1, severity: 'high', note: 'Borra MM_Attack_01 y AM_ComboAttack lo referencia.'}]}]);
});

test('hito 26: el estado a la derecha de Claude Code («No changes this session») no rompe NOMOS_SKILLS ni se traga el NOMOS_DONE de debajo', () => {
  // pantalla real del ensayo del hito 26 (Claude Code 2.1.312, KratosFabTest)
  const frame = [
    "● NOMOS_SKILLS [\"ue-project-context\",\"ue-cpp-foundations\",\"ue-gameplay-framework\",\"ue-module-build-system\"]                                                                               No changes this session",
    "  Añadí UE_LOG(LogTemp, Log, TEXT(\"KratosRaqueta: lista para jugar\")) en AKratosRaqueta::BeginPlay, justo después de Super::BeginPlay(). El commit",
    "  aee691a toca solo KratosRaqueta.cpp, con una línea nueva. No compilé ni abrí Unreal, así que no pedí turno.",
    "  Como prueba usé un grep del texto del log: antes del cambio daba 0 coincidencias y después da 1. Con una sola línea de log no había una prueba de",
    "  Unreal razonable.",
    "  NOMOS_DONE {\"summary\":\"La raqueta escribe «KratosRaqueta: lista para jugar» en el log al empezar la",
    "  partida.\",\"commits\":[\"aee691a\"],\"tests\":\"none\",\"focus\":\"Abre el juego y busca «KratosRaqueta: lista para jugar» en el Output Log, justo al empezar.",
    "  Debe salir una sola vez por cada raqueta en el nivel, antes del mensaje de malla cargada.\"}",
    "✻ Worked for 42s · done 12:09 PM"
  ];
  assert.deepEqual(screenMarkers(frame), [
    {kind: 'SKILLS', skills: ['ue-project-context', 'ue-cpp-foundations', 'ue-gameplay-framework', 'ue-module-build-system']},
    {kind: 'DONE', summary: 'La raqueta escribe «KratosRaqueta: lista para jugar» en el log al empezar la partida.', commits: ['aee691a'], tests: 'none'}]);
});

// jam 2026-11-10 (5.ª vuelta de las metras): un NOMOS_REVIEW dentro de un bloque de código no se leyó en 31 min
const fenced=(line:string)=>['```',line,'```'];
test('jam: la marca al principio de línea dentro de un bloque de código cuenta (pantalla y flujo)',()=>{
  const review='NOMOS_REVIEW {"approved":true,"findings":[]}';
  const done='NOMOS_DONE {"summary":"Brasa que se lanza","commits":["abc"],"tests":"passed"}';
  for(const [line,kind] of [[review,'REVIEW'],[done,'DONE']]) {
    assert.deepEqual(screenMarkers(fenced(line)).map(m=>m.kind),[kind]);
    assert.deepEqual(streamMarkers(fenced(line),'').found.map(m=>m.kind),[kind]);
  }
});
test('jam: los ejemplos literales de los briefs dentro de un bloque no cuentan',()=>{
  for(const line of ['NOMOS_DONE {"summary":"Resumen","commits":[],"tests":"passed"}','NOMOS_ASK {"question":"Tu pregunta"}',
    'NOMOS_ASK {"question":"Pregunta concreta"}',
    'NOMOS_REVIEW {"approved":false,"findings":[{"file":"Docs/README.md","line":3,"severity":"error","note":"El README no dice cómo arrancar el juego; se esperaba el paso a paso"}]}']) {
    assert.deepEqual(screenMarkers(fenced(line)),[],line);
    assert.deepEqual(streamMarkers(fenced(line),'').found,[],line);
  }
});
