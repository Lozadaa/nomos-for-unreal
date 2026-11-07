import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fixture, code } from './orca-fixture.ts';

// Hito 22: tras un reinicio, con la caché fría, Orca tarda más de un minuto en crear el worktree.
const state = (file: string) => JSON.parse(readFileSync(file, 'utf8'));

test('worktreeCreate espera lo que se le pide aunque pase del plazo general de Orca', async t => {
  const {orca, file} = fixture(t, {}, {timeoutMs: 1000});
  writeFileSync(file, JSON.stringify({repos: [], tail: [], createDelayMs: 2000}));
  const created = await orca.worktreeCreate('repo-1', 'nomos-lento', 'claude', 10_000);
  assert.equal(created.branch, 'nomos-lento');
  assert.deepEqual(state(file).removed ?? [], []);
});

test('si el plazo de creación se agota, retira el worktree huérfano antes de devolver el error', async t => {
  const {orca, file, calls} = fixture(t);
  writeFileSync(file, JSON.stringify({repos: [], tail: [], createDelayMs: 10_000}));
  // el plazo tiene que cubrir el arranque del Orca falso (node): con 500 ms y la máquina cargada por la suite, a veces se
  // cortaba antes de que el falso apuntara el árbol y no había huérfano que retirar
  await assert.rejects(orca.worktreeCreate('repo-1', 'nomos-frio', 'claude', 4000), code('timeout'));
  assert.deepEqual(state(file).removed, ['repo-1::C:/Juego trabajador']);
  assert.deepEqual(calls.map(c => c.command.slice(0, 2)), [['worktree', 'create'], ['worktree', 'list'], ['worktree', 'rm']]);
});

test('sin huérfano en la lista no se retira nada', async t => {
  const {orca, file} = fixture(t);
  writeFileSync(file, JSON.stringify({repos: [], tail: [], createDelayMs: 5000, createFailsEarly: true}));
  await assert.rejects(orca.worktreeCreate('repo-1', 'nomos-frio', 'claude', 500));
  assert.equal(state(file).removed, undefined);
});

test('orca.createTimeoutMs vale 180 s por defecto, se configura y se valida', async t => {
  const {readConfig, orcaCreateTimeoutMs} = await import('../../service/src/config.ts');
  const {mkdtempSync} = await import('node:fs'), {tmpdir} = await import('node:os'), {join} = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'nomos-crear-')), write = (v: object) => writeFileSync(join(dir, 'config.json'), JSON.stringify(v));
  assert.equal(orcaCreateTimeoutMs(readConfig(dir)), 180_000);
  write({orca: {createTimeoutMs: 240_000}}); assert.equal(orcaCreateTimeoutMs(readConfig(dir)), 240_000);
  write({orca: {createTimeoutMs: 0}}); assert.throws(() => readConfig(dir), /invalid_worker_config/);
});
