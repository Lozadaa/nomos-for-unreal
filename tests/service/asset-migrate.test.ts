import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { versionWarning } from '../../service/src/handlers/asset-migrate.ts';
import { extractZip } from '../../service/src/catalog/zip.ts';
import { acquire, listLeases } from '../../service/src/leases.ts';
import { createTask, getTask } from '../../service/src/repo/tasks.ts';
import { startRun } from '../../service/src/repo/runs.ts';
import { listArtifacts } from '../../service/src/repo/artifacts.ts';
import { listDecisions, resolveDecision } from '../../service/src/repo/decisions.ts';
import { listCatalog, upsertEntry } from '../../service/src/repo/catalog.ts';
import { listEvents } from '../../service/src/store.ts';
import { assetFixture } from './asset-fixture.ts';

const events = (f: {db: any}, type: string) => listEvents(f.db, 0).filter(e => e.type === type).map(e => e.payload);

test('aviso de versión: rango declarado frente al motor que verificó', () => {
  assert.equal(versionWarning({engineVersions: ['4.20', '5.4']}, '5.8.3-58210709+++UE5+Release-5.8'), 'Publicado para 4.20-5.4; verificado en 5.8.3');
  assert.equal(versionWarning({engineVersions: ['5.4']}, '5.8.3-0'), 'Publicado para 5.4; verificado en 5.8.3');
  assert.equal(versionWarning({engineVersions: ['5.8']}, '5.8.3-0'), null);
  assert.equal(versionWarning({engineVersions: []}, '5.8.3-0'), null);
});

test('migrar el pack del Launcher al juego: copia, verifica, marca imported y deja informe con el aviso', async () => {
  const f = assetFixture();
  try {
    process.env.KRATOS_FAKE = 'ok';
    const cel = f.entry('Advanced Cel Shader Lite');
    const result = await f.run('asset.migrate', {entryId: cel.id});
    assert.equal(result.ok, true);
    assert.equal(result.root, '/Game/AdvancedCelShader');
    assert.ok(existsSync(join(f.projectDir, 'Content', 'AdvancedCelShader', 'a.uasset')));
    assert.ok(!existsSync(join(f.projectDir, 'Content', 'StarterContent')), 'nunca se copia StarterContent');
    const after = listCatalog(f.db).find(e => e.id === cel.id)!;
    assert.equal(after.state, 'imported');
    assert.deepEqual(after.projects.sort(), ['Juego', 'KratosFabTest']);
    assert.equal(after.verifiedEngine, '5.8.3');
    const [artifact] = listArtifacts(f.db, {kind: 'report'});
    assert.equal((artifact.provenance as any).label, 'Verificación de pack · informe');
    const report = JSON.parse(readFileSync(artifact.path, 'utf8'));
    assert.equal(report.warning, 'Publicado para 5.4; verificado en 5.8.3');
    assert.deepEqual(report.engineVersions, ['5.4']);
    assert.equal(events(f, 'asset.migrated')[0].warning, 'Publicado para 5.4; verificado en 5.8.3');
    assert.equal(getTask(f.db, result.taskId)!.state, 'done');
    assert.deepEqual(listLeases(f.db), [], 'la reserva del editor se libera al terminar');
  } finally { f.close(); }
});

test('verificación fallida: asset.verify_failed, entrada sin cambios y tarea en probando bloqueada', async () => {
  const f = assetFixture();
  try {
    process.env.KRATOS_FAKE = 'fail';
    const ball = f.entry('Free_Tennisball', 'CrazyPadel');
    const result = await f.run('asset.migrate', {entryId: ball.id});
    assert.equal(result.ok, false);
    assert.ok(existsSync(join(f.projectDir, 'Content', 'Fab', 'Free_Tennisball', 'scene.uasset')), 'packs del plugin van a Content/Fab');
    assert.deepEqual(listCatalog(f.db).find(e => e.id === ball.id)!.projects, ['CrazyPadel']);
    assert.equal(events(f, 'asset.verify_failed').length, 1);
    const task = getTask(f.db, result.taskId)!;
    assert.equal(task.state, 'probando');
    assert.match(task.blockedReason!, /Verificación sin GUI fallida/);
  } finally { f.close(); }
});

test('destino existente: Decisión Reemplazar/Conservar; mientras está abierta se difiere y «Reemplazar» copia', async () => {
  const f = assetFixture();
  try {
    process.env.KRATOS_FAKE = 'ok';
    const ball = f.entry('Free_Tennisball', 'CrazyPadel');
    const old = join(f.projectDir, 'Content', 'Fab', 'Free_Tennisball');
    mkdirSync(old, {recursive: true}); writeFileSync(join(old, 'propio.uasset'), 'mío');
    const first = await f.run('asset.migrate', {entryId: ball.id}, 'cmd-1');
    assert.equal(first.deferred, true);
    assert.match(first.reason, /asset_exists/);
    const [decision] = listDecisions(f.db, 'open');
    assert.deepEqual(decision.options.map(o => o.label), ['Reemplazar', 'Conservar']);
    assert.equal((await f.run('asset.migrate', {entryId: ball.id}, 'cmd-1')).deferred, true);
    assert.ok(existsSync(join(old, 'propio.uasset')), 'nada se sobrescribe sin Decisión');
    resolveDecision(f.db, decision.id, 'approve', 'usuario');
    const done = await f.run('asset.migrate', {entryId: ball.id}, 'cmd-1');
    assert.equal(done.ok, true);
    assert.ok(!existsSync(join(old, 'propio.uasset')) && existsSync(join(old, 'scene.uasset')));
  } finally { f.close(); }
});

test('dos operaciones de editor sobre el mismo proyecto: la segunda se difiere por editor/<proyecto>', async () => {
  const f = assetFixture();
  try {
    const busy = createTask(f.db, {title: 'Verificar otro pack', area: 'assets'});
    const holder = startRun(f.db, {taskId: busy.id, role: 'arte', provider: 'unreal'});
    assert.equal(acquire(f.db, holder.id, busy.id, ['editor/Juego']).ok, true);
    const result = await f.run('asset.migrate', {entryId: f.entry('Phone').id});
    assert.equal(result.deferred, true);
    assert.match(result.reason, /Esperando reserva: Juego/);
    assert.ok(!existsSync(join(f.projectDir, 'Content', 'Fab', 'Phone')), 'no se copia nada mientras otro editor trabaja');
  } finally { f.close(); }
});

test('caché del plugin: el zip (store/deflate, nombre UTF-8) se descomprime en Content/Fab', async () => {
  const f = assetFixture();
  try {
    process.env.KRATOS_FAKE = 'ok';
    const zip = join(f.root, 'FabLibrary', 'raqueta.zip');
    mkdirSync(join(f.root, 'FabLibrary'), {recursive: true});
    writeFileSync(zip, makeZip({'Nude_Tennis_Racket_🎾/scene.uasset': 'malla', 'Nude_Tennis_Racket_🎾/T_Base.uasset': 'textura'}));
    const entry = upsertEntry(f.db, {name: 'raqueta', category: 'pack', description: '', source: 'fab', state: 'cached', fabUid: 'raqueta', localPath: zip});
    assert.equal((await f.run('asset.migrate', {entryId: entry.id})).ok, true);
    assert.equal(readFileSync(join(f.projectDir, 'Content', 'Fab', 'raqueta', 'Nude_Tennis_Racket_🎾', 'scene.uasset'), 'utf8'), 'malla');
    const bad = join(f.root, 'malo.zip');
    writeFileSync(bad, makeZip({'../fuera.txt': 'x'}));
    assert.throws(() => extractZip(bad, join(f.root, 'destino')), /zip_unsafe_path/);
  } finally { f.close(); }
});

test('plantilla del motor: Maniquíes UE5 conservan /Game/Characters/Mannequins y las de combate /Game/Variant_Combat/Anims', async () => {
  const f = assetFixture();
  try {
    process.env.KRATOS_FAKE = 'ok';
    const manny = await f.run('asset.migrate', {entryId: f.entry('Maniquíes UE5 (Manny y Quinn)').id});
    assert.equal(manny.ok, true);
    assert.equal(manny.root, '/Game/Characters');
    assert.ok(existsSync(join(f.projectDir, 'Content', 'Characters', 'Mannequins', 'Meshes', 'SKM_Manny_Simple.uasset')));
    const combat = await f.run('asset.migrate', {entryId: f.entry('Animaciones de combate (plantilla Tercera persona)').id});
    assert.equal(combat.root, '/Game/Variant_Combat/Anims');
    assert.ok(existsSync(join(f.projectDir, 'Content', 'Variant_Combat', 'Anims', 'AM_ComboAttack.uasset')));
    assert.equal(listCatalog(f.db).find(e => e.id === manny.entryId)!.state, 'imported');
  } finally { f.close(); }
});

test('plantilla del motor con destino existente: no sobrescribe, lo dice y verifica lo que hay, sin Decisión', async () => {
  const f = assetFixture();
  try {
    process.env.KRATOS_FAKE = 'ok';
    const mine = join(f.projectDir, 'Content', 'Characters', 'Mannequins', 'Meshes', 'SKM_Manny_Simple.uasset');
    mkdirSync(join(mine, '..'), {recursive: true}); writeFileSync(mine, 'mío');
    const result = await f.run('asset.migrate', {entryId: f.entry('Maniquíes UE5 (Manny y Quinn)').id});
    assert.equal(result.ok, true);
    assert.equal(result.existing, true);
    assert.equal(readFileSync(mine, 'utf8'), 'mío');
    assert.ok(!existsSync(join(f.projectDir, 'Content', 'Characters', 'Mannequins', 'Meshes', 'SKM_Quinn_Simple.uasset')), 'no se mezcla con la carpeta existente');
    assert.deepEqual(listDecisions(f.db, 'open'), []);
    const run = f.db.prepare('select summary from runs order by rowid desc limit 1').get() as {summary: string};
    assert.match(run.summary, /ya existía en Juego; no se sobrescribe/);
  } finally { f.close(); }
});

/** ZIP mínimo con deflate y nombres UTF-8 (bit 11), como los que escribe el plugin. */
function makeZip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = Buffer.from(name, 'utf8'), data = deflateRawSync(Buffer.from(text));
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(text.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0x800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(text.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data); centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

test('preset MetaHuman de Megascans: copia MetaHumans/<Nombre> y Common sin pisar el Common que ya hay', async () => {
  const f = assetFixture();
  try {
    process.env.KRATOS_FAKE = 'ok';
    const hudson = await f.run('asset.migrate', {entryId: f.entry('Hudson').id});
    assert.equal(hudson.ok, true, JSON.stringify(hudson));
    assert.equal(hudson.root, '/Game/MetaHumans/Hudson');
    assert.ok(existsSync(join(f.projectDir, 'Content', 'MetaHumans', 'Hudson', 'BP_Hudson.uasset')));
    const common = join(f.projectDir, 'Content', 'MetaHumans', 'Common', 'Common', 'MetaHuman_ControlRig.uasset');
    assert.equal(readFileSync(common, 'utf8'), '4dlykISk');
    const emory = await f.run('asset.migrate', {entryId: f.entry('Emory').id});
    assert.equal(emory.ok, true);
    assert.ok(existsSync(join(f.projectDir, 'Content', 'MetaHumans', 'Emory', 'BP_Emory.uasset')));
    assert.equal(readFileSync(common, 'utf8'), '4dlykISk', 'el Common compartido no se sobrescribe');
    assert.deepEqual(listDecisions(f.db, 'open'), []);
  } finally { f.close(); }
});
