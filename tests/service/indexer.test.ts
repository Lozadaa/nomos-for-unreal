import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { openDb } from '../../service/src/db.ts';
import { indexAll } from '../../service/src/catalog/indexer.ts';
import { assetConfig } from '../../service/src/catalog/paths.ts';
import { listCatalog, searchCatalog, upsertEntry } from '../../service/src/repo/catalog.ts';
import { celUid, fabFixture } from './fab-fixture.ts';
import { removeDir } from '../remove-dir.ts';

test('indexAll reproduce el recuento del informe nivel 2 y une las vistas del mismo pack', () => {
  const f = fabFixture(), db = openDb(':memory:');
  try {
    const before = statSync(f.listingsDb).mtimeMs;
    const result = indexAll(db, assetConfig(f.dataDir));
    assert.deepEqual(result.bySource, {listings: 1, launcherVault: 1, fabCache: 0, projects: 6, megascans: 2, engine: 3});
    assert.equal(result.entries, 11);
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
    assert.equal(rows.length, 11);
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
    removeDir(f.vaultDir);
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
    assert.equal(event.payload.entries, 11);
    assert.equal((event.payload.bySource as Record<string, number>).projects, 6);
    assert.equal(db.prepare('select state from commands').get()!.state, 'done');
  } finally { stop(); await stop.drained; db.close(); f.close(); }
});

test('la búsqueda usa prefijos: «tennis» encuentra Free_Tennisball y la raqueta', () => {
  const f = fabFixture(), db = openDb(':memory:');
  try {
    indexAll(db, assetConfig(f.dataDir));
    const names = searchCatalog(db, 'tennis').map(e => e.name);
    assert.ok(names.includes('Free_Tennisball') && names.includes('Nude_Tennis_Racket_🎾'), names.join());
  } finally { db.close(); f.close(); }
});

test('plantillas del motor: tres entradas engine con licencia de Epic, esqueleto y clips por nombre', () => {
  const f = fabFixture(), db = openDb(':memory:');
  try {
    indexAll(db, assetConfig(f.dataDir));
    const engine = listCatalog(db, {source: 'engine'});
    assert.deepEqual(engine.map(e => [e.name, e.category]).sort(), [
      ['Animaciones de combate (plantilla Tercera persona)', 'animation'], ['Maniquí UE4', 'character'],
      ['Maniquíes UE5 (Manny y Quinn)', 'character']]);
    const ue5 = engine.find(e => e.name.startsWith('Maniquíes UE5'))!;
    assert.equal(ue5.localPath, join(f.engineRoot, 'Templates', 'TemplateResources', 'High', 'Characters', 'Content'));
    assert.equal(ue5.license, 'Epic Content License (solo proyectos Unreal)');
    assert.equal(ue5.aiForbidden, 0);
    assert.deepEqual(ue5.engineVersions, ['5.8']);
    assert.deepEqual(ue5.formats, ['uasset']);
    assert.ok(ue5.tags.includes('skeleton:UE5_Mannequin'));
    for (const clip of ['AM_Punch', 'BS_Idle_Walk_Run', 'MM_Idle', 'SKM_Manny_Simple', 'SKM_Quinn_Simple']) assert.ok(ue5.tags.includes(clip), clip);
    assert.ok(!ue5.tags.includes('ABP_Unarmed') && !ue5.tags.includes('CR_Mannequin_Body'));
    const combat = engine.find(e => e.category === 'animation')!;
    assert.deepEqual(combat.tags.filter(t => t.startsWith('AM_')).sort(), ['AM_ChargedAttack', 'AM_ComboAttack']);
    assert.ok(engine.find(e => e.name === 'Maniquí UE4')!.tags.includes('skeleton:UE4_Mannequin'));
    assert.deepEqual(searchCatalog(db, 'ComboAttack').map(e => e.id), [combat.id]);
  } finally { db.close(); f.close(); }
});

test('sin motor en unrealPath la fuente engine queda vacía sin error', () => {
  const f = fabFixture(), db = openDb(':memory:');
  try {
    removeDir(f.engineRoot);
    assert.equal(indexAll(db, assetConfig(f.dataDir)).bySource.engine, 0);
  } finally { db.close(); f.close(); }
});

test('una base anterior al 5b (check sin engine) admite entradas engine al abrirla y conserva su FTS', async () => {
  const {mkdtempSync} = await import('node:fs');
  const {tmpdir} = await import('node:os');
  const {DatabaseSync} = await import('node:sqlite');
  const dir = mkdtempSync(join(tmpdir(), 'nomos-old-')), file = join(dir, 'old.sqlite');
  try {
    const raw = new DatabaseSync(file);
    // catalog_entries tal como la creaba main antes del 5b
    raw.exec(`create table catalog_entries(
      id text primary key, created_at text not null, updated_at text not null,
      name text not null, category text not null, description text not null,
      source text not null check(source in
        ('fab','megascans','polyhaven','ambientcg','kenney','quaternius','sketchfab','freesound','meshy','blender')),
      source_url text, fab_uid text, entitlement_uid text,
      state text not null check(state in ('owned','downloaded','cached','imported')),
      projects text not null, formats text not null, engine_versions text not null,
      license text, ai_forbidden integer not null check(ai_forbidden in (0,1)),
      thumbnail_path text, local_path text, tags text not null)`);
    raw.close();
    const first = openDb(file);
    try { upsertEntry(first, {name: 'Viejo_Pack', category: 'pack', description: '', source: 'fab'}); } finally { first.close(); }
    const second = openDb(file);
    try {
      upsertEntry(second, {name: 'Plantilla', category: 'character', description: '', source: 'engine'});
      assert.deepEqual(searchCatalog(second, 'Viejo').map(e => e.name), ['Viejo_Pack']);
      assert.deepEqual(searchCatalog(second, 'Plantilla').map(e => e.source), ['engine']);
    } finally { second.close(); }
  } finally { removeDir(dir); }
});
