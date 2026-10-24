import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../service/src/db.ts';
import { createServer } from '../../service/src/server.ts';
import { detectCapabilities } from '../../service/src/repo/capabilities.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { startRun } from '../../service/src/repo/runs.ts';
import { acquire } from '../../service/src/leases.ts';
import { createEditorMcpHandlers } from '../../service/src/handlers/editor-mcp.ts';
import type { WorkerContext } from '../../service/src/runner.ts';
import type { Command } from '../../service/src/model.ts';
import * as fs from 'node:fs';

const temp = () => mkdtempSync(join(tmpdir(), 'nomos-mcp-'));

test('unreal_mcp_conflict: dos servidores «unreal» entre .mcp.json, settings y ~/.claude.json del juego', t => {
  const game = temp(), home = temp();
  t.after(() => { rmSync(game, {recursive: true, force: true}); rmSync(home, {recursive: true, force: true}); });
  const env = {PATH: '', USERPROFILE: home};
  assert.equal(detectCapabilities(env, fs, game).find(c => c.id === 'unreal_mcp_conflict'), undefined);
  writeFileSync(join(game, '.mcp.json'), JSON.stringify({mcpServers: {'unreal-epic': {}, figma: {}}}));
  assert.equal(detectCapabilities(env, fs, game).find(c => c.id === 'unreal_mcp_conflict'), undefined, 'uno solo no es conflicto');
  writeFileSync(join(home, '.claude.json'), JSON.stringify({projects: {[game]: {mcpServers: {UnrealMCP: {}}}}}));
  const conflict = detectCapabilities(env, fs, game).find(c => c.id === 'unreal_mcp_conflict')!;
  assert.equal(conflict.state, 'roto');
  assert.match(conflict.detail, /2 servidores MCP de Unreal: unreal-epic, UnrealMCP/);
  mkdirSync(join(game, '.claude'));
  writeFileSync(join(game, '.claude', 'settings.json'), '{roto');
  assert.equal(detectCapabilities(env, fs, game).find(c => c.id === 'unreal_mcp_conflict')!.state, 'roto', 'un JSON roto no rompe la detección');
});

test('GET /editors: libre por defecto y «ocupado por» con la reserva editor/<proyecto>', async t => {
  const root = temp(), dataDir = join(root, '.nomos'); mkdirSync(dataDir);
  writeFileSync(join(root, 'KratosFabTest.uproject'), '{}');
  const db = openDb(join(dataDir, 'nomos.db')), server = createServer(db, 'token', 'service/web', dataDir);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); rmSync(root, {recursive: true, force: true}); });
  const get = async (path: string, auth = true) => fetch(`http://127.0.0.1:${(server.address() as any).port}${path}`,
    {headers: auth ? {Authorization: 'Bearer token'} : {}});
  assert.equal((await get('/editors', false)).status, 401);
  assert.deepEqual(await (await get('/editors')).json(), [{project: 'KratosFabTest', busy: null}]);
  const task = createTask(db, {title: 'PIE', area: 'ui'}), run = startRun(db, {taskId: task.id, role: 'qa', provider: 'claude'});
  acquire(db, run.id, task.id, ['editor/KratosFabTest']);
  const [editor] = await (await get('/editors')).json();
  assert.equal(editor.project, 'KratosFabTest');
  assert.deepEqual({...editor.busy, since: undefined}, {runId: run.id, taskId: task.id, agent: 'qa · claude', provider: 'claude', role: 'qa', since: undefined});
});

test('editor.mcp_start no arranca el editor vivo cuando editorMcp está apagado (por defecto)', async t => {
  const dataDir = temp(); t.after(() => rmSync(dataDir, {recursive: true, force: true}));
  let spawned = 0;
  const handlers = createEditorMcpHandlers({spawn: () => { spawned++; return {pid: 1}; }});
  const ctx = {dataDir, projectDir: dataDir} as unknown as WorkerContext;
  const command = {id: 'c', type: 'editor.mcp_start', payload: {}} as unknown as Command;
  assert.deepEqual(await handlers['editor.mcp_start'](command, ctx), {ok: false, reason: 'editor_mcp_disabled'});
  writeFileSync(join(dataDir, 'config.json'), JSON.stringify({editorMcp: {enabled: false}}));
  assert.deepEqual(await handlers['editor.mcp_start'](command, ctx), {ok: false, reason: 'editor_mcp_disabled'});
  assert.equal(spawned, 0);
  assert.deepEqual(await handlers['editor.mcp_stop'](command, ctx), {ok: true, stopped: 0});
});
