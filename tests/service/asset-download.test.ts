import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { upsertEntry } from '../../service/src/repo/catalog.ts';
import { listDecisions } from '../../service/src/repo/decisions.ts';
import { listEvents } from '../../service/src/store.ts';
import { assetFixture } from './asset-fixture.ts';
import { fixture } from './route-fixture.ts';

const real = readFileSync(join(import.meta.dirname, '..', 'fixtures', 'fab', 'launcher-complete.log'), 'utf8');
function setup() {
  let clock = Date.parse('2026-10-23T18:00:00Z'), opened = 0;
  const f = assetFixture({launcher: {openFab: () => { opened++; }}, now: () => clock});
  writeFileSync(f.config.launcherLogPath, '[2026.10.23-17.59.00:000][1]LogInit: arranque\n');
  const wanted = upsertEntry(f.db, {name: 'Stylized Crate Pack', category: 'pack', description: '', source: 'fab', state: 'owned', fabUid: 'crate-uid'});
  return {f, wanted, tick: (ms: number) => { clock += ms; }, opened: () => opened};
}
const types = (f: {db: any}) => listEvents(f.db, 0).map(e => e.type);

test('request_download abre el Launcher, da instrucciones con el proyecto cuarentena y encola asset.detect', async () => {
  const {f, wanted, opened} = setup();
  try {
    const result = await f.run('asset.request_download', {entryId: wanted.id});
    assert.equal(opened(), 1);
    assert.match(result.instructions, /busca "Stylized Crate Pack".*elige el proyecto KratosFabTest › Add to Project; si dice "No compatible user projects", Show all projects y elige 5\.4/);
    assert.equal(f.db.prepare('select type from commands where idempotency_key=?').get(`detect:${result.downloadId}`)!.type, 'asset.detect');
    assert.equal((await f.run('asset.request_download', {entryId: wanted.id})).downloadId, result.downloadId, 'una sola descarga pendiente por asset');
  } finally { f.close(); }
});

test('detect cierra con el log real del Launcher, indexa y encola la migración', async () => {
  const {f, wanted} = setup();
  try {
    const {downloadId} = await f.run('asset.request_download', {entryId: wanted.id});
    assert.equal((await f.run('asset.detect', {downloadId})).deferred, true);
    appendFileSync(f.config.launcherLogPath, real);
    assert.deepEqual(await f.run('asset.detect', {downloadId}), {state: 'completed', by: 'log'});
    assert.ok(types(f).includes('download.completed'));
    assert.equal(f.db.prepare('select type from commands where idempotency_key=?').get(`migrate:${wanted.id}:juego`)!.type, 'asset.migrate');
  } finally { f.close(); }
});

test('StarterContent nuevo no cierra; un pack nuevo cierra tras 30 s sin cambios en VaultCache', async () => {
  const {f, wanted, tick} = setup();
  try {
    const {downloadId} = await f.run('asset.request_download', {entryId: wanted.id});
    const app = join(f.vaultDir, 'CrateApp', 'data', 'Content');
    mkdirSync(join(app, 'StarterContent'), {recursive: true}); writeFileSync(join(app, 'StarterContent', 'a.uasset'), 'x');
    tick(60_000);
    assert.equal((await f.run('asset.detect', {downloadId})).deferred, true, 'StarterContent nunca cuenta');
    mkdirSync(join(app, 'CratePack'), {recursive: true}); writeFileSync(join(app, 'CratePack', 'SM_Crate.uasset'), 'x');
    assert.equal((await f.run('asset.detect', {downloadId})).deferred, true, 'aparece el pack: empieza la ventana de 30 s');
    tick(20_000); writeFileSync(join(app, 'CratePack', 'T_Crate.uasset'), 'sigue copiando');
    assert.equal((await f.run('asset.detect', {downloadId})).deferred, true, 'cambió: la ventana vuelve a empezar');
    tick(29_000);
    assert.equal((await f.run('asset.detect', {downloadId})).deferred, true);
    tick(2_000);
    assert.deepEqual(await f.run('asset.detect', {downloadId}), {state: 'completed', by: 'vaultcache'});
  } finally { f.close(); }
});

test('20 minutos sin llegada: download.timeout y Decisión Reintentar/Cancelar', async () => {
  const {f, wanted, tick} = setup();
  try {
    const {downloadId} = await f.run('asset.request_download', {entryId: wanted.id});
    tick(20 * 60_000);
    assert.deepEqual(await f.run('asset.detect', {downloadId}), {state: 'timeout'});
    assert.ok(types(f).includes('download.timeout'));
    assert.deepEqual(listDecisions(f.db, 'open')[0].options.map(o => o.label), ['Reintentar', 'Cancelar']);
    assert.deepEqual(await f.run('asset.detect', {downloadId}), {state: 'timeout'});
  } finally { f.close(); }
});

test('GET /downloads lista por estado y «Ya lo añadí» adelanta la comprobación', async () => {
  const f = await fixture();
  try {
    const entry = upsertEntry(f.db, {name: 'Crate', category: 'pack', description: '', source: 'fab'});
    const now = new Date().toISOString(), detail = JSON.stringify({taskId: 't', instructions: 'Fab › My Library'});
    for (const [id, state] of [['d1', 'pending'], ['d2', 'completed']])
      f.db.prepare('insert into downloads(id,created_at,updated_at,entry_id,state,requested_at,detail) values(?,?,?,?,?,?,?)').run(id, now, now, entry.id, state, now, detail);
    f.db.prepare(`insert into commands(id,created_at,updated_at,type,payload,idempotency_key,state,attempts,not_before)
      values('c','x','x','asset.detect','{}','detect:d1','pending',0,'2999-01-01')`).run();
    const pending = await (await f.request('/downloads?state=pending')).json();
    assert.deepEqual(pending.map((d: any) => [d.id, d.name, d.instructions]), [['d1', 'Crate', 'Fab › My Library']]);
    assert.equal((await (await f.request('/downloads')).json()).length, 2);
    assert.equal((await f.request('/downloads?state=raro')).status, 400);
    const check = await (await f.request('/downloads/d1/check', {})).json();
    assert.equal(check.checking, true);
    assert.equal(f.db.prepare("select not_before from commands where id='c'").get()!.not_before, null);
    assert.equal((await f.request('/downloads/nadie/check', {})).status, 404);
  } finally { await f.close(); }
});
