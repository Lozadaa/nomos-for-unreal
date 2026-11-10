import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../service/src/db.ts';
import { createTask, getTask } from '../../service/src/repo/tasks.ts';
import { startRun } from '../../service/src/repo/runs.ts';
import { insert, read } from '../../service/src/repo/rows.ts';
import { listEvents } from '../../service/src/store.ts';
import { workerPoll, silenceStep, nudgeText } from '../../service/src/handlers/worker-poll.ts';
import { silentMinutes } from '../../service/src/config.ts';
import type { Run } from '../../service/src/model.ts';
import type { WorkerContext } from '../../service/src/runner.ts';
import { removeDir } from '../remove-dir.ts';

/** Un worker `claude -p` (terminal `proc:`) cuya salida y estado se controlan desde la prueba. */
function mudo(editors = 0) {
  const root = mkdtempSync(join(tmpdir(), 'nomos-mudo-')), path = join(root, 'arbol');
  mkdirSync(join(root, '.nomos'), {recursive: true}); mkdirSync(path);
  const db = openDb(':memory:');
  const task = createTask(db, {title: 'Brasa', area: 'gameplay', state: 'implementando', spec: 'Lanzarse', acceptance: ['Se lanza']});
  const tree = insert<{id: string}>(db, 'worktrees', {taskId: task.id, path, branch: 'nomos/brasa', baseCommit: 'base000', state: 'active', closedReason: null});
  const run = startRun(db, {taskId: task.id, role: 'implementacion', provider: 'claude', sessionRef: 'proc:uno',
    metadata: {worktreeId: tree.id, sessionId: 's1', phase: 'running'}});
  const page = {text: '', cursor: '0'}, killed: string[] = [], created: string[] = [];
  let idle = true;
  const orca = {
    terminalRead: async () => ({...page, source: 'stream'}), terminalIsIdle: async () => idle,
    terminalKill: async (h: string) => { killed.push(h); }, terminalClose: async () => {},
    terminalCreate: async (_p: string, _t: string, c: string) => { created.push(c); return 'proc:dos'; },
  };
  const ctx = {db, orca, dataDir: join(root, '.nomos'), projectDir: root, git: {head: async () => 'abc1234', log: async () => []},
    probe: () => ({freeGb: 16, editors, tools: 0})} as unknown as WorkerContext;
  const generation = () => read<Run>(db, 'runs', run.id)!.metadata.pollGeneration ?? 0;
  const poll = () => workerPoll({id: 'p', type: 'worker.poll', payload: {runId: run.id, generation: generation()}} as any, ctx);
  const ends = (text: string) => { page.text = text; page.cursor = String(Number(page.cursor) + text.length); idle = true; };
  const sends = () => (db.prepare(`select payload from commands where type='worker.send'`).all() as {payload: string}[]).map(r => JSON.parse(r.payload));
  const events = (type: string) => listEvents(db, 0).filter(e => e.type === type).map(e => e.payload as Record<string, any>);
  return {db, ctx, run, task, killed, created, poll, ends, sends, events, current: () => read<Run>(db, 'runs', run.id)!,
    close() { db.close(); removeDir(root); }};
}

test('jam (a): claude -p termina sin marca → reenvío en el mismo sondeo, una vez por final', async () => {
  const f = mudo();
  try {
    f.ends('He montado el patio y la brasa ya se lanza.');
    await f.poll();
    assert.deepEqual(f.sends().map(s => s.text), [nudgeText]);
    assert.equal(f.current().metadata.nudges, 1);
    await f.poll();
    assert.equal(f.sends().length, 1, 'el mismo final no se reenvía dos veces');
  } finally { f.close(); }
});

test('jam (b): tres finales sin marca → run failed y un worker nuevo sobre el mismo árbol, una sola vez', async () => {
  const f = mudo();
  try {
    for (const text of ['uno', 'dos', 'tres']) { f.ends(`Turno ${text} sin marca.`); await f.poll(); }
    assert.equal(f.current().state, 'failed');
    assert.deepEqual(f.events('worker.ended_without_marker').map(e => e.nudges), [1, 2, 3]);
    assert.equal(f.created.length, 1, 'un terminal nuevo en el mismo árbol');
    const fresh = f.db.prepare(`select id from runs where state='running' and json_extract(metadata,'$.restartOf')=?`).get(f.run.id);
    assert.ok(fresh, 'la run nueva sigue en el mismo worktree');
    assert.equal(getTask(f.db, f.task.id)!.state, 'implementando');
  } finally { f.close(); }
});

test('jam: el worker nuevo tras tres finales sin marca no tiene otro relevo: la tarea se bloquea', async () => {
  const f = mudo();
  try {
    for (const text of ['uno', 'dos', 'tres']) { f.ends(`Turno ${text}.`); await f.poll(); }
    const fresh = f.db.prepare(`select id from runs where state='running'`).get()!.id as string;
    for (const text of ['cuatro', 'cinco', 'seis']) {
      f.ends(`Turno ${text}.`);
      await workerPoll({id: 'p', type: 'worker.poll', payload: {runId: fresh, generation: 0}} as any, f.ctx);
    }
    assert.equal(f.created.length, 1);
    assert.equal(read<Run>(f.db, 'runs', fresh)!.state, 'failed');
    assert.ok(getTask(f.db, f.task.id)!.blockedReason);
  } finally { f.close(); }
});

test('jam (c): vivo y sin señal 10 min → un solo worker.silent', async () => {
  const f = mudo();
  try {
    const at = Date.parse(f.run.startedAt) + 11 * 60_000;
    await silenceStep(f.ctx, f.current(), at);
    await silenceStep(f.ctx, f.current(), at + 60_000);
    assert.deepEqual(f.events('worker.silent').map(e => e.minutes), [11]);
    assert.equal(f.killed.length, 0);
  } finally { f.close(); }
});

test('jam (d): 20 min sin señal con un Unreal vivo en el PC → no se le mata (empaquetar calla)', async () => {
  const f = mudo(1);
  try {
    await silenceStep(f.ctx, f.current(), Date.parse(f.run.startedAt) + 21 * 60_000);
    assert.equal(f.killed.length, 0);
    assert.equal(f.sends().length, 0);
  } finally { f.close(); }
});

test('jam (e): 20 min sin señal y sin Unreal → se mata el proceso y se reenvía', async () => {
  const f = mudo();
  try {
    await silenceStep(f.ctx, f.current(), Date.parse(f.run.startedAt) + 21 * 60_000);
    assert.deepEqual(f.killed, ['proc:uno']);
    assert.deepEqual(f.sends().map(s => s.text), [nudgeText]);
  } finally { f.close(); }
});

test('jam: silentMinutes por defecto 10 y 20; config.json lo cambia', () => {
  assert.deepEqual(silentMinutes({}), {warn: 10, act: 20});
  assert.deepEqual(silentMinutes({limits: {silentWarnMinutes: 5, silentActMinutes: 8}}), {warn: 5, act: 8});
});
