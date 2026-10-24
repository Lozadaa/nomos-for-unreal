import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture, code } from './orca-fixture.ts';

test('repoAdd registra una ruta con espacios una vez y reutiliza su id', async t => {
  const { orca, calls } = fixture(t);
  assert.deepEqual(await orca.repoAdd('C:/Juego con espacios'), { repoId: 'repo-1' });
  assert.deepEqual(await orca.repoAdd('C:/Juego con espacios'), { repoId: 'repo-1' });
  assert.deepEqual(calls.map(e => e.command.slice(0, 2)), [['repo', 'list'], ['repo', 'add'], ['repo', 'list']]);
  assert.ok(calls.every(e => e.exitCode === 0 && e.durationMs >= 0 && e.command.includes('--json')));
});

test('worktreeCreate obtiene id completo y shell sin lanzar agente ni prompt', async t => {
  const { orca, calls } = fixture(t);
  assert.deepEqual(await orca.worktreeCreate('repo-1', 'nomos-task', 'codex'), {
    worktreeId: 'repo-1::C:/Juego trabajador', path: 'C:/Juego trabajador',
    branch: 'nomos-task', terminalHandle: 'term_fake' });
  assert.deepEqual(calls.map(e => e.command.slice(0, 2)), [['worktree', 'create']]);
});

test('worktreeCreate sin startupTerminal descubre shell exacto sin repetir create', async t => {
  const { orca, calls } = fixture(t, { FAKE_ORCA_NO_STARTUP: '1' });
  assert.deepEqual(await orca.worktreeCreate('repo-1', 'nomos-task', 'codex'), {
    worktreeId: 'repo-1::C:/Juego trabajador', path: 'C:/Juego trabajador',
    branch: 'nomos-task', terminalHandle: 'term_fake' });
  assert.deepEqual(calls.map(e => e.command.slice(0, 2)), [['worktree', 'create'], ['terminal', 'list']]);
  assert.ok(calls.every(e => e.exitCode === 0 && e.command.includes('--json')));
});

const terminal = { handle: 'term_fake', worktreeId: 'repo-1::C:/Juego trabajador',
  connected: true, writable: true, orphaned: false };
for (const [label, terminals] of [
  ['ausente', []], ['ambiguo', [terminal, { ...terminal, handle: 'term_other' }]],
  ['otro worktree', [{ ...terminal, worktreeId: 'repo-1::C:/Otro juego' }]],
  ['huérfano', [{ ...terminal, orphaned: true }]],
  ['desconectado', [{ ...terminal, connected: false }]],
  ['solo lectura', [{ ...terminal, writable: false }]],
  ['sin handle', [{ ...terminal, handle: '' }]],
] as const) test(`worktreeCreate rechaza terminal ${label} sin repetir create`, async t => {
  const { orca, calls, file } = fixture(t, { FAKE_ORCA_NO_STARTUP: '1' });
  writeFileSync(file, JSON.stringify({ repos: [], tail: [], terminals }));
  await assert.rejects(orca.worktreeCreate('repo-1', 'nomos-task', 'codex'), code('cli_error'));
  assert.deepEqual(calls.map(e => e.command.slice(0, 2)), [['worktree', 'create'], ['terminal', 'list']]);
});

test('terminalRead conserva el cursor y devuelve solo las líneas nuevas', async t => {
  const { orca } = fixture(t);
  await orca.terminalSend('term_fake', 'primera línea');
  const first = await orca.terminalRead('term_fake');
  assert.deepEqual(first, { text: 'primera línea', cursor: '1',source:'stream',limited:false });
  await orca.terminalSend('term_fake', 'segunda línea');
  assert.deepEqual(await orca.terminalRead('term_fake', first.cursor), { text: 'segunda línea', cursor: '2',source:'stream',limited:false });
  assert.deepEqual(await orca.terminalRead('term_fake', '2'), { text: '', cursor: '2',source:'stream',limited:false });
});

test('terminalRead permite drenar más de 50 líneas desde cursor cero', async t => {
  const { orca, file } = fixture(t);
  writeFileSync(file, JSON.stringify({ repos: [], tail: Array.from({ length: 60 }, (_, i) => `línea ${i}`) }));
  const page = await orca.terminalRead('term_fake', '0');
  assert.equal(page.text.split('\n').length, 50);
  assert.equal(page.cursor, '50');
  const last = await orca.terminalRead('term_fake', page.cursor);
  assert.equal(last.text, 'línea 50\nlínea 51\nlínea 52\nlínea 53\nlínea 54\nlínea 55\nlínea 56\nlínea 57\nlínea 58\nlínea 59');
  assert.equal(last.cursor, '60');
});

test('terminalRead normaliza cursor numérico a string contractual', async t => {
  const { orca } = fixture(t, { FAKE_ORCA_NUMERIC_CURSOR: '1' });
  assert.deepEqual(await orca.terminalRead('term_fake', '0'), { text: '', cursor: '0',source:'stream',limited:false });
});

test('terminalSend rechaza saltos, comillas y paréntesis antes de invocar Orca', async t => {
  const { orca, calls } = fixture(t);
  for (const text of ['dos\nlíneas', 'dos\rlíneas', '"cita"', "'cita'", 'abre(', 'cierra)']) {
    await assert.rejects(orca.terminalSend('term_fake', text), code('cli_error'));
  }
  assert.equal(calls.length, 0);
});

test('terminalSend detecta rechazo explícito del terminal', async t => {
  const { orca } = fixture(t, { FAKE_ORCA_REJECT: '1' });
  await assert.rejects(orca.terminalSend('term_fake', 'continúa'), code('cli_error'));
});

test('readiness reconoce Ask Codex sin depender del wait', async t => {
  const { orca, calls } = fixture(t);
  await orca.terminalSend('term_fake', '› Ask Codex');
  // el plazo solo se agota si falla: cada llamada lanza un proceso y bajo carga tarda más de 500 ms (intermitencia del hito 7)
  assert.equal(await orca.terminalWaitIdle('term_fake', 10_000), true);
  assert.equal(calls.some(e => e.command[1] === 'wait'), false);
});

test('readiness relee tail tras un falso timeout y registra cada subprocess', async t => {
  const { orca, calls } = fixture(t, { FAKE_ORCA_READY_AFTER_WAIT: '1' });
  assert.equal(await orca.terminalWaitIdle('term_fake', 10_000), true);
  assert.deepEqual(calls.map(e => e.command[1]), ['read', 'wait', 'read']);
});

test('readiness no confirma wait satisfecho sin leer Ask Codex', async t => {
  const { orca } = fixture(t, { FAKE_ORCA_SATISFIED: '1' });
  assert.equal(await orca.terminalWaitIdle('term_fake', 500), false);
});

test('readiness relee Ask Codex después de wait satisfecho antes de confirmar', async t => {
  const { orca, calls } = fixture(t, { FAKE_ORCA_SATISFIED: '1', FAKE_ORCA_READY_AFTER_WAIT: '1' });
  assert.equal(await orca.terminalWaitIdle('term_fake', 10_000), true);
  assert.deepEqual(calls.map(e => e.command[1]), ['read', 'wait', 'read']);
});

test('readiness devuelve false al agotar plazo sin Ask Codex', async t => {
  const pending = fixture(t);
  assert.equal(await pending.orca.terminalWaitIdle('term_fake', 200), false);
});

test('terminalIsIdle consulta señal actual y no usa el Ask Codex histórico',async t=>{
  const busy=fixture(t);await busy.orca.terminalSend('term_fake','Ask Codex');
  assert.equal(await busy.orca.terminalIsIdle('term_fake'),false);
  const idle=fixture(t,{FAKE_ORCA_SATISFIED:'1'});
  assert.equal(await idle.orca.terminalIsIdle('term_fake'),true);
});

test('terminalRead informa hueco cuando oldestCursor supera cursor pedido',async t=>{
  const {orca,file}=fixture(t);
  writeFileSync(file,JSON.stringify({repos:[],tail:['visible'],oldestCursor:'10'}));
  assert.equal((await orca.terminalRead('term_fake','0')).oldestCursor,'10');
});

test('worktreeRemove usa id completo y fuerza solo cuando se solicita', async t => {
  const { orca, calls } = fixture(t);
  await orca.worktreeRemove('repo-1::C:/Juego trabajador');
  await orca.worktreeRemove('repo-1::C:/Juego trabajador', true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].command.includes('--force'), false);
  assert.equal(calls[1].command.includes('--force'), true);
});

for (const [env, expected] of [
  [{ FAKE_ORCA_ERROR: 'not_running' }, 'not_running'],
  [{ FAKE_ORCA_ERROR: 'terminal_handle_stale' }, 'cli_error'],
  [{ FAKE_ORCA_BAD_JSON: '1' }, 'cli_error'],
] as const) test(`error ${JSON.stringify(env)} conserva código y observabilidad`, async t => {
  const { orca, calls } = fixture(t, env);
  await assert.rejects(orca.terminalRead('term_fake'), code(expected));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].error, expected);
});

test('bin inexistente informa not_running y una sola finalización', async t => {
  const { orca, calls } = fixture(t, {}, { bin: join(tmpdir(), 'orca-inexistente-nomos.exe'), args: [] });
  await assert.rejects(orca.repoAdd('C:/Juego'), code('not_running'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].exitCode, null);
});

test('proceso colgado aborta en menos de 1,5 s y registra timeout', async t => {
  const { orca, calls } = fixture(t, { FAKE_ORCA_HANG: '1' }, { timeoutMs: 1000 });
  const start = performance.now();
  await assert.rejects(orca.repoAdd('C:/Juego'), code('timeout'));
  const elapsed = performance.now() - start;
  assert.ok(elapsed <= 1500, `tardó ${elapsed} ms`);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].error, 'timeout');
  t.diagnostic(`Abort observado: ${elapsed.toFixed(1)} ms`);
});
