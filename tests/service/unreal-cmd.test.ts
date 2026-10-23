import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUnrealCmd } from '../../service/src/adapters/unreal-cmd.ts';
import { waitFor } from './wait.ts';

const fake = join(import.meta.dirname, '..', 'fakes', 'unreal-cmd.mjs');
const uproject = 'C:/Unreal Projects/Nude_Tennis_Racket_🎾/Juego.uproject';
const editor = (mode: string, timeoutMs?: number) => {
  process.env.KRATOS_FAKE = mode;
  return createUnrealCmd({bin: process.execPath, baseArgs: [fake], timeoutMs});
};

test('verifyPack pasa raíz y proyecto con espacios y emoji, y lee el informe UTF-8', async () => {
  const report = await editor('ok').verifyPack(uproject, '/Game/AdvancedCelShader');
  assert.equal(report.ok, true);
  assert.equal(report.root, '/Game/AdvancedCelShader');
  assert.equal(report.engine, '5.8.3-0+UE5');
  const raw = report as unknown as {args: string[]; script: string; utf8: string};
  assert.equal(raw.args[0], uproject, 'el proyecto llega como un único argumento');
  assert.match(raw.script, /service[\\/]unreal[\\/]kratos_verify\.py$/);
  assert.ok(raw.args.includes('-NullRHI') && raw.args.includes('-unattended'));
  assert.equal(raw.utf8, 'Nude_Tennis_Racket_🎾');
});

test('verifyPack devuelve ok:false con dependencias faltantes o sin informe', async () => {
  const failed = await editor('fail').verifyPack(uproject, '/Game/Pack');
  assert.equal(failed.ok, false);
  assert.equal(failed.missing_dependencies.length, 1);
  const silent = await editor('noreport').verifyPack(uproject, '/Game/Pack');
  assert.equal(silent.ok, false);
  assert.match(silent.errors[0], /código 3 sin escribir el informe/);
});

test('importFile devuelve los assets o falla con unreal_import_failed', async () => {
  assert.deepEqual(await editor('ok').importFile(uproject, 'C:/x/modelo.glb', '/Game/Meshy', 'SM_Espada'), {assets: ['/Game/Meshy/SM_Espada']});
  await assert.rejects(editor('fail').importFile(uproject, 'C:/x/modelo.glb', '/Game/Meshy', 'SM_Espada'), /unreal_import_failed/);
});

test('tiempo máximo: unreal_timeout y el proceso queda muerto', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kratos-hang-')), pidFile = join(dir, 'pid');
  try {
    process.env.KRATOS_FAKE = 'hang';
    const cmd = createUnrealCmd({bin: process.execPath, baseArgs: [fake]});
    await assert.rejects(cmd.runPython(uproject, 'x.py', {KRATOS_FAKE_PID: pidFile}, 1500), /unreal_timeout/);
    const pid = Number(readFileSync(pidFile, 'utf8'));
    const alive = () => { try { process.kill(pid, 0); return true; } catch { return false; } };
    await waitFor(() => !alive(), 5000);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('sin ejecutable: unreal_missing', async () => {
  await assert.rejects(createUnrealCmd({bin: 'C:/no/existe/UnrealEditor-Cmd.exe'}).verifyPack(uproject, '/Game/X'), /unreal_missing/);
});
