// Compatibilidad con el nombre anterior (Kratos, hasta el 2026-10-24). scripts/renombrar-nomos.mjs no toca este archivo.
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dataDirFor, dbFile, legacyEnv, legacyRegistry } from '../../service/src/legacy.ts';
import { openDb } from '../../service/src/db.ts';
import { screenMarkers, streamMarkers } from '../../service/src/handlers/worker-markers.ts';
import { start } from '../../service/src/server.ts';
import { createGit } from '../../service/src/adapters/git.ts';
import { gameRepo } from './integration-fixture.ts';
import { gameSkills, installSkills } from '../../service/src/skills-install.ts';
import { readSpec } from '../../service/src/checks/animation.ts';
import { selectChecks } from '../../service/src/checks/select.ts';
import { readServiceInfo } from '../../service/src/service-info.ts';

function folder(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'nomos-legacy-'));
  t.after(() => rmSync(root, {recursive: true, force: true, maxRetries: 5}));
  return root;
}
/** Para el servicio y espera a que retire su service.json (antes de que folder() borre la carpeta). */
async function stop(dataDir: string, live: {port: number; token: string}) {
  await fetch(`http://127.0.0.1:${live.port}/admin/stop`, {method: 'POST', headers: {Authorization: `Bearer ${live.token}`}});
  for (let i = 0; i < 100 && readServiceInfo(dataDir)?.token === live.token; i++) await new Promise(r => setTimeout(r, 50));
}

test('KRATOS_* se lee como NOMOS_* si falta, sin pisar el nuevo, y avisa de cada nombre viejo', () => {
  const env: Record<string, string | undefined> = {KRATOS_FAKE: 'hang', KRATOS_REGISTRY: 'viejo', NOMOS_REGISTRY: 'nuevo', PATH: 'x'};
  assert.deepEqual(legacyEnv(env).sort(), ['KRATOS_FAKE', 'KRATOS_REGISTRY']);
  assert.equal(env.NOMOS_FAKE, 'hang');
  assert.equal(env.NOMOS_REGISTRY, 'nuevo');
  assert.deepEqual(legacyEnv({PATH: 'x'}), []);
});

test('.kratos se migra a .nomos con el servicio parado: carpeta, kratos.db → nomos.db y migrated_from en service.json', async t => {
  const game = folder(t), old = join(game, '.kratos');
  mkdirSync(old); const db = openDb(join(old, 'kratos.db')); db.exec("insert into messages(id,text,origin,created_at) values ('m1','hola','panel','2026-10-24')"); db.close();
  writeFileSync(join(old, 'service.json'), JSON.stringify({pid: 999999, port: 1, token: 'viejo', startedAt: 'ayer'}));
  const dir = await dataDirFor(join(game, '.nomos'));
  assert.equal(dir, join(game, '.nomos'));
  assert.equal(existsSync(old), false);
  assert.equal(existsSync(join(dir, 'kratos.db')), false);
  const moved = new DatabaseSync(join(dir, 'nomos.db'));
  assert.equal(moved.prepare('select text from messages').get()?.text, 'hola'); moved.close();
  assert.equal(JSON.parse(readFileSync(join(dir, 'service.json'), 'utf8')).migrated_from, old);
  // start conserva la nota de la migración junto al puerto y el token nuevos
  const live = await start({dataDir: dir, port: 0});
  try {
    assert.equal(JSON.parse(readFileSync(join(dir, 'service.json'), 'utf8')).migrated_from, old);
    assert.equal(readServiceInfo(dir)?.token, live.token);
  } finally { await stop(dir, live); }
  // ya migrada: no se toca nada más
  assert.equal(await dataDirFor(join(game, '.nomos')), dir);
});

test('.kratos con su servicio vivo no se mueve: se usa tal cual hasta el próximo arranque tras parar', async t => {
  const game = folder(t), old = join(game, '.kratos');
  mkdirSync(old); openDb(join(old, 'kratos.db')).close();
  const live = await start({dataDir: old, port: 0});
  try {
    assert.equal(await dataDirFor(join(game, '.nomos')), old);
    assert.equal(existsSync(join(game, '.nomos')), false);
    assert.equal(dbFile(old), join(old, 'kratos.db'), 'el servicio vivo sigue con su kratos.db');
  } finally { await stop(old, live); }
});

test('--data acepta cualquier carpeta: .kratos-hito5b-lfs sigue con su nombre y solo su base pasa a nomos.db', async t => {
  const game = folder(t), data = join(game, '.kratos-hito5b-lfs');
  mkdirSync(data); openDb(join(data, 'kratos.db')).close();
  assert.equal(await dataDirFor(data), data);
  assert.equal(existsSync(join(data, 'nomos.db')), true);
  assert.equal(existsSync(join(data, 'kratos.db')), false);
  assert.equal(dbFile(data), join(data, 'nomos.db'));
});

test('registro: %LOCALAPPDATA%\\kratos\\projects.json se copia a ...\\nomos\\ si falta; NOMOS_REGISTRY manda', t => {
  const local = folder(t), old = join(local, 'kratos', 'projects.json');
  mkdirSync(join(local, 'kratos')); writeFileSync(old, '[{"name":"BlockKings"}]');
  const file = legacyRegistry({LOCALAPPDATA: local});
  assert.equal(file, join(local, 'nomos', 'projects.json'));
  assert.equal(readFileSync(file, 'utf8'), '[{"name":"BlockKings"}]');
  writeFileSync(file, '[]');
  assert.equal(readFileSync(legacyRegistry({LOCALAPPDATA: local}), 'utf8'), '[]', 'una vez migrado no se vuelve a copiar');
  assert.equal(legacyRegistry({LOCALAPPDATA: local, NOMOS_REGISTRY: 'x.json'}), 'x.json');
});

test('marcadores: el servicio acepta NOMOS_* y los KRATOS_* de los workers lanzados con el brief viejo', () => {
  const done = (p: string) => `${p}_DONE {"summary":"Real","commits":["abc"],"tests":"passed"}`;
  const expected = [{kind: 'DONE', summary: 'Real', commits: ['abc'], tests: 'passed'}];
  for (const prefix of ['NOMOS', 'KRATOS']) {
    assert.deepEqual(streamMarkers([done(prefix)], '').found, expected, prefix);
    assert.deepEqual(screenMarkers(['• ' + done(prefix)]), expected, prefix);
    assert.deepEqual(streamMarkers([`${prefix}_ASK {"question":"¿Sigo?"}`], '').found, [{kind: 'ASK', question: '¿Sigo?'}]);
    assert.deepEqual(screenMarkers([`• ${prefix}_REVIEW {"approved":true,"findings":[]}`]), [{kind: 'REVIEW', approved: true, findings: []}]);
    assert.deepEqual(screenMarkers([`• ${prefix}_SKILLS ["ue-umg-ui"]`]), [{kind: 'SKILLS', skills: ['ue-umg-ui']}]);
    assert.deepEqual(streamMarkers([`${prefix}_DONE {"summary":"Pa`, `rtido","commits":[],"tests":"none"}`], '').found,
      [{kind: 'DONE', summary: 'Partido', commits: [], tests: 'none'}], `${prefix} partido en dos líneas`);
  }
});

test('base vieja: runs, tareas y Decisiones con «kratos» pasan a «nomos» al abrirla; nomos cabe en el check', t => {
  const dir = folder(t), file = join(dir, 'nomos.db');
  const db = openDb(file);
  // esquema anterior: el check de runs.provider decía 'kratos' y no 'nomos'
  db.exec(`drop table runs; create table runs(id text primary key, created_at text not null, updated_at text not null,
    task_id text not null, role text not null,
    provider text not null check(provider in ('codex','claude','meshy','blender','unreal','kratos','opencode')),
    model text, session_ref text, attempt integer not null,
    state text not null check(state in ('running','done','failed','cancelled')),
    started_at text not null, finished_at text, summary text, skills text not null, metadata text not null default '{}')`);
  db.exec(`insert into runs(id,created_at,updated_at,task_id,role,provider,attempt,state,started_at,skills)
    values ('r1','a','a','t1','integrador','kratos',1,'done','a','[]')`);
  db.exec(`insert into tasks(id,created_at,updated_at,title,spec,acceptance,state,area,assignee_provider,depends_on,attribution)
    values ('t1','a','a','Descargar','s','a','done','assets','kratos','[]','{"verifico":[{"provider":"kratos","agentName":"Kratos"}]}')`);
  db.close();
  const again = openDb(file);
  try {
  assert.equal(again.prepare("select provider from runs where id='r1'").get()?.provider, 'nomos');
  assert.equal(again.prepare("select assignee_provider p from tasks where id='t1'").get()?.p, 'nomos');
  assert.equal(again.prepare("select attribution a from tasks where id='t1'").get()?.a, '{"verifico":[{"provider":"nomos","agentName":"Nomos"}]}');
  again.exec(`insert into runs(id,created_at,updated_at,task_id,role,provider,attempt,state,started_at,skills)
    values ('r2','a','a','t1','integrador','nomos',1,'done','a','[]')`);
  } finally { again.close(); }
});

test('CLI: kratos.ts delega en nomos y avisa «kratos ahora se llama nomos»; nomos.ts no avisa', t => {
  const dir = folder(t), scripts = join(import.meta.dirname, '../../skills/nomos/scripts');
  const run = (name: string) => spawnSync(process.execPath, [join(scripts, name), 'desconocido', '--data', dir], {encoding: 'utf8', windowsHide: true});
  const old = run('kratos.ts'), fresh = run('nomos.ts');
  assert.match(old.stderr, /kratos ahora se llama nomos/);
  assert.match(old.stderr, /Uso: nomos start/);
  assert.equal(old.status, fresh.status);
  assert.doesNotMatch(fresh.stderr, /kratos/i);
});

test('worktrees de workers lanzados con el brief viejo: .kratos-brief.md, .kratos-inbox y .kratos-review no son trabajo del worker', async () => {
  const repo = gameRepo(), git = createGit();
  try {
    const tree = repo.tree('viejo', {'a.txt': 'a\n'});
    writeFileSync(join(tree.path, '.kratos-brief.md'), 'brief');
    for (const dir of ['.kratos-inbox', '.kratos-review', '.kratos']) { mkdirSync(join(tree.path, dir)); writeFileSync(join(tree.path, dir, 'x.md'), 'x'); }
    assert.equal((await git.status(tree.path)).clean, true);
    writeFileSync(join(tree.path, 'b.txt'), 'b\n');
    assert.deepEqual(await git.status(tree.path), {clean: false, files: ['b.txt']});
  } finally { repo.close(); }
});

test('skills instaladas por Kratos (.kratos-skill.json) se actualizan como propias, no como copias modificadas a mano', t => {
  const root = folder(t), source = join(root, 'skills'), game = join(root, 'juego');
  for (const name of gameSkills) { mkdirSync(join(source, name), {recursive: true}); writeFileSync(join(source, name, 'SKILL.md'), 'v1'); }
  installSkills(game, source);
  for (const name of gameSkills) {
    const dest = join(game, '.claude', 'skills', name);
    renameSync(join(dest, '.nomos-skill.json'), join(dest, '.kratos-skill.json'));
    writeFileSync(join(source, name, 'SKILL.md'), 'v2');
  }
  assert.deepEqual(installSkills(game, source).map(r => r.action), gameSkills.map(() => 'updated'));
  for (const name of gameSkills) {
    const dest = join(game, '.claude', 'skills', name);
    assert.equal(readFileSync(join(dest, 'SKILL.md'), 'utf8'), 'v2');
    assert.equal(existsSync(join(dest, '.kratos-skill.json')), false);
    assert.equal(existsSync(join(dest, '.nomos-skill.json')), true);
  }
});

test('la ficha kratos-personaje.json que ya está en los juegos se sigue leyendo y sigue pidiendo la comprobación animation', t => {
  const game = folder(t);
  writeFileSync(join(game, 'kratos-personaje.json'), '{"mesh":"/Game/Viejo"}');
  assert.equal(readSpec(game)?.mesh, '/Game/Viejo');
  writeFileSync(join(game, 'nomos-personaje.json'), '{"mesh":"/Game/Nuevo"}');
  assert.equal(readSpec(game)?.mesh, '/Game/Nuevo', 'la nueva manda');
  assert.deepEqual(selectChecks(['kratos-personaje.json']), selectChecks(['nomos-personaje.json']));
  assert.ok(selectChecks(['kratos-personaje.json']).includes('animation'));
});
