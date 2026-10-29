import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { identity, listPeers, publishCard, teamTick, type TeamTick } from '../../service/src/team.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { teamFixture } from './team-fixture.ts';

const fresh = (): TeamTick => ({pushedAt: 0, fetchedAt: 0, warned: false});

test('equipo: dos Nomos sobre un remoto bare se ven, team.joined una vez y cada archivo lo escribe solo su dueño', async () => {
  const f = teamFixture();
  try {
    const a = f.clone('Richard', 'combate'), b = f.clone('Ana', 'UI'), sa = fresh(), sb = fresh();
    createTask(a.db, {title: 'Barra de vida', area: 'ui'});
    await teamTick(a.db, a.dataDir, a.dir, sa);
    await teamTick(b.db, b.dataDir, b.dir, sb);
    await teamTick(a.db, a.dataDir, a.dir, sa, Date.now() + 61_000);
    assert.deepEqual(listPeers(a.db).map(p => [p.name, p.frente, p.present]), [['Ana', 'UI', true]]);
    assert.deepEqual(listPeers(b.db).map(p => [p.name, p.frente, p.tasks.map(t => t.title)]), [['Richard', 'combate', ['Barra de vida']]]);
    // más pases: sin anuncios repetidos
    await teamTick(b.db, b.dataDir, b.dir, sb, Date.now() + 61_000);
    await teamTick(a.db, a.dataDir, a.dir, sa, Date.now() + 122_000);
    assert.deepEqual(a.events('team.joined').map(e => e.name), ['Ana']);
    assert.deepEqual(b.events('team.joined').map(e => e.name), ['Richard']);
    // la rama de equipo: un archivo por persona; los commits de cada archivo, solo de su dueño; main sin tocar
    const ids = {Richard: identity(a.dataDir).id, Ana: identity(b.dataDir).id};
    assert.deepEqual(f.git(f.bare, 'ls-tree', '--name-only', 'nomos/equipo', 'equipo/').split('\n').sort(), [`equipo/${ids.Ana}.json`, `equipo/${ids.Richard}.json`].sort());
    for (const [name, id] of Object.entries(ids))
      assert.deepEqual([...new Set(f.git(f.bare, 'log', '--format=%an', 'nomos/equipo', '--', `equipo/${id}.json`).split('\n'))], [name]);
    assert.equal(f.git(f.bare, 'log', '--oneline', 'master').split('\n').length, 1, 'main sin commits de sincronización');
    assert.equal(f.git(a.dir, 'status', '--porcelain'), '', 'el clon de la persona no se toca');
    assert.match(readFileSync(join(a.dataDir, 'identity.json'), 'utf8'), new RegExp(ids.Richard));
  } finally { f.close(); }
});

test('equipo: un peer sin latido en 30 min aparece ausente; quien sale de la rama desaparece con team.left', async () => {
  const f = teamFixture();
  try {
    const a = f.clone('Richard', 'combate'), b = f.clone('Ana', 'UI'), sa = fresh(), sb = fresh();
    await teamTick(b.db, b.dataDir, b.dir, sb, Date.now() - 31 * 60_000);
    await teamTick(a.db, a.dataDir, a.dir, sa);
    assert.deepEqual(listPeers(a.db).map(p => p.present), [false]);
    await publishCard(b.dir, b.dataDir, identity(b.dataDir).id, null);
    await teamTick(a.db, a.dataDir, a.dir, sa, Date.now() + 61_000);
    assert.deepEqual(listPeers(a.db), []);
    assert.deepEqual(a.events('team.left').map(e => e.name), ['Ana']);
  } finally { f.close(); }
});

test('equipo sin remoto: team.unavailable una sola vez y lo local sigue', async () => {
  const f = teamFixture();
  try {
    const a = f.clone('Solo', 'todo', false), s = fresh();
    await teamTick(a.db, a.dataDir, a.dir, s);
    await teamTick(a.db, a.dataDir, a.dir, s, Date.now() + 61_000);
    assert.equal(a.events('team.unavailable').length, 1);
    assert.equal(createTask(a.db, {title: 'Sigue', area: 'gameplay'}).title, 'Sigue');
  } finally { f.close(); }
});
