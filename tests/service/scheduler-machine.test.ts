import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../service/src/db.ts';
import { createTask, requireTask } from '../../service/src/repo/tasks.ts';
import { startRun, finishRun } from '../../service/src/repo/runs.ts';
import { plan, tick, machineWaits } from '../../service/src/scheduler.ts';
import { isHeavy, noteWarm, requestTurn, releaseTurn, turnIdleMs, warmToClose } from '../../service/src/unreal-turn.ts';
import { withEditor } from '../../service/src/editor/queue.ts';
import { listEvents } from '../../service/src/store.ts';
import type { Machine } from '../../service/src/machine.ts';
import { removeDir } from '../remove-dir.ts';

// Hito 22: el PC aguanta un Unreal pesado a la vez y pide 6 GB libres para abrirlo.
const config = {concurrency: {claude: 3}};
function setup(t: any) {
  const dir = mkdtempSync(join(tmpdir(), 'nomos-ram-')), dataDir = join(dir, '.nomos');
  writeFileSync(join(dir, 'Juego.uproject'), '{}');
  const db = openDb(join(dir, 'nomos.db'));
  t.after(() => { db.close(); removeDir(dir); });
  const machine: Machine = {freeGb: 20, editors: 0};
  const probe = () => ({...machine});
  const task = (title: string, area: string, extra: object = {}) =>
    createTask(db, {title, area: area as any, state: 'preparada', spec: 'x', acceptance: ['y'], scope: ['Docs'], ...extra});
  const working = (title: string, area: string, extra: object = {}) => {
    const t = createTask(db, {title, area: area as any, state: 'implementando', ...extra});
    return startRun(db, {taskId: t.id, role: 'implementacion', provider: 'claude', sessionRef: `term_${title}`});
  };
  return {db, dir, dataDir, machine, probe, task, working};
}
const of = (decisions: ReturnType<typeof plan>, id: string) => decisions.find(d => d.taskId === id)!;

test('pesada o ligera: se declara en la spec o se infiere del área y del alcance', () => {
  const base = {spec: 'x', scope: ['Docs'], leases: []} as any;
  assert.equal(isHeavy({...base, area: 'animacion'}), true);
  assert.equal(isHeavy({...base, area: 'gameplay'}), false);
  assert.equal(isHeavy({...base, area: 'gameplay', scope: ['Content/Maps/L_Gym.umap']}), true);
  assert.equal(isHeavy({...base, area: 'gameplay', scope: ['Build']}), true);
  assert.equal(isHeavy({...base, area: 'animacion', spec: '## Qué\nCarga: ligera\n'}), false);
  assert.equal(isHeavy({...base, area: 'gameplay', spec: 'Carga: pesada'}), true);
});

test('con 4 GB libres no arranca la pesada pero sí la ligera; el motivo se avisa una vez', t => {
  const f = setup(t); f.machine.freeGb = 4.1;
  const heavy = f.task('J2.2 Callejón', 'animacion'), light = f.task('J2.5 HUD', 'gameplay');
  const decisions = plan(f.db, config, f.probe);
  assert.deepEqual([of(decisions, heavy.id).action, of(decisions, heavy.id).reason], ['wait', '4,1 GB libres, hacen falta 6']);
  assert.equal(of(decisions, light.id).action, 'start');
  tick(f.db, config, {probe: f.probe} as any);
  tick(f.db, config, {probe: f.probe} as any);
  const waits = listEvents(f.db, 0).filter(e => e.type === 'scheduler.waiting');
  assert.deepEqual(waits.map(e => e.payload), [{taskId: heavy.id, reason: '4,1 GB libres, hacen falta 6'}]);
  assert.deepEqual(machineWaits(f.db), ['J2.2 espera: 4,1 GB libres, hacen falta 6']);
  assert.equal(requireTask(f.db, heavy.id).waitReason, '4,1 GB libres, hacen falta 6');
  f.machine.freeGb = 9;
  tick(f.db, config, {probe: f.probe} as any);
  assert.equal(f.db.prepare("select count(*) n from commands where type='worker.start'").get()!.n, 2);
  assert.deepEqual(machineWaits(f.db), []);
});

test('con un UnrealEditor ajeno vivo no arranca otra pesada; con una pesada en marcha tampoco, y al liberarse sí', t => {
  const f = setup(t); f.machine.editors = 1;
  const heavy = f.task('J2.2 Callejón', 'escenarios');
  assert.equal(of(plan(f.db, config, f.probe), heavy.id).reason, 'Espera a que se cierre el Unreal abierto fuera de Nomos');
  const anim = f.working('J-ANIM Animaciones', 'animacion');
  assert.equal(of(plan(f.db, config, f.probe), heavy.id).reason, 'Espera a que J-ANIM suelte Unreal');
  assert.deepEqual(machineWaits(f.db), []);
  tick(f.db, config, {probe: f.probe} as any);
  assert.deepEqual(machineWaits(f.db), ['J2.2 espera a que J-ANIM suelte Unreal']);
  finishRun(f.db, anim.id, 'done', 'NOMOS_DONE'); f.machine.editors = 0;
  assert.equal(of(plan(f.db, config, f.probe), heavy.id).action, 'start');
});

test('dos pesadas preparadas con cupo para tres: arranca solo la de más prioridad', t => {
  const f = setup(t);
  const low = f.task('J2.3 Muelle', 'animacion'), high = f.task('J2.4 Plaza', 'animacion', {priority: 5});
  const decisions = plan(f.db, config, f.probe);
  assert.equal(of(decisions, high.id).action, 'start');
  assert.equal(of(decisions, low.id).reason, 'Espera a que J2.4 suelte Unreal');
});

test('turn --wait: el turno llega en orden de prioridad y --release lo pasa al siguiente', t => {
  const f = setup(t);
  const a = f.working('J1.1 Ligera', 'gameplay'), b = f.working('J1.2 Urgente', 'gameplay', {priority: 9});
  const holder = f.working('J1.3 Primera', 'gameplay');
  assert.deepEqual(requestTurn(f.db, f.dataDir, holder.taskId, f.probe), {granted: true});
  assert.deepEqual(requestTurn(f.db, f.dataDir, a.taskId, f.probe), {granted: false, reason: 'Espera a que J1.3 suelte Unreal'});
  assert.equal(requestTurn(f.db, f.dataDir, b.taskId, f.probe).granted, false);
  releaseTurn(f.db, f.dataDir, holder.taskId);
  assert.deepEqual(requestTurn(f.db, f.dataDir, a.taskId, f.probe), {granted: false, reason: 'Turno: antes va J1.2'});
  assert.deepEqual(requestTurn(f.db, f.dataDir, b.taskId, f.probe), {granted: true});
  const granted = listEvents(f.db, 0).filter(e => e.type === 'editor.granted').map(e => (e.payload as any).taskId);
  assert.deepEqual(granted, [holder.taskId, b.taskId]);
  // con el turno de un worker, las comprobaciones de Nomos esperan su editor
  const check = startRun(f.db, {taskId: a.taskId, role: 'qa', provider: 'unreal'});
  return withEditor({db: f.db, dataDir: f.dataDir, probe: f.probe} as any, {dir: f.dir, uproject: 'Juego.uproject', name: 'Juego'}, check, async () => 'no')
    .then(result => assert.deepEqual(result, {deferred: true, reason: 'Editor de Juego: ocupado por implementacion · claude'}));
});

test('las comprobaciones con editor esperan RAM aunque el editor esté libre', async t => {
  const f = setup(t); f.machine.freeGb = 3;
  const task = f.task('J5.1 Calzado', 'gameplay');
  const check = startRun(f.db, {taskId: task.id, role: 'qa', provider: 'unreal'});
  const result = await withEditor({db: f.db, dataDir: f.dataDir, probe: f.probe} as any, {dir: f.dir, uproject: 'Juego.uproject', name: 'Juego'}, check, async () => 'no');
  assert.deepEqual(result, {deferred: true, reason: '3 GB libres, hacen falta 6'});
});

test('config: scheduler.heavy.maxConcurrent, minFreeRamGb y heavyRequiresNoEditor se validan y tienen valores por defecto', async t => {
  const {readConfig, heavyMax, minFreeRamGb, heavyRequiresNoEditor} = await import('../../service/src/config.ts');
  const f = setup(t); const { mkdirSync } = await import('node:fs'); mkdirSync(f.dataDir, {recursive: true});
  const write = (value: object) => writeFileSync(join(f.dataDir, 'config.json'), JSON.stringify(value));
  write({}); const none = readConfig(f.dataDir);
  assert.deepEqual([heavyMax(none), minFreeRamGb(none), heavyRequiresNoEditor(none)], [1, 6, true]);
  write({scheduler: {heavy: {maxConcurrent: 2}, minFreeRamGb: 8, heavyRequiresNoEditor: false}});
  const set = readConfig(f.dataDir);
  assert.deepEqual([heavyMax(set), minFreeRamGb(set), heavyRequiresNoEditor(set)], [2, 8, false]);
  for (const bad of [{scheduler: {heavy: {maxConcurrent: 0}}}, {scheduler: {minFreeRamGb: '6'}}, {scheduler: {otra: 1}}, {scheduler: {heavyRequiresNoEditor: 1}}]) {
    write(bad); assert.throws(() => readConfig(f.dataDir), /invalid_worker_config/, JSON.stringify(bad));
  }
});

test('x10: un turno retenido a mano sin ningún Unreal abierto se libera a los turnIdleMs; con editor o UBT, no', t => {
  const f = setup(t);
  const holder = f.working('J1.3 Primera', 'gameplay'), other = f.working('J1.4 Otra', 'gameplay');
  assert.deepEqual(requestTurn(f.db, f.dataDir, holder.taskId, f.probe, 0), {granted: true});
  assert.deepEqual(requestTurn(f.db, f.dataDir, holder.taskId, f.probe, 1), {granted: true, held: true}, 'ya era suyo');
  f.machine.editors = 1;
  assert.equal(requestTurn(f.db, f.dataDir, other.taskId, f.probe, 1000).granted, false);
  assert.equal(requestTurn(f.db, f.dataDir, other.taskId, f.probe, 1000 + turnIdleMs).granted, false, 'con el editor abierto lo sigue teniendo');
  f.machine.editors = 0; f.machine.tools = 1;
  assert.equal(requestTurn(f.db, f.dataDir, other.taskId, f.probe, 2000 + turnIdleMs).granted, false, 'compilando con UBT, tampoco');
  f.machine.tools = 0;
  const t0 = 3000 + turnIdleMs;
  assert.equal(requestTurn(f.db, f.dataDir, other.taskId, f.probe, t0).granted, false);
  assert.equal(requestTurn(f.db, f.dataDir, other.taskId, f.probe, t0 + turnIdleMs - 1).granted, false);
  assert.deepEqual(requestTurn(f.db, f.dataDir, other.taskId, f.probe, t0 + turnIdleMs), {granted: true});
  const freed = listEvents(f.db, 0).find(e => e.type === 'editor.released')!;
  assert.deepEqual([(freed.payload as any).taskId, (freed.payload as any).motivo], [holder.taskId, 'inactivo']);
  // los calientes que quedaron abiertos al soltar el turno se cierran una vez, salvo el de quien lo recibe
  noteWarm(f.db, 'C:/a/A.uproject', holder.taskId); noteWarm(f.db, 'C:/b/B.uproject', other.taskId);
  assert.deepEqual(warmToClose(f.db, 'c:/B/b.uproject'), ['c:/a/a.uproject']);
  assert.deepEqual(warmToClose(f.db), ['c:/b/b.uproject']);
  assert.deepEqual(warmToClose(f.db), []);
});

// canario PiedraPapel 2026-11-08: la tarea que soltó el turno con su editor caliente abierto lo recupera aunque falte RAM
test('x10: con su propio editor caliente abierto, el turno no exige RAM libre ni cierra «el Unreal ajeno»', (t) => {
  const f = setup(t), run = f.working('J9.1', 'escenarios');
  f.machine.freeGb = 2; f.machine.editors = 1;
  assert.equal(requestTurn(f.db, f.dataDir, run.taskId, f.probe).granted, false, 'sin caliente suyo, falta RAM');
  noteWarm(f.db, 'C:/wt/Juego.uproject', run.taskId);
  assert.deepEqual(requestTurn(f.db, f.dataDir, run.taskId, f.probe), {granted: true});
  releaseTurn(f.db, f.dataDir, run.taskId);
  const otra = f.working('J9.2', 'escenarios');
  assert.equal(requestTurn(f.db, f.dataDir, otra.taskId, f.probe).granted, false, 'el caliente de otra tarea no le sirve');
});

test('turnos paralelos: con heavy.maxConcurrent 2 dos workers abren Unreal a la vez y el tercero espera', async t => {
  const f = setup(t); const { mkdirSync } = await import('node:fs'); mkdirSync(f.dataDir, {recursive: true});
  writeFileSync(join(f.dataDir, 'config.json'), JSON.stringify({scheduler: {heavy: {maxConcurrent: 2}}}));
  const a = f.working('J1.1 Uno', 'gameplay'), b = f.working('J1.2 Dos', 'gameplay'), c = f.working('J1.3 Tres', 'gameplay');
  assert.deepEqual(requestTurn(f.db, f.dataDir, a.taskId, f.probe), {granted: true});
  assert.deepEqual(requestTurn(f.db, f.dataDir, b.taskId, f.probe), {granted: true});
  assert.deepEqual(requestTurn(f.db, f.dataDir, b.taskId, f.probe), {granted: true, held: true});
  assert.deepEqual(requestTurn(f.db, f.dataDir, c.taskId, f.probe), {granted: false, reason: 'Espera a que J1.1 suelte Unreal'});
  assert.deepEqual(releaseTurn(f.db, f.dataDir, b.taskId), {released: true});
  assert.deepEqual(requestTurn(f.db, f.dataDir, c.taskId, f.probe), {granted: true});
  // la comprobación toma la plaza que queda libre al soltar
  releaseTurn(f.db, f.dataDir, a.taskId);
  const check = startRun(f.db, {taskId: a.taskId, role: 'qa', provider: 'unreal'});
  const result = await withEditor({db: f.db, dataDir: f.dataDir, probe: f.probe} as any, {dir: f.dir, uproject: 'Juego.uproject', name: 'Juego'}, check, async () => 'sí');
  assert.equal(result, 'sí');
});
