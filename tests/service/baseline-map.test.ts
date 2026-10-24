import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { checksFixture } from './checks-fixture.ts';
import { filtered } from '../../service/src/repo/rows.ts';
import { listArtifacts } from '../../service/src/repo/artifacts.ts';
import { defaultMap } from '../../service/src/checks/map.ts';
import { encodePng } from '../../service/src/checks/visual.ts';
import type { Launch } from '../../service/src/checks/run.ts';
import type { TestRun } from '../../service/src/model.ts';

/** Captura 64×32 gris; `shade` cambia el tono para distinguir dos mapas. */
const png = (shade = 90) => encodePng({width: 64, height: 32, data: new Uint8Array(64 * 32 * 4).map((_, i) => i % 4 === 3 ? 255 : shade)});
/** Ejecutable falso: deja la captura y un log del juego con las líneas dadas. */
const game = (log: string[], image = png()) => async (exe: string): Promise<Launch> => {
  const saved = join(dirname(exe), 'Juego', 'Saved');
  mkdirSync(join(saved, 'Logs'), {recursive: true}); mkdirSync(join(saved, 'Screenshots', 'Windows'), {recursive: true});
  writeFileSync(join(saved, 'Logs', 'Juego.log'), log.join('\n'));
  writeFileSync(join(saved, 'Screenshots', 'Windows', 'HighresScreenshot00000.png'), image);
  return {exitCode: null, seconds: 30, killed: true};
};
const ini = '[/Script/EngineSettings.GameMapsSettings]\nEditorStartupMap=/Game/Esquina/Mapas/L_Gym.L_Gym\nGameDefaultMap=/Game/Esquina/Mapas/L_Lookdev.L_Lookdev\n';
const setup = (log: string[] = [], withIni = true) => {
  const f = checksFixture({files: ['Config/DefaultGame.ini'], deps: {launch: game(log)}});
  process.env.NOMOS_FAKE = 'ok';
  if (withIni) writeFileSync(join(f.projectDir, 'Config', 'DefaultEngine.ini'), ini);
  return f;
};
const baseline = (f: {projectDir: string}, name: string) => join(f.projectDir, 'docs', 'baseline', `${name}.png`);
const buildRow = (f: ReturnType<typeof setup>) => filtered<TestRun>(f.db, 'test_runs', {taskId: f.task.id}).find(r => r.checkId === 'build')!;

test('Esquina J0.4: sin .umap en el diff, el build nombra la línea base con el GameDefaultMap de DefaultEngine.ini', async () => {
  const f = setup(['LogWorld: Bringing World /Game/Otro/Mapa.Mapa up for play']);
  try {
    assert.equal((await f.run()).passed, true);
    assert.equal(buildRow(f).map, '/Game/Esquina/Mapas/L_Lookdev');
    assert.ok(existsSync(baseline(f, 'build-L_Lookdev-1280x720')));
    const shot = listArtifacts(f.db, {taskId: f.task.id}).find(a => a.kind === 'screenshot')!;
    assert.equal((shot.provenance as {map?: string}).map, '/Game/Esquina/Mapas/L_Lookdev');
  } finally { f.close(); }
});

test('sin GameDefaultMap, el mapa sale del log del juego', async () => {
  const f = setup(['LogLoad: LoadMap: /Game/Esquina/Mapas/L_Gym?Name=Player', 'LogWorld: Bringing World /Game/Esquina/Mapas/L_Gym.L_Gym up for play'], false);
  try {
    assert.equal((await f.run()).passed, true);
    assert.equal(buildRow(f).map, '/Game/Esquina/Mapas/L_Gym');
    assert.ok(existsSync(baseline(f, 'build-L_Gym-1280x720')));
  } finally { f.close(); }
  assert.equal(defaultMap('C:/no/existe', '[0]LogLoad: LoadMap: /Engine/Maps/Entry\n[1]LogLoad: LoadMap: /Game/Mapas/Uno.Uno?Name=Player'), '/Game/Mapas/Uno');
  assert.equal(defaultMap('C:/no/existe', 'nada'), null);
});

test('la línea base antigua sin mapa se adopta para el mapa por defecto renombrándola, con una línea en el resumen', async () => {
  const f = setup();
  try {
    mkdirSync(join(f.projectDir, 'docs', 'baseline'), {recursive: true});
    writeFileSync(baseline(f, 'build-1280x720'), png());
    assert.equal((await f.run()).passed, true);
    assert.equal(existsSync(baseline(f, 'build-1280x720')), false);
    assert.ok(existsSync(baseline(f, 'build-L_Lookdev-1280x720')));
    const summary = f.events('test.passed').at(-1)!.summary;
    assert.match(summary, /Línea base sin mapa adoptada para L_Lookdev: build-L_Lookdev-1280x720/);
    assert.match(summary, /build-L_Lookdev-1280x720: igual a la línea base/);
  } finally { f.close(); }
});

test('walkthrough.map sigue mandando sobre el GameDefaultMap y no adopta la línea base del mapa por defecto', async () => {
  const f = setup();
  try {
    writeFileSync(join(f.dataDir, 'config.json'), JSON.stringify({walkthrough: {map: '/Game/Kratos/Maps/AnimTest'}}));
    mkdirSync(join(f.projectDir, 'docs', 'baseline'), {recursive: true});
    writeFileSync(baseline(f, 'build-1280x720'), png(200));
    assert.equal((await f.run()).passed, true);
    assert.equal(buildRow(f).map, '/Game/Kratos/Maps/AnimTest');
    assert.ok(existsSync(baseline(f, 'build-AnimTest-1280x720')));
    assert.ok(existsSync(baseline(f, 'build-1280x720')), 'la antigua es del mapa por defecto: se queda');
  } finally { f.close(); }
});
