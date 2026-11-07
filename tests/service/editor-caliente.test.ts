import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { runWarm, stopWarm, warmBeat } from '../../service/src/editor/caliente.ts';

const fake = join(import.meta.dirname, '..', 'fakes', 'unreal-caliente.mjs');
const opts = {bin: process.execPath, baseArgs: [fake], startTimeoutMs: 20_000};
function game() {
  const dir = mkdtempSync(join(tmpdir(), 'nomos-caliente-')), uproject = join(dir, 'Juego.uproject');
  writeFileSync(uproject, '{}'); writeFileSync(join(dir, 'a.py'), 'print("a")'); writeFileSync(join(dir, 'b.py'), 'FALLA');
  return {dir, uproject};
}

test('x10: el editor caliente arranca una vez y los scripts siguientes reutilizan el mismo proceso', async () => {
  const {dir, uproject} = game();
  try {
    const first = await runWarm(uproject, join(dir, 'a.py'), {NOMOS_REPORT: join(dir, 'r.json')}, opts);
    assert.equal(first.ok, true); assert.ok(first.arranque !== null, 'el primero abre el editor');
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8')), {ok: true}, 'el env del trabajo llega al script');
    const pid = warmBeat(uproject)!.pid;
    const second = await runWarm(uproject, join(dir, 'a.py'), {}, opts);
    assert.equal(second.arranque, null, 'el segundo no abre otro editor');
    assert.match(second.salida, new RegExp(`n=2 pid=${pid}`));
    const bad = await runWarm(uproject, join(dir, 'b.py'), {}, opts);
    assert.equal(bad.ok, false); assert.match(bad.error!, /FALLA/);
    // una compilación de C++ posterior al arranque deja el editor viejo: se reabre
    mkdirSync(join(dir, 'Binaries', 'Win64'), {recursive: true});
    const dll = join(dir, 'Binaries', 'Win64', 'UnrealEditor-Juego.dll'); writeFileSync(dll, '');
    const later = new Date(Date.now() + 5000); utimesSync(dll, later, later);
    const rebuilt = await runWarm(uproject, join(dir, 'a.py'), {}, opts);
    assert.ok(rebuilt.arranque !== null); assert.notEqual(warmBeat(uproject)!.pid, pid);
  } finally { await stopWarm(uproject); }
  assert.equal(warmBeat(uproject), null);
  assert.equal(await stopWarm(uproject), false, 'parar sin editor no hace nada');
});

test('x10: un script que bloquea los ticks (sin latido) no se da por editor cerrado mientras el proceso viva', async () => {
  const {dir, uproject} = game();
  writeFileSync(join(dir, 'lento.py'), 'LENTO');
  try {
    await runWarm(uproject, join(dir, 'a.py'), {}, opts);
    const r = await runWarm(uproject, join(dir, 'lento.py'), {}, opts);
    assert.equal(r.ok, true, r.error ?? '');
  } finally { await stopWarm(uproject); }
});

test('x10: el editor caliente se cierra solo sin trabajo y nomos ue py lo usa desde la carpeta del juego', async () => {
  const {dir, uproject} = game();
  await runWarm(uproject, join(dir, 'a.py'), {}, {...opts, idleSeconds: 0.5});
  for (const end = Date.now() + 5000; warmBeat(uproject) && Date.now() < end;) await sleep(100);
  assert.equal(warmBeat(uproject), null, 'inactivo: se cierra');
  const cli = join(import.meta.dirname, '..', '..', 'service', 'src', 'cli.ts');
  const env = {...process.env, NOMOS_UE_FAKE: fake};
  try {
    const ok = spawnSync(process.execPath, [cli, 'ue', 'py', 'a.py'], {cwd: dir, env, encoding: 'utf8'});
    assert.equal(ok.status, 0, ok.stderr); assert.match(ok.stdout, /ejecutado a\.py n=1/); assert.match(ok.stderr, /abierto en/);
    const bad = spawnSync(process.execPath, [cli, 'ue', 'py', 'b.py'], {cwd: dir, env, encoding: 'utf8'});
    assert.equal(bad.status, 1); assert.match(bad.stderr, /editor caliente: \d+ ms/);
    assert.match(spawnSync(process.execPath, [cli, 'ue', 'estado'], {cwd: dir, env, encoding: 'utf8'}).stdout, /"abierto":true/);
    assert.match(spawnSync(process.execPath, [cli, 'ue', 'parar'], {cwd: dir, env, encoding: 'utf8'}).stdout, /"cerrado":true/);
  } finally { await stopWarm(uproject); }
});

test('nomos ue test: los tests de automatización en el editor caliente, con resumen JSON y exit 1 si fallan', async () => {
  const {dir, uproject} = game();
  const cli = join(import.meta.dirname, '..', '..', 'service', 'src', 'cli.ts');
  const env = {...process.env, NOMOS_UE_FAKE: fake};
  const ue = (args: string[], extra = {}) => spawnSync(process.execPath, [cli, 'ue', 'test', ...args], {cwd: dir, env: {...env, ...extra}, encoding: 'utf8'});
  try {
    const ok = ue(['System.Core.Math']);
    assert.equal(ok.status, 0, ok.stderr);
    const r = JSON.parse(ok.stdout);
    assert.deepEqual([r.ok, r.modo, r.pasados, r.fallidos], [true, 'caliente', 2, 0]);
    const bad = ue(['Juego.Falla']);
    assert.equal(bad.status, 1);
    assert.deepEqual(JSON.parse(bad.stdout).fallos, [{test: 'Juego.Falla.Uno', errores: ['Expected 1, got 2']}]);
    const none = ue(['Nada.QueNoExiste']);
    assert.equal(none.status, 1); assert.match(none.stderr, /No automation tests matched/);
    assert.equal(ue(['a;Quit']).status, 1, 'un filtro con ; metería otra orden de consola');
    // sin editor caliente: en frío, con -ExecCmds="Automation RunTests …; Quit"
    const frio = ue(['System.Core.Math'], {NOMOS_CALIENTE: 'off'});
    assert.equal(frio.status, 0, frio.stderr);
    assert.deepEqual([JSON.parse(frio.stdout).modo, JSON.parse(frio.stdout).pasados], ['frio', 2]);
  } finally { await stopWarm(uproject); }
});

// x10 (acelera A): con --tarea, `ue py` pide el turno al empezar y lo suelta al acabar, sin cerrar el editor caliente
test('x10: ue py --tarea pide el turno, cierra los calientes de otros que le dice el servicio y lo suelta al acabar', async () => {
  const {createServer} = await import('node:http');
  const {execFile} = await import('node:child_process');
  const {promisify} = await import('node:util');
  const {dir, uproject} = game(), otro = game();
  await runWarm(otro.uproject, join(otro.dir, 'a.py'), {}, opts);
  const llamadas: {url: string; body: any}[] = [];
  let concedido = false, held = false;
  const server = createServer((req, res) => {
    let raw = ''; req.on('data', c => raw += c); req.on('end', () => {
      llamadas.push({url: req.url!, body: JSON.parse(raw || '{}')});
      const answer = req.url!.endsWith('/release') ? {released: true}
        : held ? {granted: true, held: true}
        : concedido ? {granted: true, cerrar: [otro.uproject]} : {granted: false, reason: 'Espera a que J1 suelte Unreal'};
      concedido = true;
      res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify(answer));
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const dataDir = join(dir, '.nomos'); mkdirSync(dataDir);
  writeFileSync(join(dataDir, 'service.json'), JSON.stringify({pid: process.pid, port: (server.address() as any).port, token: 't', startedAt: 'x'}));
  const cli = join(import.meta.dirname, '..', '..', 'service', 'src', 'cli.ts');
  const ue = (...args: string[]) => promisify(execFile)(process.execPath, [cli, 'ue', 'py', 'a.py', '--tarea', 'T1', '--data', dataDir, ...args],
    {cwd: dir, env: {...process.env, NOMOS_UE_FAKE: fake}, encoding: 'utf8'});
  try {
    const r = await ue();
    assert.match(r.stdout, /ejecutado a\.py/); assert.match(r.stderr, /Espera a que J1 suelte Unreal/);
    assert.deepEqual(llamadas.map(l => l.url), ['/tasks/T1/turn', '/tasks/T1/turn', '/tasks/T1/turn/release']);
    assert.equal(llamadas[0].body.uproject, uproject);
    assert.equal(llamadas[2].body.caliente, uproject, 'suelta el turno avisando de que su caliente sigue abierto');
    assert.ok(warmBeat(uproject), 'el caliente sigue abierto para el siguiente script');
    assert.equal(warmBeat(otro.uproject), null, 'el caliente de otro se cerró antes de abrir el suyo');
    // con el turno pedido a mano (worker turn --wait) no lo suelta
    held = true; llamadas.length = 0;
    await ue();
    assert.deepEqual(llamadas.map(l => l.url), ['/tasks/T1/turn']);
  } finally { server.close(); await stopWarm(uproject); await stopWarm(otro.uproject); }
});

test('x10: una comprobación con la reserva libre cierra antes el editor caliente de su proyecto', async () => {
  const {openDb} = await import('../../service/src/db.ts');
  const {createTask} = await import('../../service/src/repo/tasks.ts');
  const {startRun} = await import('../../service/src/repo/runs.ts');
  const {withEditor} = await import('../../service/src/editor/queue.ts');
  const {dir, uproject} = game(), db = openDb(':memory:');
  try {
    await runWarm(uproject, join(dir, 'a.py'), {}, opts);
    const run = startRun(db, {taskId: createTask(db, {title: 'qa', area: 'ui'}).id, role: 'qa', provider: 'unreal'});
    const dentro = await withEditor({db} as any, {dir, uproject, name: 'Juego'}, run, async () => warmBeat(uproject));
    assert.equal(dentro, null, 'la comprobación no abre su Unreal con el caliente aún abierto');
  } finally { db.close(); await stopWarm(uproject); }
});
