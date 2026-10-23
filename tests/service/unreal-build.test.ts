import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUnrealCmd } from '../../service/src/adapters/unreal-cmd.ts';
import { buildCookRun, buildEditorTarget } from '../../service/src/adapters/unreal-build.ts';
import { waitFor } from './wait.ts';

const fakeCmd = join(import.meta.dirname, '..', 'fakes', 'unreal-cmd.mjs');
const fakeBuild = join(import.meta.dirname, '..', 'fakes', 'unreal-build.mjs');
const uproject = 'C:/Unreal Projects/Juego Prueba/Juego.uproject';
const build = {bin: process.execPath, baseArgs: [fakeBuild]};

test('render quita -NullRHI y fija la resolución; sin render el modo por lotes no cambia', async () => {
  process.env.KRATOS_FAKE = 'ok';
  const cmd = createUnrealCmd({bin: process.execPath, baseArgs: [fakeCmd]});
  const batch = (await cmd.runPython(uproject, 'x.py')).reportJson!.args as string[];
  assert.ok(batch.includes('-NullRHI'));
  assert.ok(!batch.some(a => a.startsWith('-ResX')));
  const shown = (await cmd.runPython(uproject, 'x.py', {}, 5000, {render: {width: 1280, height: 720}})).reportJson!.args as string[];
  assert.ok(!shown.includes('-NullRHI'));
  for (const arg of ['-ResX=1280', '-ResY=720', '-windowed', '-ForceRes', '-unattended']) assert.ok(shown.includes(arg), arg);
});

test('el tiempo agotado conserva el log en el error', async () => {
  process.env.KRATOS_FAKE = 'hang';
  const cmd = createUnrealCmd({bin: process.execPath, baseArgs: [fakeCmd]});
  const error = await cmd.runPython(uproject, 'x.py', {}, 1000).catch(e => e);
  assert.equal(error.message, 'unreal_timeout');
  assert.match(error.log, /LogPython/);
});

test('engineVersion lee Build.version del motor sin arrancar el editor; sin archivo, null', () => {
  const engine = mkdtempSync(join(tmpdir(), 'kratos-engine-'));
  try {
    mkdirSync(join(engine, 'Build'), {recursive: true});
    writeFileSync(join(engine, 'Build', 'Build.version'), JSON.stringify({MajorVersion: 5, MinorVersion: 8, PatchVersion: 3}));
    assert.equal(createUnrealCmd({bin: process.execPath, engineDir: engine}).engineVersion(uproject), '5.8.3');
    assert.equal(createUnrealCmd({bin: process.execPath, engineDir: join(engine, 'no')}).engineVersion(uproject), null);
  } finally { rmSync(engine, {recursive: true, force: true}); }
});

test('buildEditorTarget: éxito, y fallo con las líneas de error separadas del log completo', async () => {
  process.env.KRATOS_FAKE = 'ok';
  const ok = await buildEditorTarget(uproject, build);
  assert.equal(ok.ok, true);
  assert.match(ok.log, /JuegoEditor Win64 Development/);
  assert.ok(ok.log.includes(`-Project=${uproject}`));
  process.env.KRATOS_FAKE = 'fail';
  const failed = await buildEditorTarget(uproject, build);
  assert.equal(failed.ok, false);
  assert.equal(failed.errors.length, 400);
  assert.match(failed.errors[0], /error C2065/);
  assert.match(failed.log, /Result: Failed/);
});

test('buildEditorTarget respeta el tiempo máximo y mata el proceso', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kratos-build-hang-')), pidFile = join(dir, 'pid');
  try {
    process.env.KRATOS_FAKE = 'hang'; process.env.KRATOS_FAKE_PID = pidFile;
    await assert.rejects(buildEditorTarget(uproject, {...build, timeoutMs: 1000}), /unreal_timeout/);
    const pid = Number(readFileSync(pidFile, 'utf8'));
    await waitFor(() => { try { process.kill(pid, 0); return false; } catch { return true; } }, 5000);
  } finally { delete process.env.KRATOS_FAKE_PID; rmSync(dir, {recursive: true, force: true}); }
});

test('buildCookRun empaqueta en outDir y devuelve el ejecutable; sin motor, unreal_missing', async () => {
  const out = mkdtempSync(join(tmpdir(), 'kratos-cook-'));
  try {
    process.env.KRATOS_FAKE = 'ok';
    const result = await buildCookRun(uproject, out, build);
    assert.equal(result.ok, true);
    assert.equal(result.exePath, join(out, 'Windows', 'Juego.exe'));
    assert.match(result.log, /BuildCookRun .*-archivedirectory=/);
    await assert.rejects(buildEditorTarget(uproject, {bin: 'C:/no/existe/Build.bat'}), /unreal_missing/);
  } finally { rmSync(out, {recursive: true, force: true}); }
});
