import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openDb } from '../../service/src/db.ts';
import { createServer } from '../../service/src/server.ts';
import { claim, enqueue } from '../../service/src/commands.ts';
import { checkCapability, doctor, necessary, optional, renderDoctor, renderRequirements } from '../../service/src/doctor.ts';
import { defaultMemoryCommand } from '../../service/src/config.ts';
import { capabilityList, saveCheck } from '../../service/src/capability-checks.ts';
import { removeDir } from '../remove-dir.ts';

const orca = (running: boolean, onOpen = () => {}) => ({isRunning: async () => running, open: async () => { onOpen(); }});

test('comprobación real por capacidad: Node, Orca (abre si está cerrado), Git, Meshy y Unreal por Build.version', async () => {
  assert.equal((await checkCapability('node', {})).state, 'comprobado');
  let opened = 0;
  assert.deepEqual(await checkCapability('orca', {orca: orca(false, () => opened++)}), {state: 'roto', detail: 'Orca no está abierto'});
  assert.equal(opened, 1, '«Abrir Orca» ejecuta orca open antes de volver a mirar');
  assert.equal((await checkCapability('orca', {orca: orca(true)})).state, 'comprobado');
  assert.match((await checkCapability('git', {})).detail, /^git version/);
  assert.deepEqual(await checkCapability('meshy', {env: {}}), {state: 'ausente', detail: 'Falta MESHY_API_KEY'});
  assert.deepEqual(await checkCapability('meshy', {env: {MESHY_API_KEY: 'k'}, meshy: {balance: async () => 120}}),
    {state: 'comprobado', detail: 'Saldo de Meshy: 120 créditos'});
  assert.equal((await checkCapability('meshy', {env: {MESHY_API_KEY: 'k'}, meshy: {balance: async () => { throw new Error('401'); }}})).state, 'roto');
  assert.equal((await checkCapability('unreal', {unrealPath: 'C:/no/existe/UnrealEditor-Cmd.exe'})).state, 'ausente');
  await assert.rejects(checkCapability('inventada', {}), /unknown_capability/);
});

test('el resultado guardado gana a la detección, con fecha; Orca roto lleva la acción «Abrir Orca»', () => {
  const root = mkdtempSync(join(tmpdir(), 'nomos-doctor-')), dataDir = join(root, '.nomos'); mkdirSync(dataDir);
  const db = openDb(join(dataDir, 'nomos.db'));
  try {
    saveCheck(db, 'git', {state: 'comprobado', detail: 'git version 2.50'}, new Date('2026-10-23T10:00:00Z'));
    saveCheck(db, 'orca', {state: 'roto', detail: 'Orca no está abierto'});
    const list = capabilityList(dataDir, db);
    const git = list.find(c => c.id === 'git')!;
    assert.equal(git.state, 'comprobado');
    assert.equal(git.checkedAt, '2026-10-23T10:00:00.000Z');
    const orcaRow = list.find(c => c.id === 'orca')!;
    assert.equal(orcaRow.state, 'roto');
    assert.deepEqual(orcaRow.action, {id: 'open', label: 'Abrir Orca'});
  } finally { db.close(); removeDir(root); }
});

test('nomos doctor: tabla con capacidades, servicio sin mostrar el token y carriles con su último latido', async () => {
  const root = mkdtempSync(join(tmpdir(), 'nomos-doctor-')), dataDir = join(root, '.nomos'); mkdirSync(dataDir);
  const db = openDb(join(dataDir, 'nomos.db'));
  try {
    enqueue(db, 'checks.run', {}, 'build'); claim(db, 'runner:1:x', 'long');
    const rows = await doctor(dataDir, db, {orca: orca(false)});
    const ids = rows.map(r => r.id);
    for (const id of ['node', 'orca', 'unreal', 'unreal_mcp', 'fab_plugin', 'launcher', 'meshy', 'blender', 'git', 'service', 'lane:normal', 'lane:long'])
      assert.ok(ids.includes(id), `falta ${id}`);
    assert.equal(rows.find(r => r.id === 'orca')!.state, 'aviso', 'hito 30: Orca es opcional');
    assert.equal(rows.find(r => r.id === 'service')!.detail, 'Servicio detenido');
    assert.match(rows.find(r => r.id === 'lane:long')!.detail, /^checks\.run · último latido hace \d+ s$/);
    assert.equal(rows.find(r => r.id === 'lane:normal')!.detail, 'Libre');
    const text = renderDoctor(rows);
    assert.match(text, /Orca\s+AVISO/);
    // hito 30: la suite fija NOMOS_LAUNCHER=orca; en `auto` con Orca cerrado, proceso
    assert.equal(rows.find(r => r.id === 'workers')!.detail, 'Orca');
    const saved = process.env.NOMOS_LAUNCHER; delete process.env.NOMOS_LAUNCHER;
    try { assert.match((await doctor(dataDir, db, {orca: orca(false)})).find(r => r.id === 'workers')!.detail, /^proceso/); }
    finally { if (saved !== undefined) process.env.NOMOS_LAUNCHER = saved; }
    assert.ok(text.split('\n').length >= rows.length + 1);
  } finally { db.close(); removeDir(root); }
});

test('GET /doctor y POST /capabilities/:id/check exigen token; la comprobación queda guardada', async t => {
  const root = mkdtempSync(join(tmpdir(), 'nomos-doctor-')), dataDir = join(root, '.nomos'); mkdirSync(dataDir);
  const db = openDb(join(dataDir, 'nomos.db')), server = createServer(db, 'token', 'service/web', dataDir);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); removeDir(root); });
  const base = `http://127.0.0.1:${(server.address() as {port: number}).port}`, auth = {Authorization: 'Bearer token'};
  assert.equal((await fetch(base + '/doctor')).status, 401);
  assert.equal((await fetch(base + '/capabilities/node/check', {method: 'POST'})).status, 401);
  const checked = await fetch(base + '/capabilities/node/check', {method: 'POST', headers: auth});
  assert.equal(checked.status, 200);
  assert.equal((await checked.json()).state, 'comprobado');
  assert.equal(db.prepare("select state from capability_checks where id='node'").get()!.state, 'comprobado');
  assert.equal((await fetch(base + '/capabilities/inventada/check', {method: 'POST', headers: auth})).status, 404);
  const report = await (await fetch(base + '/doctor', {headers: auth})).json();
  assert.ok(Array.isArray(report.rows));
  assert.ok(!JSON.stringify(report).includes('"token"'));
});

test('hito 30: doctor con PATH vacío dice qué falta (Necesario) y qué se pierde (Opcional); con todo presente, nada falta', async () => {
  const root = mkdtempSync(join(tmpdir(), 'nomos-doctor-')), dataDir = join(root, '.nomos'); mkdirSync(dataDir);
  try {
    const empty = {env: {PATH: '', Path: '', USERPROFILE: root, HOME: root, NOMOS_GRAPHIFY: 'off', CLAUDE_CONFIG_DIR: root}, unrealPath: join(root, 'no.exe'), orca: orca(false), ffmpeg: null};
    const needed = await necessary(dataDir, empty), extra = await optional(dataDir, empty);
    assert.deepEqual(needed.map(r => [r.name, r.present]), [['Git', false], ['Node ≥ 25', true], ['Claude Code', false], ['Unreal', false]]);
    assert.ok(extra.every(r => !r.present), JSON.stringify(extra));
    assert.match(renderRequirements('Opcional', extra), /Second Brain\s+ausente\s+brain\.py no encontrado · memoria apagada/);
    assert.equal(defaultMemoryCommand(empty.env), null, 'sin brain.py la memoria queda apagada');

    const brain = join(root, 'sb', '.system'), editor = join(root, 'UnrealEditor-Cmd.exe'), graphify = join(root, 'graphify.exe');
    mkdirSync(brain, {recursive: true}); writeFileSync(join(brain, 'brain.py'), ''); writeFileSync(editor, ''); writeFileSync(graphify, '');
    writeFileSync(join(root, 'settings.json'), JSON.stringify({enabledPlugins: {'ponytail@ponytail': true}}));
    const full = {env: {...process.env, SECOND_BRAIN_ROOT: join(root, 'sb'), NOMOS_GRAPHIFY: graphify, CLAUDE_CONFIG_DIR: root},
      unrealPath: editor, orca: orca(true), ffmpeg: {bin: 'ffmpeg'}};
    assert.deepEqual([...await necessary(dataDir, full), ...await optional(dataDir, full)].filter(r => !r.present).map(r => r.name), []);
    assert.equal(defaultMemoryCommand(full.env)!.at(-1), join(brain, 'brain.py'));
  } finally { removeDir(root); }
});

test('hito 30: nomos start sin lo necesario no arranca y dice qué falta', () => {
  const root = mkdtempSync(join(tmpdir(), 'nomos-doctor-'));
  try {
    const result = spawnSync(process.execPath, [join(import.meta.dirname, '../../service/src/cli.ts'), 'start', '--no-open', '--data', join(root, '.nomos')],
      {encoding: 'utf8', windowsHide: true, env: {...process.env, PATH: '', Path: ''}});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Falta lo necesario para Nomos: Git .*Claude Code/);
  } finally { removeDir(root); }
});
