import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locatedPath } from '../../service/src/data-paths.ts';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checksFixture } from './checks-fixture.ts';
import { listArtifacts } from '../../service/src/repo/artifacts.ts';

const fakes = join(import.meta.dirname, '..', 'fakes');
const ffmpeg = () => ({bin: process.execPath, baseArgs: [join(fakes, 'ffmpeg.mjs')]});
const prov = (a: {provenance: unknown}) => a.provenance as Record<string, unknown>;
const shots = (f: ReturnType<typeof checksFixture>) => listArtifacts(f.db, {taskId: f.task.id}).filter(a => a.kind === 'screenshot');

test('map: cuatro vistas (jugador + 3/4 izquierda, 3/4 derecha y picado) y la hoja de contactos 2×2', async () => {
  const f = checksFixture({files: ['Content/Maps/Nivel1.umap'], deps: {ffmpeg}});
  process.env.NOMOS_FAKE = 'ok';
  try {
    assert.equal((await f.run()).passed, true);
    const list = shots(f);
    assert.deepEqual(list.filter(a => prov(a).view).map(a => prov(a).view).sort(), ['left', 'player', 'right', 'top']);
    const sheet = list.find(a => prov(a).sheet === true)!;
    assert.match(sheet.path, /map-hoja\.jpg$/);
    assert.ok(existsSync(locatedPath(join(f.dataDir, 'artifacts'), sheet.path)));
    for (const a of list.filter(a => prov(a).view)) assert.ok(existsSync(locatedPath(join(f.dataDir, 'artifacts'), a.path)), String(prov(a).view));
    // la regresión visual solo juzga la vista del jugador: una sola línea base por mapa
    assert.deepEqual(readdirSync(join(f.projectDir, 'docs', 'baseline', 'propuestas')), ['map-Nivel1-1280x720.png']);
    assert.equal(list.find(a => prov(a).view === 'left')!.provenance && prov(list.find(a => prov(a).view === 'left')!).visual, undefined);
  } finally { f.close(); }
});

test('checks.views = 1 recupera el comportamiento anterior: solo la vista del jugador y sin hoja', async () => {
  const f = checksFixture({files: ['Content/Maps/Nivel1.umap'], deps: {ffmpeg}});
  process.env.NOMOS_FAKE = 'ok';
  try {
    writeFileSync(join(f.dataDir, 'config.json'), JSON.stringify({checks: {views: 1}}));
    assert.equal((await f.run()).passed, true);
    const list = shots(f);
    assert.deepEqual(list.map(a => prov(a).view), ['player']);
    assert.equal(list.some(a => prov(a).sheet), false);
  } finally { f.close(); }
});

test('si el editor pasa de 90 s en las vistas extra, se entregan las que haya y se anota en el resumen', async () => {
  const f = checksFixture({files: ['Content/Maps/Nivel1.umap'], deps: {ffmpeg}});
  process.env.NOMOS_FAKE = 'views_slow';
  try {
    assert.equal((await f.run()).passed, true);
    assert.deepEqual(shots(f).filter(a => prov(a).view).map(a => prov(a).view).sort(), ['left', 'player']);
    assert.match(f.events('test.passed').at(-1)!.summary, /Vistas extra cortadas a los 90 s: 1 de 3/);
  } finally { f.close(); process.env.NOMOS_FAKE = 'ok'; }
});

test('build: la vista del ejecutable juzga la regresión; las tres del rig salen del editor en el mismo mapa', async () => {
  const f = checksFixture({files: ['Config/DefaultGame.ini'], deps: {ffmpeg}});
  process.env.NOMOS_FAKE = 'ok';
  try {
    writeFileSync(join(f.dataDir, 'config.json'), JSON.stringify({walkthrough: {map: '/Game/Maps/Nivel1'}}));
    assert.equal((await f.run()).passed, true);
    const list = shots(f).filter(a => prov(a).check === 'build');
    assert.deepEqual(list.filter(a => prov(a).view).map(a => prov(a).view).sort(), ['left', 'player', 'right', 'top']);
    assert.equal(prov(list.find(a => prov(a).view === 'player')!).source, 'build');
    assert.ok(list.some(a => prov(a).sheet === true));
  } finally { f.close(); }
});
