import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { openDb } from '../../service/src/db.ts';
import { indexAll } from '../../service/src/catalog/indexer.ts';
import { assetConfig } from '../../service/src/catalog/paths.ts';
import { listCatalog, searchCatalog, upsertEntry } from '../../service/src/repo/catalog.ts';
import { celUid, fabFixture } from './fab-fixture.ts';

test('indexAll reproduce el recuento del informe nivel 2 y une las vistas del mismo pack', () => {
  const f = fabFixture(), db = openDb(':memory:');
  try {
    const before = statSync(f.listingsDb).mtimeMs;
    const result = indexAll(db, assetConfig(f.dataDir));
    assert.deepEqual(result.bySource, {listings: 1, launcherVault: 1, fabCache: 0, projects: 6, megascans: 2});
    assert.equal(result.entries, 8);
    const rows = listCatalog(db);
    assert.equal(rows.filter(r => r.source === 'fab' && r.state === 'imported' && r.formats.includes('uasset')).length, 6);
    const cel = rows.find(r => r.fabUid === celUid)!;
    assert.equal(cel.name, 'Advanced Cel Shader Lite');
    assert.equal(cel.state, 'imported');
    assert.deepEqual(cel.projects, ['KratosFabTest']);
    assert.deepEqual(cel.engineVersions, ['5.4']);
    assert.match(cel.localPath!, /VaultCache[\\/]Advanceddffcefa302e4V2[\\/]data[\\/]Content[\\/]AdvancedCelShader$/);
    assert.equal(cel.thumbnailPath, null, 'una URL remota no es una miniatura en disco');
    const mega = rows.filter(r => r.source === 'megascans');
    assert.deepEqual(mega.map(r => [r.name, r.state, Boolean(r.thumbnailPath)]), [['Hudson', 'downloaded', true], ['Emory', 'downloaded', false]]);
    assert.ok(!rows.some(r => r.name === 'Fantasma' || r.name === 'StarterContent'));
    assert.equal(statSync(f.listingsDb).mtimeMs, before, 'listings_v1.db se lee desde una copia');
  } finally { db.close(); f.close(); }
});

test('un segundo indexAll no duplica y conserva id, licencia y proyectos conocidos', () => {
  const f = fabFixture(), db = openDb(':memory:');
  try {
    const config = assetConfig(f.dataDir);
    indexAll(db, config);
    const cel = listCatalog(db).find(r => r.fabUid === celUid)!;
    upsertEntry(db, {...cel, license: 'Fab Standard License', projects: [...cel.projects, 'MiJuego']});
    indexAll(db, config);
    const rows = listCatalog(db);
    assert.equal(rows.length, 8);
    const again = rows.find(r => r.fabUid === celUid)!;
    assert.equal(again.id, cel.id);
    assert.equal(again.license, 'Fab Standard License');
    assert.deepEqual(again.projects.sort(), ['KratosFabTest', 'MiJuego']);
  } finally { db.close(); f.close(); }
});

test('pack con emoji y espacios: ruta, FTS y nombre intactos', () => {
  const f = fabFixture(), db = openDb(':memory:');
  try {
    indexAll(db, assetConfig(f.dataDir));
    const [racket] = searchCatalog(db, 'Nude_Tennis_Racket');
    assert.equal(racket.name, 'Nude_Tennis_Racket_🎾');
    assert.equal(racket.localPath, join(f.projectsDir, 'CrazyPadel', 'Content', 'Fab', 'Nude_Tennis_Racket_🎾'));
  } finally { db.close(); f.close(); }
});

test('sin listings_v1.db ni VaultCache la fuente queda vacía sin error', () => {
  const f = fabFixture(), db = openDb(':memory:');
  try {
    rmSync(f.vaultDir, {recursive: true, force: true});
    const result = indexAll(db, assetConfig(f.dataDir));
    assert.equal(result.bySource.listings, 0);
    assert.equal(result.bySource.launcherVault, 0);
    assert.equal(result.bySource.projects, 5, 'sin el Launcher, Content/AdvancedCelShader no se reconoce como pack');
  } finally { db.close(); f.close(); }
});

test('asset.index por la bandeja emite catalog.indexed con el resumen', async () => {
  const f = fabFixture(), db = openDb(':memory:');
  const {enqueue} = await import('../../service/src/commands.ts');
  const {startRunner} = await import('../../service/src/runner.ts');
  const {createAssetHandlers} = await import('../../service/src/handlers/asset.ts');
  const {listEvents} = await import('../../service/src/store.ts');
  const {waitFor} = await import('./wait.ts');
  enqueue(db, 'asset.index', {}, 'asset.index:test');
  const stop = startRunner(db, createAssetHandlers(), {intervalMs: 1, context: {dataDir: f.dataDir}});
  try {
    await waitFor(() => listEvents(db, 0).some(e => e.type === 'catalog.indexed'));
    const event = listEvents(db, 0).find(e => e.type === 'catalog.indexed')!;
    assert.equal(event.payload.entries, 8);
    assert.equal((event.payload.bySource as Record<string, number>).projects, 6);
    assert.equal(db.prepare('select state from commands').get()!.state, 'done');
  } finally { stop(); await stop.drained; db.close(); f.close(); }
});
