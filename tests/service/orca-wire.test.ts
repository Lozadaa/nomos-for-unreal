import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture, code } from './orca-fixture.ts';

for (const [name, env] of [['actual', {}], ['legacy', { FAKE_ORCA_SEND_LEGACY: '1' }]] as const) {
  test(`send ${name} acepta únicamente recibo true y entrega una vez`, async t => {
    const { orca, calls, file } = fixture(t, env);
    await orca.terminalSend('term_fake', 'continúa');
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).tail, ['continúa']);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].exitCode, 0);
    assert.equal(calls[0].error, undefined);
  });
  for (const rejection of [{ FAKE_ORCA_REJECT: '1' }, { FAKE_ORCA_SEND_MISSING: '1' }]) {
    test(`send ${name} rechaza ${Object.keys(rejection)[0]} aunque exit sea cero`, async t => {
      const { orca, calls } = fixture(t, { ...env, ...rejection });
      await assert.rejects(orca.terminalSend('term_fake', 'continúa'), code('cli_error'));
      assert.equal(calls.length, 1);
      assert.equal(calls[0].exitCode, 0);
      assert.equal(calls[0].error, 'cli_error');
    });
  }
}

test('wait no satisfecho con ok true y exit1 devuelve false sin evento de error', async t => {
  const { orca, calls } = fixture(t);
  assert.equal(await orca.terminalIsIdle('term_fake'), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].exitCode, 1);
  assert.equal(calls[0].error, undefined);
});

test('readiness relee Ask Codex tras wait no satisfecho con exit1', async t => {
  const { orca, calls } = fixture(t, { FAKE_ORCA_READY_AFTER_WAIT: '1' });
  assert.equal(await orca.terminalWaitIdle('term_fake', 10_000), true);
  assert.deepEqual(calls.map(e => [e.command[1], e.exitCode]), [['read', 0], ['wait', 1], ['read', 0]]);
});

test('wait ok false con error timeout devuelve idle false conservando error observado', async t => {
  const { orca, calls } = fixture(t, { FAKE_ORCA_WAIT_TIMEOUT: '1' });
  assert.equal(await orca.terminalIsIdle('term_fake'), false);
  assert.equal(calls[0].exitCode, 1);
  assert.equal(calls[0].error, 'timeout');
});

test('readiness relee Ask Codex tras timeout JSON sin conceder éxito por timeout', async t => {
  const { orca, calls } = fixture(t, { FAKE_ORCA_WAIT_TIMEOUT: '1', FAKE_ORCA_READY_AFTER_WAIT: '1' });
  assert.equal(await orca.terminalWaitIdle('term_fake', 10_000), true);
  assert.deepEqual(calls.map(e => e.command[1]), ['read', 'wait', 'read']);
  assert.equal(calls[1].error, 'timeout');
  const pending = fixture(t, { FAKE_ORCA_WAIT_TIMEOUT: '1' });
  assert.equal(await pending.orca.terminalWaitIdle('term_fake', 300), false);
});

for (const [name, env, action] of [
  ['wait satisfecho exit1', { FAKE_ORCA_SATISFIED: '1', FAKE_ORCA_EXIT_CODE: '1' }, 'idle'],
  ['wait no satisfecho exit2', { FAKE_ORCA_EXIT_CODE: '2' }, 'idle'],
  ['read exit1', { FAKE_ORCA_EXIT_CODE: '1' }, 'read'],
  ['send exit1 con accepted true', { FAKE_ORCA_EXIT_CODE: '1' }, 'send'],
] as const) test(`${name} sigue siendo cli_error`, async t => {
  const { orca, calls } = fixture(t, env);
  await assert.rejects(action === 'idle' ? orca.terminalIsIdle('term_fake') : action === 'read'
    ? orca.terminalRead('term_fake') : orca.terminalSend('term_fake', 'continúa'), code('cli_error'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].error, 'cli_error');
});
