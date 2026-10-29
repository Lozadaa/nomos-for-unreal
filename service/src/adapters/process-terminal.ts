import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { OrcaError, type Orca, type TerminalPage } from './orca.ts';
import { killTree } from '../orphans.ts';

/** Hito 30: workers sin Orca. La «terminal» es un registro en `<datos>/terminals/<id>.log` y un `claude` hijo.
 *  Claude Code sin TTY no admite el modo interactivo por stdin de forma fiable: cada envío es un `claude -p` con el texto por stdin
 *  y los siguientes continúan la misma sesión con `--resume <id>`; la terminal vive hasta terminalClose, como el shell de Orca. */
export const processPrefix = 'proc:';
export type LauncherMode = 'auto' | 'orca' | 'process';
type Term = {path: string; base?: string; child?: ChildProcess; queue: string[]; closed?: boolean};
const git = promisify(execFile);
// ponytail: estado en memoria; tras reiniciar el servicio la terminal cuenta como cerrada y worker-recover relanza en el árbol
const terms = new Map<string, Term>();

/** `bin` sustituye a `claude` al lanzar (las pruebas pasan un `claude` falso). */
export function createProcessTerminal(dataDir: string, projectDir: string, bin = 'claude'): Orca {
  const logs = join(dataDir, 'terminals'), trees = join(dataDir, 'worktrees');
  const log = (handle: string) => join(logs, handle.slice(processPrefix.length) + '.log');
  const term = (handle: string) => {
    const t = terms.get(handle);
    if (!t || t.closed) throw new OrcaError('cli_error', `Terminal ${handle} cerrado o desconocido`);
    return t;
  };
  function open(path: string): string {
    mkdirSync(logs, {recursive: true});
    const handle = processPrefix + randomUUID();
    terms.set(handle, {path, queue: []});
    closeSync(openSync(log(handle), 'a'));
    return handle;
  }
  function launch(handle: string, t: Term, line: string, input = '') {
    const fd = openSync(log(handle), 'a');
    const child = spawn(line, {shell: true, cwd: t.path, stdio: ['pipe', fd, fd], windowsHide: true, detached: process.platform !== 'win32'});
    closeSync(fd);
    t.child = child;
    child.stdin!.on('error', () => {}); child.stdin!.end(input);
    child.on('close', () => {
      if (t.child === child) t.child = undefined;
      const next = t.queue.shift();
      if (next !== undefined && !t.closed) send(handle, t, next);
    });
  }
  function send(handle: string, t: Term, text: string) {
    if (t.child) { t.queue.push(text); return; }
    // la orden de arranque de Claude se guarda; el primer texto la lanza con -p
    if (!t.base && /^claude\s/.test(text)) { t.base = text; return; }
    if (!t.base) return launch(handle, t, text);
    const line = t.base.replace(/^claude\b/, `${bin} -p`);
    t.base = t.base.replace('--session-id', '--resume');
    launch(handle, t, line, text);
  }
  return {
    async repoAdd(path) { return {repoId: processPrefix + resolve(path)}; },
    async worktreeCreate(repoId, name) {
      const path = join(trees, name), branch = `nomos-tmp/${name}`;
      mkdirSync(trees, {recursive: true});
      if (!existsSync(path)) await git('git', ['-C', repoId.slice(processPrefix.length), 'worktree', 'add', '-B', branch, path, 'HEAD'], {windowsHide: true})
        .catch(error => { throw new OrcaError('cli_error', `git worktree add: ${error.stderr || error.message}`); });
      return {worktreeId: processPrefix + path, path, branch, terminalHandle: open(path)};
    },
    async worktreeRemove(worktreeId, force = false) {
      const path = worktreeId.slice(processPrefix.length);
      await git('git', ['-C', projectDir, 'worktree', 'remove', ...(force ? ['--force'] : []), path], {windowsHide: true}).catch(async error => {
        if (existsSync(path)) throw new OrcaError('cli_error', String(error.stderr || error.message));
        await git('git', ['-C', projectDir, 'worktree', 'prune'], {windowsHide: true});
      });
    },
    async terminalCreate(path, _title, command) {
      const handle = open(path), t = term(handle), prompt = /^(claude\s.*?)\s+"([^"]*)"$/.exec(command);
      if (prompt) { t.base = prompt[1]; send(handle, t, prompt[2]); } else send(handle, t, command);
      return handle;
    },
    async terminalSend(handle, text) { send(handle, term(handle), text); },
    async terminalRead(handle, cursor): Promise<TerminalPage> {
      const file = log(handle), size = existsSync(file) ? statSync(file).size : 0;
      const from = cursor === undefined ? Math.max(0, size - 64_000) : Math.min(Number(cursor) || 0, size);
      const buffer = Buffer.alloc(size - from);
      if (buffer.length) { const fd = openSync(file, 'r'); readSync(fd, buffer, 0, buffer.length, from); closeSync(fd); }
      // solo líneas completas mientras el proceso escribe (una marca o un carácter UTF-8 no se parten)
      const newline = buffer.lastIndexOf(10), end = newline >= 0 ? newline + 1 : terms.get(handle)?.child ? 0 : buffer.length;
      const text = buffer.subarray(0, end).toString('utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');
      return {text: cursor === undefined ? text.split('\n').slice(-50).join('\n') : text, cursor: String(from + end), source: 'stream'};
    },
    async terminalIsIdle(handle) { return !terms.get(handle)?.child; },
    async terminalWaitIdle(handle, timeoutMs) {
      for (const end = Date.now() + timeoutMs; Date.now() < end; await delay(100)) if (!terms.get(handle)?.child) return true;
      return false;
    },
    async terminalClose(handle) {
      const t = terms.get(handle);
      if (!t) return;
      t.closed = true; t.queue = [];
      if (t.child?.pid) killTree(t.child.pid);
    },
    async terminalAlive(handle) { const t = terms.get(handle); return !!t && !t.closed; },
    async isRunning() { return true; },
    async open() {},
  };
}

/** `auto`: Orca si responde al crear el árbol, si no proceso; cada id `proc:` vuelve a su adaptador aunque cambie la elección. */
export function chooseLauncher(orca: Orca, proc: Orca, mode: LauncherMode, dataDir: string): Orca {
  const by = (id: string) => id.startsWith(processPrefix) ? proc : orca;
  const trees = resolve(dataDir, 'worktrees');
  const mine = (path: string) => { const r = relative(trees, resolve(path)); return !!r && !r.startsWith('..') && !isAbsolute(r); };
  return {
    repoAdd: async path => (mode === 'process' || mode === 'auto' && !await orca.isRunning?.() ? proc : orca).repoAdd(path),
    worktreeCreate: (repoId, ...rest) => by(repoId).worktreeCreate(repoId, ...rest),
    worktreeRemove: (id, force) => by(id).worktreeRemove(id, force),
    terminalCreate: (path, title, command) => (mine(path) ? proc : orca).terminalCreate!(path, title, command),
    terminalSend: (handle, text, retry) => by(handle).terminalSend(handle, text, retry),
    terminalRead: (handle, cursor) => by(handle).terminalRead(handle, cursor),
    terminalIsIdle: handle => by(handle).terminalIsIdle(handle),
    terminalWaitIdle: (handle, ms, pattern) => by(handle).terminalWaitIdle(handle, ms, pattern),
    terminalClose: handle => by(handle).terminalClose(handle),
    terminalAlive: handle => by(handle).terminalAlive(handle),
    isRunning: () => orca.isRunning?.() ?? Promise.resolve(false),
    open: () => orca.open?.() ?? Promise.resolve(),
  };
}
/** `NOMOS_LAUNCHER` manda sobre `config.launcher`; por defecto `auto`. */
export function launcherMode(config: {launcher?: string}): LauncherMode {
  const mode = process.env.NOMOS_LAUNCHER || config.launcher || 'auto';
  return mode === 'orca' || mode === 'process' ? mode : 'auto';
}
