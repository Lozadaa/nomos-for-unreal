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
