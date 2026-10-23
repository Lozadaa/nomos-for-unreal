import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './route-fixture.ts';
import { seed } from '../../service/src/seed.ts';


async function withPort(run: (f: any, call: (m: string, p: string, d?: unknown, a?: boolean) => Promise<Response>) => Promise<void>) {
  const f = await fixture();
  try {
    const probe = await f.request('/status');
    const base = probe.url.replace(/\/status$/, '');
    await run(f, (method, path, data, auth = true) => fetch(base + path, {method,
      headers: auth ? {Authorization: 'Bearer secret'} : {}, ...(data === undefined ? {} : {body: JSON.stringify(data)})}));
  } finally { await f.close(); }
}

test('pausar y reanudar cambian /status.paused y emiten un evento por cambio', () => withPort(async (f, send) => {
  assert.equal((await send('POST', '/director/pause', undefined, false)).status, 401);
  assert.equal((await (await send('POST', '/director/pause')).json()).paused, true);
  assert.equal((await (await send('POST', '/director/pause')).json()).paused, true);
  assert.equal((await (await f.request('/status')).json()).paused, true);
  assert.equal((await (await send('POST', '/director/resume')).json()).paused, false);
  const types = f.db.prepare("select type from events where type like 'director.%' order by seq").all().map((r: any) => r.type);
  assert.deepEqual(types, ['director.paused', 'director.resumed']);
  assert.equal((await send('GET', '/director/pause')).status, 404);
}));

test('PUT /budget fija límites del presupuesto existente, los crea y los quita con null', () => withPort(async (f, send) => {
  seed(f.db);
  const before = await (await f.request('/budget')).json();
  const scopeId = f.db.prepare("select scope_id from budgets where scope='workspace'").get().scope_id;
  const put = await send('PUT', '/budget', {scope: 'workspace', scopeId, limits: {meshyCredits: 500, tokens: null}});
  assert.equal(put.status, 200);
  const after = await put.json();
  assert.equal(after.limits.meshyCredits, 500); assert.equal(after.limits.tokens, null);
  assert.equal(after.limits.elevenlabsCredits, before.limits.elevenlabsCredits);
  assert.equal(after.spent.meshyCredits, before.spent.meshyCredits);
  const created = await send('PUT', '/budget', {scope: 'task', scopeId: 'seed-task-06', limits: {buildMinutes: 30}});
  assert.equal((await created.json()).limits.buildMinutes, 30);
}));

test('PUT /budget rechaza entrada inválida con el código que corresponde', () => withPort(async (f, send) => {
  seed(f.db);
  const bad: [unknown, number][] = [
    [{scope: 'x', scopeId: 'a', limits: {}}, 400], [{scope: 'workspace', scopeId: ' ', limits: {}}, 400],
    [{scope: 'workspace', scopeId: 'a'}, 400], [{scope: 'workspace', scopeId: 'a', limits: {tokens: -1}}, 400],
    [{scope: 'workspace', scopeId: 'a', limits: {tokens: '5'}}, 400], [{scope: 'workspace', scopeId: 'a', limits: {otra: 1}}, 400],
    [{scope: 'task', scopeId: 'no-existe', limits: {tokens: 1}}, 404]];
  for (const [data, code] of bad) assert.equal((await send('PUT', '/budget', data)).status, code, JSON.stringify(data));
  assert.equal((await send('PUT', '/budget', {}, false)).status, 401);
}));

test('la CSP deja compilar WebAssembly al visor 3D sin abrir eval', () => withPort(async (f) => {
  const csp = (await f.request('/status')).headers.get('content-security-policy')!;
  assert.match(csp, /script-src [^;]*'wasm-unsafe-eval'/);
  assert.doesNotMatch(csp, /'unsafe-eval'/);
}));
