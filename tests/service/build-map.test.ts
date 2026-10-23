import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { checksFixture } from './checks-fixture.ts';
import { buildCookRun } from '../../service/src/adapters/unreal-build.ts';
import type { Launch } from '../../service/src/checks/run.ts';

const fakeBuild = join(import.meta.dirname, '..', 'fakes', 'unreal-build.mjs');

test('BuildCookRun cocina el mapa del recorrido: sin él, el juego empaquetado no puede entrar (visto en KratosFabTest)', async () => {
  process.env.KRATOS_FAKE = 'ok';
  const out = join(import.meta.dirname, '..', '..', '.kratos-test-build-' + process.pid);
  try {
    const result = await buildCookRun('C:/Juego/Juego.uproject', out, {bin: process.execPath, baseArgs: [fakeBuild]}, ['/Game/Mapas/Prueba']);
    assert.match(result.log, / -map=\/Game\/Mapas\/Prueba /);
    const without = await buildCookRun('C:/Juego/Juego.uproject', out, {bin: process.execPath, baseArgs: [fakeBuild]});
    assert.doesNotMatch(without.log, /-map=/);
  } finally { (await import('node:fs')).rmSync(out, {recursive: true, force: true}); }
});

test('la traza de Insights solo se pide con walkthrough.trace: true (30 s pesaron ~0,9 GB en KratosFabTest)', async () => {
  const calls: string[][] = [];
  const record = async (_exe: string, args: string[]): Promise<Launch> => { calls.push(args); return {exitCode: null, seconds: 30, killed: true}; };
  const f = checksFixture({files: ['Config/DefaultGame.ini'], deps: {launch: record}});
  try {
    process.env.KRATOS_FAKE = 'ok';
    await f.run();
    writeFileSync(join(f.dataDir, 'config.json'), JSON.stringify({walkthrough: {trace: true}}));
    await f.run();
    assert.equal(calls.length, 2);
    assert.equal(calls[0].some(a => a.startsWith('-trace')), false);
    assert.ok(calls[1].includes('-trace=cpu,gpu,memory'));
  } finally { f.close(); }
});

test('sin captura, el resumen cita los errores del log del juego (mapa que no se pudo cargar)', async () => {
  const noMap = async (exe: string): Promise<Launch> => {
    const logs = join(dirname(exe), 'Juego', 'Saved', 'Logs');
    mkdirSync(logs, {recursive: true});
    writeFileSync(join(logs, 'Juego.log'), [
      '[2026.10.23-21.50.48:602][  0]LogStreaming: Warning: LoadPackage: SkipPackage: /Game/Mapas/Prueba - The package to load does not exist on disk',
      "[2026.10.23-21.50.48:602][  0]LogLoad: Error: Failed to enter /Game/Mapas/Prueba: Failed to load package '/Game/Mapas/Prueba'.",
    ].join('\n'));
    return {exitCode: null, seconds: 30, killed: true};
  };
  const f = checksFixture({files: ['Config/DefaultGame.ini'], deps: {launch: noMap}});
  try {
    process.env.KRATOS_FAKE = 'ok';
    writeFileSync(join(f.dataDir, 'config.json'), JSON.stringify({walkthrough: {map: '/Game/Mapas/Prueba'}}));
    await f.run();
    const failed = f.events('test.failed').find(e => e.check === 'build');
    assert.ok(failed, 'el build falla');
    assert.match(failed!.summary, /El ejecutable arrancó pero no dejó la captura/);
    assert.match(failed!.summary, /LogLoad: Error: Failed to enter \/Game\/Mapas\/Prueba/);
  } finally { f.close(); }
});
