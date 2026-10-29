import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chooseLauncher, createProcessTerminal, launcherMode } from '../../service/src/adapters/process-terminal.ts';
import type { Orca } from '../../service/src/adapters/orca.ts';
import { streamMarkers } from '../../service/src/handlers/worker-markers.ts';
import { launchCommand, briefLine } from '../../service/src/handlers/worker-launch.ts';
import { removeDir } from '../remove-dir.ts';

const fake = `"${process.execPath}" "${join(import.meta.dirname, '..', 'fakes', 'claude.mjs')}"`;
function game() {
  const root = mkdtempSync(join(tmpdir(), 'nomos-proc-')), project = join(root, 'Juego'), data = join(project, '.nomos');
  mkdirSync(data, {recursive: true});
  const git = (...args: string[]) => spawnSync('git', ['-C', project, ...args], {windowsHide: true});
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  writeFileSync(join(project, '.gitignore'), '.nomos/\n'); git('add', '-A'); git('commit', '-qm', 'base');
  return {project, data, close: () => removeDir(root)};
}
async function until(orca: Orca, handle: string, pattern: RegExp, cursor = '0') {
  let text = '';
  for (const end = Date.now() + 20_000; Date.now() < end; await delay(50)) {
    const page = await orca.terminalRead(handle, cursor);
    text += page.text ? page.text + '\n' : ''; cursor = page.cursor;
    if (pattern.test(text)) return {text, cursor};
  }
  throw new Error(`sin ${pattern} en: ${text}`);
}

test('hito 30: un worker por proceso recibe el brief por stdin, deja sus marcas en el log y continúa la sesión con --resume', async () => {
  const g = game();
  try {
    const orca = createProcessTerminal(g.data, g.project, fake);
    const {repoId} = await orca.repoAdd(g.project);
    const tree = await orca.worktreeCreate(repoId, 'nomos-abcd1234', 'claude');
    assert.ok(existsSync(join(tree.path, '.gitignore')), 'el árbol nace del repositorio del juego');
    await orca.terminalSend(tree.terminalHandle, launchCommand('claude', 'sonnet', 'nomos', 'sesion-1'));
    assert.equal(await orca.terminalWaitIdle(tree.terminalHandle, 1000, /x/), true, 'la orden de arranque no lanza nada todavía');
    const start = (await orca.terminalRead(tree.terminalHandle)).cursor;
    await orca.terminalSend(tree.terminalHandle, briefLine);
    const first = await until(orca, tree.terminalHandle, /NOMOS_DONE/, start);
    assert.match(first.text, /ARGS -p --model sonnet --dangerously-skip-permissions --session-id sesion-1/);
    assert.match(first.text, new RegExp(`STDIN ${briefLine}`));
    assert.deepEqual(streamMarkers(first.text.split('\n'), '').found.map(m => m.kind), ['DONE'], 'worker-poll lee la marca del texto');
    assert.equal(await orca.terminalWaitIdle(tree.terminalHandle, 5000), true);
    assert.equal(await orca.terminalAlive(tree.terminalHandle), true, 'la terminal sigue viva tras el turno, como el shell de Orca');

    await orca.terminalSend(tree.terminalHandle, 'corrige y espera');
    const second = await until(orca, tree.terminalHandle, /STDIN corrige/, first.cursor);
    assert.match(second.text, /--resume sesion-1/);
    assert.equal(await orca.terminalIsIdle(tree.terminalHandle), false);
    await orca.terminalClose(tree.terminalHandle);
    assert.equal(await orca.terminalAlive(tree.terminalHandle), false);
    assert.equal(await orca.terminalWaitIdle(tree.terminalHandle, 10_000), true, 'cerrar mata el proceso');

    const relay = await orca.terminalCreate!(tree.path, 't', `${launchCommand('claude', 'sonnet', 'nomos', 'sesion-2')} "${briefLine}"`);
    assert.match((await until(orca, relay, /NOMOS_DONE/)).text, /--session-id sesion-2[\s\S]*STDIN Lee el archivo/);
    await orca.worktreeRemove(tree.worktreeId, true);
    assert.ok(!existsSync(tree.path));
  } finally { g.close(); }
});

test('hito 30: auto elige Orca si responde y proceso si no; cada id vuelve a su adaptador; NOMOS_LAUNCHER manda', async () => {
  const calls: string[] = [];
  const stub = (name: string, up: boolean) => new Proxy({}, {get: (_, key) => async (...args: unknown[]) => {
    calls.push(`${name}.${String(key)}`);
    return key === 'isRunning' ? up : key === 'repoAdd' ? {repoId: name === 'proc' ? 'proc:x' : 'orca-1'} : 'h';
  }}) as Orca;
  assert.equal((await chooseLauncher(stub('orca', true), stub('proc', true), 'auto', 'd').repoAdd('p')).repoId, 'orca-1');
  assert.equal((await chooseLauncher(stub('orca', false), stub('proc', true), 'auto', 'd').repoAdd('p')).repoId, 'proc:x');
  assert.equal((await chooseLauncher(stub('orca', false), stub('proc', true), 'orca', 'd').repoAdd('p')).repoId, 'orca-1');
  const both = chooseLauncher(stub('orca', true), stub('proc', true), 'process', 'd');
  calls.length = 0;
  await both.terminalRead('proc:1'); await both.terminalRead('orca-terminal'); await both.terminalCreate!(join('d', 'worktrees', 'w'), 't', 'c');
  assert.deepEqual(calls, ['proc.terminalRead', 'orca.terminalRead', 'proc.terminalCreate']);
  const saved = process.env.NOMOS_LAUNCHER;
  try {
    delete process.env.NOMOS_LAUNCHER;
    assert.equal(launcherMode({}), 'auto'); assert.equal(launcherMode({launcher: 'process'}), 'process');
    process.env.NOMOS_LAUNCHER = 'orca'; assert.equal(launcherMode({launcher: 'process'}), 'orca');
  } finally { if (saved === undefined) delete process.env.NOMOS_LAUNCHER; else process.env.NOMOS_LAUNCHER = saved; }
});
