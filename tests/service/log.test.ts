import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logDay, writeLog } from '../../service/src/log.ts';
import { openDb } from '../../service/src/db.ts';
import { appendEvent } from '../../service/src/store.ts';
import { enqueue } from '../../service/src/commands.ts';

test('una línea JSON por registro, un archivo por día y fuera lo de más de 14 días al cambiar de día', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kratos-log-'));
  try {
    const day = (offset: number) => new Date(2026, 9, 23 - offset, 12);
    mkdirSync(join(dir, 'logs'));
    writeFileSync(join(dir, 'logs', `${logDay(day(20))}.jsonl`), '{}\n');
    writeFileSync(join(dir, 'logs', `${logDay(day(10))}.jsonl`), '{}\n');
    writeFileSync(join(dir, 'logs', 'notas.txt'), 'no es un log');
    writeLog(dir, {type: 'a'}, new Date(2026, 9, 23, 23, 59));
    writeLog(dir, {type: 'b'}, new Date(2026, 9, 23, 23, 59, 30));
    writeLog(dir, {type: 'c'}, new Date(2026, 9, 24, 0, 1));
    assert.deepEqual(readdirSync(join(dir, 'logs')).sort(), ['2026-10-13.jsonl', '2026-10-23.jsonl', '2026-10-24.jsonl', 'notas.txt']);
    const lines = readFileSync(join(dir, 'logs', '2026-10-23.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    assert.deepEqual(lines.map(l => l.type), ['a', 'b']);
    assert.equal(lines[0].at, new Date(2026, 9, 23, 23, 59).toISOString());
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('cada evento y cada comando del servicio queda en <dataDir>/logs; una base en memoria no escribe nada', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kratos-log-'));
  const db = openDb(join(dir, 'kratos.db'));
  try {
    appendEvent(db, 'task.created', null, {taskId: 't1'});
    enqueue(db, 'worker.poll', {runId: 'r'}, 'k');
    const records = readFileSync(join(dir, 'logs', `${logDay(new Date())}.jsonl`), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    assert.deepEqual(records.map(r => r.type), ['task.created', 'command.pending']);
    assert.equal(records[1].payload.type, 'worker.poll');
    assert.ok(records.every(r => Number.isSafeInteger(r.seq)));
    const memory = openDb(':memory:');
    appendEvent(memory, 'task.created', null, {});
    memory.close();
  } finally { db.close(); rmSync(dir, {recursive: true, force: true}); }
});
