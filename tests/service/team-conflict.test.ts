import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtered } from '../../service/src/repo/rows.ts';
import { getTask } from '../../service/src/repo/tasks.ts';
import { recordTestRun } from '../../service/src/repo/artifacts.ts';
import { keepVersion, listApprovals } from '../../service/src/approvals.ts';
import { teamTick } from '../../service/src/team.ts';
import type { Command } from '../../service/src/model.ts';
import { teamFixture } from './team-fixture.ts';

const map = 'Content/Mapas/L_Arena.umap';
type F = ReturnType<typeof teamFixture>; type Clone = ReturnType<F['clone']>;
/** Integra hasta el final, pasando las recomprobaciones que pida la base nueva. */
async function integrateAll(c: Clone, taskId: string) {
  for (let i = 0; i < 5; i++) {
    const r = await c.integrate(taskId);
    if (r.reason !== 'Recomprobando sobre la rama objetivo') return r;
    const cmd = filtered<Command>(c.db, 'commands', {type: 'checks.run'}).filter(x => JSON.parse(x.payload as unknown as string).taskId === taskId).at(-1)!;
    c.db.prepare("update commands set state='done' where id=?").run(cmd.id);
    recordTestRun(c.db, {taskId, checkId: 'cpp', result: 'passed'});
  }
  throw new Error('no terminó');
}
/** Ana integra primero su versión del mapa; Richard choca al integrar la suya. */
async function clash(f: F) {
  const a = f.clone('Richard', 'combate'), b = f.clone('Ana', 'arena');
  const tb = b.task('arenaB', {[map]: Buffer.from([0, 1, 1])}, 'Arena de Ana'), ta = a.task('arenaA', {[map]: Buffer.from([0, 2, 2])}, 'Arena de Richard');
  for (const [c, t] of [[a, ta], [b, tb]] as const) c.db.prepare('update tasks set leases=? where id=?').run(JSON.stringify([map]), t.task.id);
  assert.equal((await integrateAll(b, tb.task.id)).integrated, true);
  const first = await a.integrate(ta.task.id);
  return {a, b, ta, tb, first};
}
const tick = (c: Clone) => teamTick(c.db, c.dataDir, c.dir, {pushedAt: 0, fetchedAt: 0, warned: false});
const mapOn = (f: F, ref: string) => [...Buffer.from(f.git(f.bare, 'cat-file', '-p', `${ref}:${map}`), 'latin1')];

test('conflicto en un binario: bloquea «Conflicto en L_Arena con Ana» y abre la tarjeta con las dos versiones', async () => {
  const f = teamFixture();
  try {
    const {a, ta, first} = await clash(f);
    assert.deepEqual(first, {deferred: true, reason: 'Conflicto en L_Arena con Ana'});
    assert.equal(getTask(a.db, ta.task.id)!.blockedReason, 'Conflicto en L_Arena con Ana');
    const [card] = listApprovals(a.db).items;
    assert.deepEqual([card.state, card.conflict!.files, card.conflict!.mine.who, card.conflict!.mine.task, card.conflict!.theirs.who,
      card.conflict!.theirs.frente, card.conflict!.theirs.task], ['pending', [map], 'Richard', 'Arena de Richard', 'Ana', 'arena', 'Arena de Ana']);
    assert.equal((await a.integrate(ta.task.id)).reason, 'Esperando tu elección: conflicto en L_Arena', 'sin elegir, espera');
    assert.throws(() => keepVersion(a.db, card.id, 'otra'), /invalid_conflict_side/);
  } finally { f.close(); }
});

test('«Quedarme con la mía»: publica mi mapa, la tarea de Ana vuelve a implementando y a ella le llega el aviso', async () => {
  const f = teamFixture();
  try {
    const {a, b, ta, tb} = await clash(f);
    keepVersion(a.db, listApprovals(a.db).items[0].id, 'mine');
    assert.equal((await integrateAll(a, ta.task.id)).integrated, true);
    assert.deepEqual(mapOn(f, 'master'), [0, 2, 2]);
    assert.equal(getTask(a.db, ta.task.id)!.state, 'cerrando');
    assert.equal(getTask(a.db, ta.task.id)!.blockedReason, null);
    await tick(a); await tick(b);
    assert.equal(getTask(b.db, tb.task.id)!.state, 'implementando');
    assert.deepEqual(b.db.prepare("select text from messages where origin='equipo'").all().map(m => m.text),
      ['Richard (combate): Conflicto en L_Arena: Richard se quedó con su versión']);
  } finally { f.close(); }
});

test('«Quedarme con la suya»: queda el mapa de Ana, mi tarea vuelve a implementando con aviso y Ana sabe lo elegido', async () => {
  const f = teamFixture();
  try {
    const {a, b, ta, tb} = await clash(f);
    keepVersion(a.db, listApprovals(a.db).items[0].id, 'theirs');
    assert.equal((await integrateAll(a, ta.task.id)).integrated, true);
    assert.deepEqual(mapOn(f, 'master'), [0, 1, 1]);
    assert.equal(getTask(a.db, ta.task.id)!.state, 'implementando');
    const send = filtered<Command>(a.db, 'commands', {type: 'worker.send'}).map(c => JSON.parse(c.payload as unknown as string));
    assert.match(send.at(-1).text, /^Conflicto en L_Arena: te quedaste con la suya/);
    await tick(a); await tick(b);
    assert.notEqual(getTask(b.db, tb.task.id)!.state, 'implementando', 'la de Ana no se toca');
    assert.match(b.events('team.request')[0].text, /Richard se quedó con la tuya/);
  } finally { f.close(); }
});

test('resuelto a mano en su rama: Nomos ve que el conflicto ya no existe y sigue la integración', async () => {
  const f = teamFixture();
  try {
    const {a, ta} = await clash(f);
    // la persona trae main a su rama y se queda con su mapa a mano, sin pasar por la tarjeta
    assert.throws(() => f.git(ta.path, 'merge', '-q', 'origin/master'));
    f.git(ta.path, 'checkout', '--ours', '--', map); f.git(ta.path, 'add', map); f.git(ta.path, 'commit', '-q', '--no-edit');
    assert.equal((await integrateAll(a, ta.task.id)).integrated, true);
    assert.equal(listApprovals(a.db).items[0].choice, 'manual');
    assert.equal(getTask(a.db, ta.task.id)!.blockedReason, null);
    assert.deepEqual(mapOn(f, 'master'), [0, 2, 2]);
    assert.equal(a.events('team.ask').length, 0, 'sin elección en la tarjeta no hay aviso de versión');
  } finally { f.close(); }
});
