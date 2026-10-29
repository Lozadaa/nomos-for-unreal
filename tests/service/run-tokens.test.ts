import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../service/src/db.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { startRun, finishRun } from '../../service/src/repo/runs.ts';
import { insert } from '../../service/src/repo/rows.ts';
import { readUsage, runTokens, tokensByRole, transcriptDir } from '../../service/src/transcript.ts';
import { removeDir } from '../remove-dir.ts';

const turn = (id: string, model: string, input: number, output: number, read: number, write: number) => JSON.stringify({type: 'assistant',
  message: {id, model, usage: {input_tokens: input, output_tokens: output, cache_read_input_tokens: read, cache_creation_input_tokens: write}}});
const sample = [JSON.stringify({type: 'user', message: {content: 'hola'}}), turn('m1', 'claude-opus-4-8', 10, 5, 1000, 200),
  turn('m1', 'claude-opus-4-8', 10, 7, 1000, 200), turn('m2', 'claude-opus-4-8', 20, 30, 2000, 0), 'no es json',
  turn('m3', 'claude-sonnet-4-6', 5, 10, 500, 100), ''].join('\n');

function setup(t: any) {
  const home = mkdtempSync(join(tmpdir(), 'nomos-tokens-')), db = openDb(':memory:'), previous = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = home;
  t.after(() => { db.close(); if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = previous; removeDir(home); });
  createTask(db, {id: 't', title: 't', area: 'gameplay'});
  insert(db, 'worktrees', {id: 'w', taskId: 't', path: 'C:/juegos/Mi Juego/nomos-t', branch: 'nomos/t', baseCommit: '', state: 'active', closedReason: null});
  const run = startRun(db, {taskId: 't', role: 'implementacion', provider: 'claude', metadata: {worktreeId: 'w', sessionId: 's-1'}});
  const ctx = {db} as any, spends = () => db.prepare("select amount,note from spends where run_id=? and kind='tokens'").all(run.id) as any[];
  const queued = () => db.prepare("select payload,not_before from commands where type='run.tokens'").all() as any[];
  return {home, db, run, ctx, spends, queued};
}

test('lee el uso de una transcripción: 3 turnos, dos modelos, líneas repetidas de un mismo mensaje una sola vez', t => {
  const dir = mkdtempSync(join(tmpdir(), 'nomos-jsonl-'));t.after(() => removeDir(dir));
  writeFileSync(join(dir, 's.jsonl'), sample);
  assert.deepEqual(readUsage(join(dir, 's.jsonl')), {input: 35, output: 47, cacheRead: 3500, cacheWrite: 300, turns: 3, model: 'claude-opus-4-8'});
  assert.equal(readUsage(join(dir, 'falta.jsonl')), undefined);
  assert.equal(transcriptDir('C:/a b/c', 'H'), join('H', 'projects', 'C--a-b-c'));
});

test('al terminar, una run con sesión deja una fila tokens en spends con el detalle en note', async t => {
  const f = setup(t), dir = transcriptDir('C:/juegos/Mi Juego/nomos-t');
  mkdirSync(dir, {recursive: true});writeFileSync(join(dir, 's-1.jsonl'), sample);
  finishRun(f.db, f.run.id, 'done', 'hecho');
  assert.equal(f.queued().length, 1);
  await runTokens({payload: JSON.parse(f.queued()[0].payload)} as any, f.ctx);
  assert.deepEqual(f.spends().map(s => ({...s, note: JSON.parse(s.note)})),
    [{amount: 3835, note: {input: 35, output: 47, cacheRead: 3500, cacheWrite: 300, turns: 3, model: 'claude-opus-4-8'}}]);
  await runTokens({payload: {runId: f.run.id, retry: true}} as any, f.ctx);
  assert.equal(f.spends().length, 1, 'una fila por run');
  assert.deepEqual(tokensByRole(f.db), {total: 3835, porRol: {implementacion: 3835}});
});

test('sin transcripción reintenta una vez a los 60 s y después queda en 0 con nota', async t => {
  const f = setup(t);
  finishRun(f.db, f.run.id, 'cancelled', 'parada');
  await runTokens({payload: {runId: f.run.id}} as any, f.ctx);
  assert.equal(f.spends().length, 0);
  const retry = f.queued().find(c => JSON.parse(c.payload).retry);
  assert.ok(retry && Date.parse(retry.not_before) - Date.now() > 55_000);
  await runTokens({payload: JSON.parse(retry.payload)} as any, f.ctx);
  assert.deepEqual(f.spends().map(s => ({...s})), [{amount: 0, note: 'sin transcripción'}]);
});

test('hito 26: una run reabierta (corrección o fusionar main) vuelve a medirse al terminar y su fila se pone al día', async t => {
  const f = setup(t), dir = transcriptDir('C:/juegos/Mi Juego/nomos-t');
  mkdirSync(dir, {recursive: true});writeFileSync(join(dir, 's-1.jsonl'), sample);
  finishRun(f.db, f.run.id, 'done', 'primera vuelta');
  await runTokens({payload: JSON.parse(f.queued()[0].payload)} as any, f.ctx);
  f.db.prepare("update runs set state='running',finished_at=null where id=?").run(f.run.id);
  writeFileSync(join(dir, 's-1.jsonl'), sample + '\n' + turn('m4', 'claude-opus-4-8', 1, 2, 4000, 0));
  await new Promise(r => setTimeout(r, 2));
  finishRun(f.db, f.run.id, 'done', 'tras fusionar main');
  assert.equal(f.queued().length, 2, 'cada cierre encola su medición');
  await runTokens({payload: JSON.parse(f.queued()[1].payload)} as any, f.ctx);
  assert.deepEqual(f.spends().map(s => [s.amount, JSON.parse(s.note).turns]), [[7836, 4]], 'una fila por run, con las dos vueltas');
});
