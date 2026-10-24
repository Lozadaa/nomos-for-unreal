import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { checksFixture } from './checks-fixture.ts';
import { listArtifacts } from '../../service/src/repo/artifacts.ts';
import { walkthroughArgs } from '../../service/src/checks/build.ts';
import { encodePng } from '../../service/src/checks/visual.ts';
import type { Launch } from '../../service/src/checks/run.ts';

/** Captura 64×32 gris con una barra de vida de `health` px (de 0 a 32). */
function png(health: number): Buffer {
  const width = 64, height = 32, data = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    const x = p % width, y = Math.floor(p / width), bar = y >= 4 && y < 12 && x < health;
    data.set(bar ? [30, 210, 60, 255] : [90, 90, 100, 255], p * 4);
  }
  return encodePng({width, height, data});
}
/** Ejecutable falso: deja la captura y el log del juego y dice cuánto vivió. */
const game = (run: Partial<Launch>, image?: Buffer, calls: string[][] = []) => async (exe: string, args: string[]): Promise<Launch> => {
  calls.push(args);
  const saved = join(dirname(exe), 'Juego', 'Saved');
  mkdirSync(join(saved, 'Logs'), {recursive: true});
  writeFileSync(join(saved, 'Logs', 'Juego.log'), 'LogInit: Display: arranque\nLogWorld: Bringing World /Game/Mapas/Prueba up for play\n');
  if (image) { mkdirSync(join(saved, 'Screenshots', 'Windows'), {recursive: true}); writeFileSync(join(saved, 'Screenshots', 'Windows', 'HighresScreenshot00000.png'), image); }
  return {exitCode: null, seconds: 30, killed: true, ...run};
};
const env = () => { process.env.KRATOS_FAKE = 'ok'; };

test('el recorrido guionado entra al mapa, hace tres acciones por consola, espera a estabilizar y captura', () => {
  const args = walkthroughArgs({map: '/Game/Mapas/Prueba', commands: ['stat fps', 'stat unit', 'r.VSync 0'], tracefile: 'C:/con espacio/traza.utrace'});
  assert.equal(args[0], '/Game/Mapas/Prueba');
  const exec = args.find(a => a.startsWith('-ExecCmds='))!;
  assert.equal(exec, '-ExecCmds="r.HighResScreenshotDelay 120,stat fps,stat unit,r.VSync 0,HighResShot 1280x720"');
  assert.ok(args.includes('-windowed') && args.includes('-ResX=1280') && args.includes('-ResY=720'));
  assert.ok(args.includes('-trace=cpu,gpu,memory') && args.includes('-tracefile="C:/con espacio/traza.utrace"'));
  assert.throws(() => walkthroughArgs({commands: ['quit, rm']}), /invalid_walkthrough/);
});

test('un paquete que se cierra a los 5 s falla con la causa y guarda el log, aunque saliera con código cero', async () => {
  for (const exitCode of [3, 0]) {
    const f = checksFixture({files: ['Config/DefaultGame.ini'], deps: {launch: game({exitCode, seconds: 5.2, killed: false})}});
    try {
      env();
      assert.equal((await f.run()).passed, false);
      const failed = f.events('test.failed').at(-1)!;
      assert.match(failed.summary, new RegExp(`El proceso terminó a los 5 s con código ${exitCode}`));
      const log = listArtifacts(f.db, {taskId: f.task.id}).find(a => (a.provenance as {label?: string}).label === 'Empaquetado · log del juego');
      assert.ok(log && existsSync(log.path));
    } finally { f.close(); }
  }
});

test('build aprobado crea la línea base; un cambio real de la UI (vida 32 → 16) falla con la imagen de diferencia', async () => {
  const calls: string[][] = [];
  const f = checksFixture({files: ['Config/DefaultGame.ini'], deps: {launch: game({}, png(32), calls)}});
  try {
    env();
    assert.equal((await f.run()).passed, true);
    assert.equal(calls.length, 1);
    assert.match(f.events('test.passed').at(-1)!.summary, /Línea base creada: build-1280x720/);
    assert.ok(existsSync(join(f.projectDir, 'docs', 'baseline', 'build-1280x720.png')));
    const second = checksFixture({files: ['Config/DefaultGame.ini'], deps: {launch: game({}, png(16))}});
    try {
      mkdirSync(join(second.projectDir, 'docs', 'baseline'), {recursive: true});
      writeFileSync(join(second.projectDir, 'docs', 'baseline', 'build-1280x720.png'), png(32));
      assert.equal((await second.run()).passed, false);
      assert.match(second.events('test.failed').at(-1)!.summary, /build-1280x720: la captura difiere un \d+,?\d* % de la línea base \(tolerancia 2 %\)/);
      const diff = listArtifacts(second.db, {taskId: second.task.id}).find(a => (a.provenance as {visual?: string}).visual === 'diff')!;
      assert.equal((diff.provenance as {label: string}).label, 'Diferencia con la línea base 1280×720');
      writeFileSync(join(second.dataDir, 'config.json'), '{"visualTolerance":0.5}');
      assert.equal((await second.run()).passed, true, 'la tolerancia de config.json manda');
    } finally { second.close(); }
  } finally { f.close(); }
});

test('un código NTSTATUS se muestra también en hexadecimal (visto en el equipo: 0xC0000106)', async () => {
  const { exitText } = await import('../../service/src/checks/build.ts');
  assert.deepEqual([exitText(3221225734), exitText(3), exitText(null)], ['3221225734 (0xC0000106)', '3', 'desconocido']);
});

test('un cook fallido explica la causa: errores del registro de Unreal y la línea del fallo, sin el resumen de avisos', async () => {
  const { errorLines } = await import('../../service/src/adapters/unreal-build.ts');
  const log = [
    'LogLinker: Warning: Failed to read package file summary, the file "C:/Juego/Content/Kratos/Marcador.uasset" is too small (4 bytes)',
    'LogAssetRegistry: Error: Package is unloadable: C:/Juego/Content/Kratos/Marcador.uasset. Reason: Invalid value for PACKAGE_FILE_TAG at start of file.',
    'LogInit: Display: Warning/Error Summary (Unique only)',
    'LogInit: Display: LogAssetRegistry: Error: Package is unloadable: C:/Juego/Content/Kratos/Marcador.uasset.',
    'LogInit: Display: Failure - 1 error(s), 2 warning(s)',
    'Cook failed.',
    'AutomationTool exiting with ExitCode=25 (Error_UnknownCookFailure)',
    'C:\Juego\Source\Juego.cpp(12): error C2065: identificador no declarado',
  ].join('\n');
  assert.deepEqual(errorLines(log), [
    'LogAssetRegistry: Error: Package is unloadable: C:/Juego/Content/Kratos/Marcador.uasset. Reason: Invalid value for PACKAGE_FILE_TAG at start of file.',
    'Cook failed.',
    'AutomationTool exiting with ExitCode=25 (Error_UnknownCookFailure)',
    'C:\Juego\Source\Juego.cpp(12): error C2065: identificador no declarado',
  ]);
});

test('un error fatal del juego (el informador de fallos lo mantiene vivo) falla con la causa del log, no por falta de captura', async () => {
  const crash = async (exe: string): Promise<Launch> => {
    const logs = join(dirname(exe), 'Juego', 'Saved', 'Logs');
    mkdirSync(logs, {recursive: true});
    writeFileSync(join(logs, 'Juego.log'), [
      '[2026.10.23-21.48.30:354][  0]LogLoad: LoadMap: C:/Program?Name=Player',
      '[2026.10.23-21.48.30:526][  0]LogWindows: Error: appError called: Fatal error: [File:D:\build\PackageName.cpp] [Line: 1397] ',
      "FilenameToLongPackageName failed to convert 'C:/Program'. Attempt result was 'C:/Program', but the path contains illegal characters ':'.",
    ].join('\n'));
    return {exitCode: null, seconds: 30, killed: true};
  };
  const f = checksFixture({files: ['Config/DefaultGame.ini'], deps: {launch: crash}});
  try {
    env();
    assert.equal((await f.run()).passed, false);
    const summary = f.events('test.failed').at(-1)!.summary;
    assert.match(summary, /^El juego tuvo un error fatal: /);
    assert.match(summary, /FilenameToLongPackageName failed to convert 'C:\/Program'/);
  } finally { f.close(); }
});
