import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../service/src/db.ts';
import { OrcaError, type Orca } from '../../service/src/adapters/orca.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { startRun } from '../../service/src/repo/runs.ts';
import { requireRun, updateRun } from '../../service/src/repo/worker.ts';
import { deliver } from '../../service/src/handlers/worker-deliver.ts';

const blocked = () => new OrcaError('cli_error',
  'agent_prompt_blocked Terminal prompt request ID: d332469e-28f4-4b47-8810-33e0c9485d5d. Re-issue the exact command with --retry-request d332469e-28f4-4b47-8810-33e0c9485d5d --wait-submit <seconds>');

function setup(t: any, failures: number) {
  const dir = mkdtempSync(join(tmpdir(), 'kratos-deliver-'));
  const db = openDb(join(dir, 'kratos.db')); t.after(() => { db.close(); rmSync(dir, {recursive: true, force: true}); });
  const task = createTask(db, {title: 'HUD', area: 'ui'});
  const run = startRun(db, {taskId: task.id, role: 'ui', provider: 'claude'});
  updateRun(db, run.id, {cursor: '3', screenFingerprint: 'abc'}, {sessionRef: 'term_viejo'});
  const tree = join(dir, 'kratos-ba2013ab'), home = join(dir, 'claude');
  mkdirSync(join(home, 'projects', tree.replace(/[^a-zA-Z0-9]/g, '-')), {recursive: true});
  writeFileSync(join(home, 'projects', tree.replace(/[^a-zA-Z0-9]/g, '-'), 'f205f691-7dfc-4b40-9ccb-81af5623ab01.jsonl'), '{}');
  const calls: string[][] = [];
  let left = failures;
  const orca = {
    async terminalSend(h: string, text: string, retry?: {requestId: string; waitSeconds: number}) {
      calls.push(['send', h, retry ? `${retry.requestId}/${retry.waitSeconds}` : '']);
      if (left-- > 0) throw blocked();
    },
    async terminalClose(h: string) { calls.push(['close', h]); },
    async terminalCreate(path: string, title: string, command: string) { calls.push(['create', path, title, command]); return 'term_nuevo'; },
  } as unknown as Orca;
  return {db, orca, run: requireRun(db, run.id), tree, home, calls};
}

test('Orca bloqueado una vez: reintenta la misma petición con --retry-request y --wait-submit 20', async t => {
  const f = setup(t, 1);
  assert.equal(await deliver(f.db, f.orca, f.run, f.tree, 'Lee el archivo x.md y ejecuta lo que dice.', f.home), 'term_viejo');
  assert.deepEqual(f.calls, [['send', 'term_viejo', ''], ['send', 'term_viejo', 'd332469e-28f4-4b47-8810-33e0c9485d5d/20']]);
});

test('bloqueado dos veces: terminal nuevo con --resume y la orden como argumento; la run sigue con el handle nuevo', async t => {
  const f = setup(t, 2);
  const line = 'Lee el archivo .kratos-inbox/c1.md y ejecuta lo que dice.';
  assert.equal(await deliver(f.db, f.orca, f.run, f.tree, line, f.home), 'term_nuevo');
  assert.deepEqual(f.calls.slice(2), [['close', 'term_viejo'], ['create', f.tree, `kratos-${f.run.taskId.slice(0, 8)}`,
    `claude --model sonnet --dangerously-skip-permissions --resume f205f691-7dfc-4b40-9ccb-81af5623ab01 "${line}"`]]);
  const run = requireRun(f.db, f.run.id);
  assert.equal(run.sessionRef, 'term_nuevo');
  assert.equal(run.state, 'running');
  assert.equal(run.metadata.cursor, undefined);
  assert.equal(run.metadata.screenFingerprint, undefined);
});

test('otro error de Orca no se reintenta ni cambia de terminal', async t => {
  const f = setup(t, 0);
  f.orca.terminalSend = async () => { throw new OrcaError('cli_error', 'El terminal no aceptó el texto'); };
  await assert.rejects(deliver(f.db, f.orca, f.run, f.tree, 'x', f.home), /no aceptó/);
  assert.equal(requireRun(f.db, f.run.id).sessionRef, 'term_viejo');
});
