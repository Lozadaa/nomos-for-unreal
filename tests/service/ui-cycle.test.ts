import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locatedPath } from '../../service/src/data-paths.ts';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { filtered } from '../../service/src/repo/rows.ts';
import { getTask, requireTask } from '../../service/src/repo/tasks.ts';
import { addArtifact, listArtifacts, recordTestRun } from '../../service/src/repo/artifacts.ts';
import { checkGate } from '../../service/src/checks/gate.ts';
import type { Command, TestRun } from '../../service/src/model.ts';
import { checksFixture } from './checks-fixture.ts';
import { reviewFixture } from './review-fixture.ts';

const payloadOf = (c: Command) => JSON.parse(c.payload as unknown as string);

test('captura sin UI: umg failed «la captura no contiene la UI», vuelve al implementador y no hay QA', async () => {
  const f = checksFixture({files: ['Source/Juego/JuegoVidaWidget.cpp']});
  try {
    process.env.NOMOS_FAKE = 'noui';
    const result = await f.handlers['ui.cycle']({id: 'c1', type: 'ui.cycle', payload: {taskId: f.task.id}, idempotencyKey: 'c1'} as any, f.ctx) as any;
    assert.equal(result.passed, false);
    const [row] = filtered<TestRun>(f.db, 'test_runs', {taskId: f.task.id});
    assert.deepEqual([row.checkId, row.result], ['umg', 'failed']);
    assert.match(f.events('test.failed')[0].summary, /la captura no contiene la UI/);
    const [send] = filtered<Command>(f.db, 'commands', {type: 'worker.send'});
    assert.equal(payloadOf(send).runId, f.implementer.id);
    assert.equal(filtered<Command>(f.db, 'commands', {type: 'review.start'}).length, 0);
  } finally { f.close(); }
});

test('con UI: dos resoluciones → dos capturas con procedencia, umg running y review.start de QA con Claude', async () => {
  const f = checksFixture({files: ['Source/Juego/JuegoVidaWidget.cpp']});
  try {
    process.env.NOMOS_FAKE = 'ok';
    const result = await f.handlers['ui.cycle']({id: 'c2', type: 'ui.cycle', payload: {taskId: f.task.id}, idempotencyKey: 'c2'} as any, f.ctx) as any;
    const shots = listArtifacts(f.db, {taskId: f.task.id, kind: 'screenshot'});
    assert.deepEqual(shots.map(s => (s.provenance as any).resolution), ['1280x720', '1920x1080']);
    for (const shot of shots) {
      const p = shot.provenance as any;
      assert.ok(existsSync(locatedPath(join(f.dataDir, 'artifacts'), shot.path)) && existsSync(p.control));
      assert.equal(p.map, '/Game/Maps/Nivel1');
      assert.equal(p.widget, 'WBP_Vida_C');
      assert.ok(p.diffRatio >= 0.005);
    }
    const [row] = filtered<TestRun>(f.db, 'test_runs', {taskId: f.task.id});
    assert.deepEqual([row.result, row.config], ['running', '1280x720, 1920x1080']);
    const [review] = filtered<Command>(f.db, 'commands', {type: 'review.start'});
    assert.deepEqual(payloadOf(review), {taskId: f.task.id, implementerRunId: f.implementer.id, provider: 'claude', qa: {testRunId: result.testRunId}});
    assert.equal(checkGate(f.db, f.task.id).ok, false, 'sin veredicto de QA no se integra');
  } finally { f.close(); }
});

test('NOMOS_DONE de un worker ui encola ui.cycle con clave por run y corrección; otras áreas no', async t => {
  const {fixture} = await import('./worker-fixture.ts');
  const {uiCycleKey} = await import('../../service/src/handlers/ui-cycle.ts');
  for (const area of ['ui', 'qa']) {
    const f = fixture(t);
    f.db.prepare('update tasks set area=? where id=?').run(area, f.task.id);
    await f.start();
    f.output('NOMOS_DONE {"summary":"HUD listo","commits":[],"tests":"passed"}');
    await f.invoke('worker.poll', {runId: f.run().id});
    const cycles = filtered<Command>(f.db, 'commands', {type: 'ui.cycle'});
    assert.deepEqual(cycles.map(c => [payloadOf(c), c.idempotencyKey]),
      area === 'ui' ? [[{taskId: f.task.id, runId: f.run().id}, uiCycleKey(f.run())]] : []);
  }
});

async function qaReview(t: any, verdict: string, before?: (f: any) => void) {
  const f = await reviewFixture(t);
  const test = recordTestRun(f.db, {taskId: f.task.id, runId: f.implementer.id, checkId: 'umg', result: 'running', commit: 'abc'});
  const dir = join(f.dataDir, 'artifacts', 'tests', test.id); mkdirSync(dir, {recursive: true});
  writeFileSync(join(dir, 'ui-1280x720.png'), 'png'); writeFileSync(join(dir, 'ui-1280x720-control.png'), 'png');
  writeFileSync(join(dir, 'ui-1280x720.png.json'), '{"camara":{}}');
  addArtifact(f.db, {taskId: f.task.id, runId: f.implementer.id, kind: 'screenshot', path: join(dir, 'ui-1280x720.png'),
    provenance: {testRunId: test.id, resolution: '1280x720', map: '/Game/Maps/Nivel1', control: join(dir, 'ui-1280x720-control.png')}});
  writeFileSync(join(dir, 'ui-1280x720-estado1-cargando.png'), 'png'); writeFileSync(join(dir, 'ui-1280x720-estado1-cargando-control.png'), 'png');
  addArtifact(f.db, {taskId: f.task.id, runId: f.implementer.id, kind: 'screenshot', path: join(dir, 'ui-1280x720-estado1-cargando.png'),
    provenance: {testRunId: test.id, resolution: '1280x720', estado: 'cargando', map: '/Game/Maps/Nivel1', control: join(dir, 'ui-1280x720-estado1-cargando-control.png')}});
  const state = f.state(); state.treePath = join(f.dir, 'qa-tree'); state.terminalHandle = 'term_qa'; state.tail = [];
  writeFileSync(f.file, JSON.stringify(state));
  await f.invoke('review.start', {taskId: f.task.id, implementerRunId: f.implementer.id, provider: 'claude', qa: {testRunId: test.id}});
  const brief = readFileSync(join(f.reviewTree().path, '.nomos-brief.md'), 'utf8');
  assert.match(brief, /QA visual/);
  assert.match(brief, /\.nomos-review\/ui-1280x720\.png` · estado \*\*arranque\*\* · 1280x720 · mapa \/Game\/Maps\/Nivel1/);
  // cada estado de `## Estados` llega etiquetado y con su control
  assert.match(brief, /\.nomos-review\/ui-1280x720-estado1-cargando\.png` · estado \*\*cargando\*\* · 1280x720 · .*control `\.nomos-review\/ui-1280x720-estado1-cargando-control\.png`/);
  assert.match(brief, /nombra el estado/);
  assert.ok(existsSync(join(f.reviewTree().path, '.nomos-review', 'ui-1280x720-control.png')));
  // la escena de la captura viaja con ella y el brief la nombra
  assert.ok(existsSync(join(f.reviewTree().path, '.nomos-review', 'ui-1280x720.png.json')));
  assert.match(brief, /escena `\.nomos-review\/ui-1280x720\.png\.json`/);
  assert.ok(f.reviewer().skills.includes('ue-visual-qa'));
  assert.deepEqual(f.reviewer().metadata.qa, {testRunId: test.id});
  before?.(f);
  f.output(verdict); await f.poll();
  return {f, test};
}

test('QA aprobado: TestRun umg passed sin marcar aprobada la revisión de código', async t => {
  const {f, test: row} = await qaReview(t, 'NOMOS_REVIEW {"approved":true,"findings":[]}');
  assert.equal(filtered<TestRun>(f.db, 'test_runs', {id: row.id})[0].result, 'passed');
  assert.equal(requireTask(f.db, f.task.id).reviewApproved, 0);
  assert.equal(f.reviewer().state, 'done');
});

test('QA rechazado: umg failed y los hallazgos vuelven al mismo implementador', async t => {
  const {f, test: row} = await qaReview(t,
    'NOMOS_REVIEW {"approved":false,"findings":[{"file":"WBP_Vida","line":1,"severity":"bloqueante","note":"1280×720: contraste 2,1:1 sobre el cielo"}]}');
  assert.equal(filtered<TestRun>(f.db, 'test_runs', {id: row.id})[0].result, 'failed');
  const send = filtered<Command>(f.db, 'commands', {type: 'worker.send'}).at(-1)!;
  assert.equal(payloadOf(send).runId, f.implementer.id);
  assert.match(payloadOf(send).text, /Correcciones de QA visual:\nWBP_Vida:1 \[bloqueante\] 1280×720: contraste 2,1:1/);
  assert.equal(getTask(f.db, f.task.id)!.state, 'implementando');
});

test('diff sin cambios de Unreal (p. ej. solo docs/ui-direction.md): ui.cycle no captura ni encola QA', async () => {
  const f = checksFixture({files: ['docs/ui-direction.md']});
  try {
    process.env.NOMOS_FAKE = 'ok';
    const result = await f.handlers['ui.cycle']({id: 'c3', type: 'ui.cycle', payload: {taskId: f.task.id}, idempotencyKey: 'c3'} as any, f.ctx) as any;
    assert.deepEqual(result, {skipped: 'el diff no toca Unreal'});
    assert.equal(filtered<TestRun>(f.db, 'test_runs', {taskId: f.task.id}).length, 0);
    assert.equal(filtered<Command>(f.db, 'commands', {type: 'review.start'}).length, 0);
  } finally { f.close(); }
});

test('hito 7: QA aprobado en revisando encola la revisión de código aunque ya hubo una del primer ciclo (misma run)', async t => {
  const {f} = await qaReview(t, 'NOMOS_REVIEW {"approved":true,"findings":[]}');
  const reviews = filtered<Command>(f.db, 'commands', {type: 'review.start'}).filter(c => !payloadOf(c).qa);
  assert.deepEqual(reviews.map(c => payloadOf(c)), [{taskId: f.task.id, implementerRunId: f.implementer.id}]);
  assert.equal(reviews[0].idempotencyKey, `review.after-qa:${f.reviewer().id}`);
});

// docs/x10/umg-bucles.md: resúmenes reales de Herbalist (35 umg fallidas)
test('umgFindings: regla, zona, medido y esperado de cada fallo real de umg', async () => {
  const {umgFindings} = await import('../../service/src/checks/umg.ts');
  assert.deepEqual(umgFindings('1280×720: la captura no contiene la UI (difiere un 0,01 % de la captura sin widgets)\nWidgets en el viewport: HerbInspectionWidget, WB_InteractPrompt_C')
    .map(f => [f.rule, f.where, f.measured, f.expected]),
    [['UI visible', '1280×720 · widgets HerbInspectionWidget, WB_InteractPrompt_C', '0,01 %', '≥ 0,5 %']]);
  assert.deepEqual(umgFindings('umg-ui-1280x720: la captura difiere un 46,07 % de la línea base (tolerancia 35 %)\n1280×720: UI visible (53,0 % de píxeles), widgets HerbCareIcon\nCapturas listas: esperando el QA visual')
    .map(f => [f.rule, f.where, f.measured, f.expected]), [['línea base', 'umg-ui-1280x720', '46,07 %', '≤ 35 %']]);
  assert.deepEqual(umgFindings('docs/produccion/evidencia/UI3-2/piezas-iconos.png:1 [mayor] 1080p, fila detectado: iconos danger dan 2,03:1 (<3)')
    .map(f => [f.rule, f.where, f.weight]), [['QA mayor', 'docs/produccion/evidencia/UI3-2/piezas-iconos.png:1', 2]]);
  assert.deepEqual(umgFindings('Tiempo máximo agotado: se cerró el editor').map(f => f.rule), ['comprobación']);
});

test('compareUmg: el mismo valor (94,74 → 94,73 %) sigue igual; acercarse a la tolerancia o quitar hallazgos es mejora', async () => {
  const {umgFindings, compareUmg} = await import('../../service/src/checks/umg.ts');
  const base = (a: string, b: string, t = '40') => umgFindings(`umg-ui-1280x720: la captura difiere un ${a} % de la línea base (tolerancia ${t} %)\numg-ui-1920x1080: la captura difiere un ${b} % de la línea base (tolerancia ${t} %)`);
  const same = compareUmg(base('94,74', '94,7'), base('94,73', '94,73'));
  assert.equal(same.improved, false);
  assert.match(same.lines.join('\n'), /Sigue igual: línea base · umg-ui-1280x720 \(94,74 % → 94,73 %, se espera ≤ 40 %\)/);
  assert.equal(compareUmg(base('46,07', '48,44', '35'), base('43,92', '49,37', '35')).improved, false, 'el ruido de la captura no es mejora');
  const better = compareUmg(base('60', '61'), base('45', '61'));
  assert.equal(better.improved, true);
  assert.match(better.lines.join('\n'), /Mejora: línea base · umg-ui-1280x720 \(60 % → 45 %/);
  const qa = (...notes: string[]) => umgFindings(notes.map(n => `.nomos-review/ui-1280x720.png:1 [mayor] ${n}`).join('\n'));
  const fewer = compareUmg(qa('falta la pausa', 'contraste 2,1:1'), qa('contraste 2,9:1'));
  assert.equal(fewer.improved, true);
  assert.match(fewer.lines.join('\n'), /Resuelto: QA mayor · ui-1280x720\.png:1/);
  assert.equal(compareUmg(qa('falta la hoja de las cinco piezas'), qa('sigue faltando la hoja de piezas')).improved, false);
});

test('ui.cycle fallido: el worker recibe el diagnóstico corto (regla, zona, medido frente a esperado) y la comparación con el intento anterior', async () => {
  const f = checksFixture({files: ['Source/Juego/JuegoVidaWidget.cpp']});
  try {
    process.env.NOMOS_FAKE = 'noui';
    const cycle = (id: string) => f.handlers['ui.cycle']({id, type: 'ui.cycle', payload: {taskId: f.task.id}, idempotencyKey: id} as any, f.ctx);
    await cycle('u1');
    const first = payloadOf(filtered<Command>(f.db, 'commands', {type: 'worker.send'}).at(-1)!).text;
    assert.match(first, /Diagnóstico umg \(intento 1\)/);
    assert.match(first, /UI visible · 1280×720 · widgets ninguno: mide 0(,0+)? % · se espera ≥ 0,5 %/);
    assert.doesNotMatch(first, /Frente al intento anterior/);
    writeFileSync(join(f.projectDir, 'Source/Juego/JuegoVidaWidget.cpp'), '// otro intento');
    await cycle('u2');
    const second = payloadOf(filtered<Command>(f.db, 'commands', {type: 'worker.send'}).at(-1)!).text;
    assert.match(second, /Diagnóstico umg \(intento 2, 2 seguidos sin mejora\)/);
    assert.match(second, /Frente al intento anterior:\n- Sigue igual: UI visible · 1280×720/);
    assert.ok(second.length < 1500, 'texto corto, sin volcar el log');
  } finally { f.close(); }
});

test('tope: tras 3 fallos umg seguidos sin mejora no hay otra vuelta; Decisión con el resumen de los intentos y «Devolver» reinicia el contador', async () => {
  const {listDecisions, resolveDecision} = await import('../../service/src/repo/decisions.ts');
  const f = checksFixture({files: ['Source/Juego/JuegoVidaWidget.cpp']});
  try {
    process.env.NOMOS_FAKE = 'noui';
    const cycle = (id: string) => f.handlers['ui.cycle']({id, type: 'ui.cycle', payload: {taskId: f.task.id}, idempotencyKey: id} as any, f.ctx) as Promise<any>;
    const sends = () => filtered<Command>(f.db, 'commands', {type: 'worker.send'});
    for (const [i, id] of ['t1', 't2', 't3'].entries()) {
      writeFileSync(join(f.projectDir, 'Source/Juego/JuegoVidaWidget.cpp'), `// intento ${i}`);
      const result = await cycle(id);
      if (id !== 't3') assert.equal(result.passed, false);
      else assert.deepEqual([result.deferred, result.reason], [true, 'Esperando decisión: QA de UI sin mejora medible']);
    }
    assert.equal(sends().length, 2, 'el tercer intento sin mejora no vuelve al worker');
    const [decision] = listDecisions(f.db, 'open');
    assert.equal(decision.reason, 'QA de UI sin mejora medible');
    assert.deepEqual(decision.evidence[0], {kind: 'command', ref: 't3'});
    assert.deepEqual(decision.evidence.slice(1).map(e => e.kind), ['intento 1', 'intento 2', 'intento 3']);
    assert.match(decision.evidence[3].ref, /UI visible · 1280×720 · widgets ninguno: 0,00 %/);
    assert.deepEqual(decision.options.map(o => o.id), ['return', 'retry']);
    assert.equal(requireTask(f.db, f.task.id).decisionId, decision.id);
    assert.equal((await cycle('t3')).deferred, true, 'mientras nadie decide, la orden espera');
    resolveDecision(f.db, decision.id, 'return', 'director');
    assert.deepEqual(await cycle('t3'), {returned: true});
    assert.equal(sends().length, 3);
    assert.match(payloadOf(sends().at(-1)!).text, /Diagnóstico umg \(intento 3, 3 seguidos sin mejora\)/);
    writeFileSync(join(f.projectDir, 'Source/Juego/JuegoVidaWidget.cpp'), '// intento 4');
    assert.equal((await cycle('t4')).passed, false);
    assert.match(payloadOf(sends().at(-1)!).text, /Diagnóstico umg \(intento 4\):/, 'la decisión reinicia el contador');
  } finally { f.close(); }
});

test('tope en el QA visual: el tercer rechazo sin mejora abre la Decisión con un ui.cycle en espera y no reenvía al worker', async t => {
  const {umgAttempt} = await import('../../service/src/checks/umg.ts');
  const {listDecisions} = await import('../../service/src/repo/decisions.ts');
  const note = '{"file":".nomos-review/ui-1280x720.png","line":1,"severity":"mayor","note":"falta la hoja de las cinco piezas"}';
  const seed = (f: any) => { for (const id of ['a', 'b']) umgAttempt(f.db, f.task.id, id, '.nomos-review/ui-1280x720.png:1 [mayor] falta la hoja de las piezas'); };
  const {f} = await qaReview(t, `NOMOS_REVIEW {"approved":false,"findings":[${note}]}`, seed);
  const [decision] = listDecisions(f.db, 'open');
  assert.equal(decision.reason, 'QA de UI sin mejora medible');
  const [cycle] = filtered<Command>(f.db, 'commands', {type: 'ui.cycle'});
  assert.deepEqual(decision.evidence[0], {kind: 'command', ref: cycle.id});
  assert.equal(filtered<Command>(f.db, 'commands', {type: 'worker.send'}).filter(c => /QA visual/.test(payloadOf(c).text)).length, 0);
});

test('limits.umgRetries configura el tope (3 por defecto)', async () => {
  const {limits} = await import('../../service/src/config.ts');
  assert.equal(limits({}).umgRetries, 3);
  assert.equal(limits({limits: {umgRetries: 5}}).umgRetries, 5);
});

test('caché: con los mismos archivos que un intento fallido no se relanza Unreal; el fallo se recuerda y cuenta sin mejora', async () => {
  const f = checksFixture({files: ['Source/Juego/JuegoVidaWidget.cpp']});
  try {
    const cycle = (id: string) => f.handlers['ui.cycle']({id, type: 'ui.cycle', payload: {taskId: f.task.id}, idempotencyKey: id} as any, f.ctx) as Promise<any>;
    const launches = () => f.events('test.running').length;
    writeFileSync(join(f.dataDir, 'config.json'), JSON.stringify({limits: {umgRetries: 10}})); // aquí no se mide el tope
    process.env.NOMOS_FAKE = 'noui';
    const first = await cycle('k1');
    assert.equal(launches(), 1);
    const again = await cycle('k2');
    assert.deepEqual([again.passed, again.cached, launches()], [false, first.testRunId, 1], 'misma entrada → mismo resultado, sin Unreal');
    const text = payloadOf(filtered<Command>(f.db, 'commands', {type: 'worker.send'}).at(-1)!).text;
    assert.match(text, /Mismos archivos que el intento 1: no se relanzó Unreal/);
    assert.match(text, /intento 2, 2 seguidos sin mejora/);
    assert.equal(filtered<TestRun>(f.db, 'test_runs', {id: again.testRunId})[0].result, 'failed');
    writeFileSync(join(f.projectDir, 'Source/Juego/JuegoVidaWidget.cpp'), '// cambio');
    await cycle('k3');
    assert.equal(launches(), 2, 'otro contenido sí se prueba');
    process.env.NOMOS_FAKE = 'fail';
    writeFileSync(join(f.projectDir, 'Source/Juego/JuegoVidaWidget.cpp'), '// otro');
    await cycle('k4'); await cycle('k5');
    assert.equal(launches(), 4, 'un juego que no dejó capturas no se cachea: puede ser pasajero');
  } finally { f.close(); }
});

const specEstados = (estados: string) => `## Qué\nHUD de la partida.\n## Por qué\nSe juega.\n## Criterios de aceptación\n1. Se ve\n## Alcance\n- Source\n## No tocar\n- nada\n## Estados\n${estados}`;

test('## Estados: una sesión por resolución captura cada estado (todos a 1280×720, el primero a 1920×1080) con captureCvars + los del estado', async () => {
  const f = checksFixture({files: ['Source/Juego/JuegoVidaWidget.cpp']});
  try {
    process.env.NOMOS_FAKE = 'ok';
    writeFileSync(join(f.dataDir, 'config.json'), JSON.stringify({checks: {captureCvars: ['Juego.CamaraFija 1']}}));
    f.db.prepare('update tasks set spec=? where id=?').run(specEstados('- apuntando: Metras.Estado 0\n- cargando fuerza: Metras.Estado 1; Metras.Fuerza 0.6\n- fin de partida: Metras.Fin 1\n'), f.task.id);
    await f.handlers['ui.cycle']({id: 'c9', type: 'ui.cycle', payload: {taskId: f.task.id}, idempotencyKey: 'c9'} as any, f.ctx);
    const shots = listArtifacts(f.db, {taskId: f.task.id, kind: 'screenshot'}).map(s => s.provenance as any);
    assert.deepEqual(shots.map(p => [p.check, p.resolution, p.estado ?? null]), [['umg', '1280x720', null], ['umg', '1280x720', 'apuntando'],
      ['umg', '1280x720', 'cargando fuerza'], ['umg', '1280x720', 'fin de partida'], ['umg', '1920x1080', null], ['umg', '1920x1080', 'apuntando']]);
    assert.deepEqual(shots[2].comandos, ['Juego.CamaraFija 1', 'Metras.Estado 1', 'Metras.Fuerza 0.6']);
    assert.ok(shots.every(p => existsSync(p.control) && p.diffRatio >= 0.005));
    const [row] = filtered<TestRun>(f.db, 'test_runs', {taskId: f.task.id});
    assert.deepEqual([row.result, row.config], ['running', '1280x720, 1920x1080 · estados: apuntando, cargando fuerza, fin de partida']);
    assert.equal(filtered<Command>(f.db, 'commands', {type: 'review.start'}).length, 1);
    assert.deepEqual(f.events('approval.requested').map(e => e.baseline), ['umg-ui-1280x720', 'umg-ui-1920x1080'], 'los estados no proponen líneas base');
  } finally { f.close(); }
});

test('## Estados: un estado sin UI falla nombrándolo, los demás siguen medidos y el diagnóstico lo sitúa', async () => {
  const f = checksFixture({files: ['Source/Juego/JuegoVidaWidget.cpp']});
  try {
    process.env.NOMOS_FAKE = 'ok'; process.env.NOMOS_FAKE_ESTADO_SIN_UI = 'turno cpu';
    f.db.prepare('update tasks set spec=? where id=?').run(specEstados('- turno cpu: Metras.Turno 1\n- fin: Metras.Fin 1\n'), f.task.id);
    const result = await f.handlers['ui.cycle']({id: 'c10', type: 'ui.cycle', payload: {taskId: f.task.id}, idempotencyKey: 'c10'} as any, f.ctx) as any;
    assert.equal(result.passed, false);
    const summary = f.events('test.failed')[0].summary;
    assert.match(summary, /^1280×720 · turno cpu: la captura no contiene la UI/m);
    assert.match(summary, /1920×1080 · turno cpu: la captura no contiene la UI/);
    assert.match(summary, /1280×720 · fin: UI visible/);
    const {umgFindings} = await import('../../service/src/checks/umg.ts');
    assert.deepEqual(umgFindings(summary).map(x => [x.rule, x.where]), [['UI visible', '1280×720 · turno cpu'], ['UI visible', '1920×1080 · turno cpu']]);
  } finally { delete process.env.NOMOS_FAKE_ESTADO_SIN_UI; f.close(); }
});

test('## Estados: la spec valida nombre y órdenes como captureCvars (sin comas ni comillas)', async () => {
  const {parseTaskSpec, taskEstados} = await import('../../service/src/task-spec.ts');
  assert.deepEqual(taskEstados(specEstados('- apuntando: `Metras.Estado 0`; Metras.Zoom 1\n')), [{nombre: 'apuntando', comandos: ['Metras.Estado 0', 'Metras.Zoom 1']}]);
  assert.deepEqual(taskEstados(specEstados('').replace('## Estados\n', '')), []);
  assert.throws(() => parseTaskSpec(specEstados('- fin: Metras.Fin 1,2\n')), /estado inválido/);
  assert.throws(() => parseTaskSpec(specEstados('- fin: say "hola"\n')), /estado inválido/);
  assert.throws(() => parseTaskSpec(specEstados('- fin: A 1\n- fin: B 1\n')), /estado repetido/);
});
