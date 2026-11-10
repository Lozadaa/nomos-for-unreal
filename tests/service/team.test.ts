import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { stampBuild } from '../../service/src/build-info.ts';
import { appendEvent } from '../../service/src/store.ts';
import { join } from 'node:path';
import { identity, listPeers, myCard, publishCard, recordPeers, teamText, teamTick, type Card, type Peer, type TeamTick } from '../../service/src/team.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { finishRun, startRun } from '../../service/src/repo/runs.ts';
import { teamFixture } from './team-fixture.ts';
import { renderResume } from '../../service/src/resume.ts';
import { listMessages } from '../../service/src/chat.ts';

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

test('equipo: el campo build de la tarjeta es la build estampada que el usuario aprobó', async () => {
  const f = teamFixture();
  try {
    const a = f.clone('Richard', 'combate'), dir = join(a.dir, 'Build', 'Windows-actual');
    mkdirSync(dir, {recursive: true}); writeFileSync(join(dir, 'Juego.exe'), 'MZ');
    stampBuild(dir, a.dir);
    assert.equal(myCard(a.db, a.dataDir).build, null, 'sin aprobar no cuenta');
    appendEvent(a.db, 'approval.approved', null, {approvalId: 'x', taskId: 'y'});
    assert.equal(myCard(a.db, a.dataDir).build?.commit, f.git(a.dir, 'rev-parse', 'HEAD'));
  } finally { f.close(); }
});

test('equipo: team ask viaja en mi tarjeta y llega al director del otro como mensaje firmado; status y reanudación traen la tabla', async () => {
  const f = teamFixture();
  try {
    const a = f.clone('Richard', 'combate'), b = f.clone('Ana', 'audio'), sa = fresh(), sb = fresh();
    appendEvent(a.db, 'team.ask', null, {to: 'Ana', title: 'Falta el sonido del golpe', text: 'Falta el sonido del golpe', at: new Date().toISOString()});
    await teamTick(a.db, a.dataDir, a.dir, sa);
    await teamTick(b.db, b.dataDir, b.dir, sb);
    await teamTick(b.db, b.dataDir, b.dir, sb, Date.now() + 61_000);
    assert.deepEqual(b.db.prepare("select text,origin from messages").all().map(m => [m.text, m.origin]), [['Richard (combate): Falta el sonido del golpe', 'equipo']]);
    assert.equal(b.events('message.received').length, 1, 'una sola entrega aunque la tarjeta se vuelva a traer');
    // hito 27: el panel firma el mensaje con quien lo manda, no «Tú»
    assert.deepEqual([listMessages(b.db)[0].from, listMessages(b.db)[0].text], ['Richard (combate)', 'Falta el sonido del golpe']);
    assert.match(renderResume(b.db, b.dataDir, 'parado'), /## Equipo[\s\S]*\| Richard \| combate \| sí \| 0 \|/);
  } finally { f.close(); }
});

test('equipo: la tarjeta lleva las 5 últimas tareas hechas, la más reciente primero, con el resumen del NOMOS_DONE', () => {
  const f = teamFixture();
  try {
    const a = f.clone('Richard', 'combate');
    for (let i = 1; i <= 7; i++) {
      const t = createTask(a.db, {title: `Hecha ${i}`, area: 'gameplay', state: 'done'});
      a.db.prepare('update tasks set updated_at=? where id=?').run(`2026-11-10T10:0${i}:00.000Z`, t.id);
      finishRun(a.db, startRun(a.db, {taskId: t.id, role: 'implementacion', provider: 'claude'}).id, 'done', `Resumen ${i}`);
      finishRun(a.db, startRun(a.db, {taskId: t.id, role: 'revisor', provider: 'claude'}).id, 'done', 'Aprobada');
    }
    const card = myCard(a.db, a.dataDir);
    assert.deepEqual(card.done!.map(d => [d.title, d.summary, d.at]), [7, 6, 5, 4, 3].map(i => [`Hecha ${i}`, `Resumen ${i}`, `2026-11-10T10:0${i}:00.000Z`]));
    assert.deepEqual(card.tasks, [], 'las hechas no cuentan como abiertas');
  } finally { f.close(); }
});

test('equipo: una tarjeta de un Nomos viejo, sin done ni main, se lee igual y sale con done vacío', () => {
  const f = teamFixture();
  try {
    const a = f.clone('Richard', 'combate');
    const old = {id: 'viejo123', name: 'Ana', frente: 'UI', updatedAt: new Date().toISOString(), tasks: [], leases: [], decisions: [], build: null, requests: []};
    recordPeers(a.db, a.dataDir, [old as unknown as Card]);
    const [peer] = listPeers(a.db);
    assert.equal(peer.name, 'Ana');
    assert.deepEqual(peer.done, []);
    assert.equal(peer.main, null);
  } finally { f.close(); }
});

test('nomos equipo: una persona por bloque, haciendo y hecho solo si hay algo, y quién va por detrás de main', () => {
  const now = new Date(2026, 10, 10, 16, 0).getTime(), at = (min: number) => new Date(now - min * 60_000).toISOString();
  const base = {leases: [], decisions: [], build: null, requests: [], tasks: [], done: []};
  const me: Card = {...base, id: 'r1', name: 'Richard', frente: 'combate', updatedAt: at(0), main: {commit: '4e3fa41c0ffee', at: at(5)},
    tasks: [{id: 't1', title: 'Lanzamiento de la brasa', state: 'implementando', area: 'gameplay'}, {id: 't2', title: 'Luces', state: 'preparada', area: 'escenarios'}],
    leases: [{path: 'Content/Mapas/L_Patio.umap', taskId: 't1', until: new Date(2026, 10, 10, 16, 40).toISOString(), at: at(10)}],
    done: [{id: 't0', title: 'Sombras que nacen en los bordes', summary: 'Las sombras nacen en los bordes', at: at(12)}, {id: 'tx', title: 'Antigua', summary: '', at: at(90)}]};
  const ana: Peer = {...base, id: 'a1', name: 'Ana', frente: 'UI', updatedAt: at(40), main: {commit: '9ab948d00000', at: at(50)}, present: false};
  assert.equal(teamText(me, [ana], {r1: 0, a1: 2}, now), [
    'Richard (combate) · presente · main 4e3fa41, al día',
    '  haciendo: Lanzamiento de la brasa [implementando] · reserva L_Patio hasta 16:40',
    '  hecho:    Sombras que nacen en los bordes (hace 12 min)',
    'Ana (UI) · ausente 40 min · main 9ab948d, 2 commits atrás',
  ].join('\n'));
});
