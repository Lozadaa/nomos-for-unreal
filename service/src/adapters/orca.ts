import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export class OrcaError extends Error {
  code: 'timeout' | 'not_running' | 'cli_error';
  detail: string;
  source?: 'process' | 'condition';
  constructor(code: OrcaError['code'], detail: string, source?: OrcaError['source']) {
    super(detail); this.name = 'OrcaError'; this.code = code; this.detail = detail; this.source = source;
  }
}

export type OrcaCompletion = {
  command: string[]; exitCode: number | null; durationMs: number; error?: OrcaError['code']; errorSource?: OrcaError['source'];
};
export type TerminalPage = {text:string;cursor:string;oldestCursor?:string;
  source?:'stream'|'screen';limited?:boolean;truncated?:boolean};
type Options = {
  bin?: string; timeoutMs?: number; args?: string[]; env?: NodeJS.ProcessEnv;
  onCompleted?: (event: OrcaCompletion) => void | Promise<void>;
};
export type Orca = {
  repoAdd(path: string): Promise<{ repoId: string }>;
  worktreeCreate(repoId: string, name: string, agent: 'codex' | 'claude'):
    Promise<{ worktreeId: string; path: string; branch: string; terminalHandle: string }>;
  terminalWaitIdle(handle: string, timeoutMs: number, pattern?: RegExp): Promise<boolean>;
  terminalIsIdle(handle: string): Promise<boolean>;
  terminalSend(handle: string, text: string): Promise<void>;
  terminalRead(handle: string, cursor?: string): Promise<TerminalPage>;
  worktreeRemove(worktreeId: string, force?: boolean): Promise<void>;
  /** Cierra el terminal y el árbol de procesos de su shell (hito 6). */
  terminalClose(handle: string): Promise<void>;
  /** Vivo si Orca aún puede leerlo; un terminal desconocido o cerrado está muerto. */
  terminalAlive(handle: string): Promise<boolean>;
};
function required(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new OrcaError('cli_error', 'Respuesta Orca incompleta');
  return value;
}

export function createOrca(opts: Options = {}): Orca {
  const timeout = Math.min(60_000, opts.timeoutMs ?? 60_000);
  if (!Number.isFinite(timeout) || timeout <= 0) throw new RangeError('Tiempo máximo inválido');
  async function run<T>(args: string[], decode: (result: any) => T, budget = timeout): Promise<T> {
    const command = [...args, '--json'], start = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(timeout, budget)));
    let exitCode: number | null = null, failure: OrcaError | undefined;
    try {
      const output = await new Promise<string>((accept, reject) => {
        const child = spawn(opts.bin ?? (process.platform === 'win32' ? 'orca.exe' : 'orca'),
          [...(opts.args ?? []), ...command], { windowsHide: true, shell: false,
            env: { ...process.env, ...opts.env }, signal: controller.signal });
        let stdout = '', stderr = '', processError: NodeJS.ErrnoException | undefined;
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.on('error', error => { processError = error; });
        child.on('close', status => {
          exitCode = status !== null && status >= 0 ? status : null;
          if (controller.signal.aborted) reject(new OrcaError('timeout', 'Orca agotó el tiempo máximo', 'process'));
          else if (processError) reject(new OrcaError(processError.code === 'ENOENT' ? 'not_running' : 'cli_error',
            processError.message));
          else if (!stdout.trim()) reject(new OrcaError('cli_error', stderr || `Orca terminó con código ${status}`));
          else accept(stdout);
        });
      });
      let response: any;
      try { response = JSON.parse(output); }
      catch { throw new OrcaError('cli_error', 'Orca devolvió JSON inválido'); }
      const waiting = args[0] === 'terminal' && args[1] === 'wait';
      const unsatisfied = waiting && exitCode === 1 && response?.ok === true
        && response?.result?.wait?.satisfied === false;
      if (!response || response.ok !== true || exitCode !== 0 && !unsatisfied) {
        const code = response?.error?.code;
        const errorCode = waiting && exitCode === 1 && response?.ok === false && code === 'timeout'
          ? 'timeout' : ['not_running', 'orca_not_running'].includes(code) ? 'not_running' : 'cli_error';
        throw new OrcaError(errorCode,
          response?.error?.message ?? `Orca terminó con código ${exitCode}`, errorCode==='timeout' ? 'condition' : undefined);
      }
      return decode(response.result);
    } catch (error) {
      failure = error instanceof OrcaError ? error : new OrcaError('cli_error', String(error));
      throw failure;
    } finally {
      clearTimeout(timer);
      await opts.onCompleted?.({ command, exitCode, durationMs: performance.now() - start,
        ...(failure ? { error: failure.code, ...(failure.source ? {errorSource:failure.source} : {}) } : {}) });
    }
  }
  function read(handle: string, cursor?: string, budget?: number) {
    const requested=cursor;
    return run(['terminal', 'read', '--terminal', handle, '--limit', '50',
      ...(cursor === undefined ? [] : ['--cursor', cursor])], result => {
      const terminal = result?.terminal;
      if (!Array.isArray(terminal?.tail) || !terminal.tail.every((line: unknown) => typeof line === 'string')) {
        throw new OrcaError('cli_error', 'Tail de terminal inválido');
      }
      const cursor = Number.isSafeInteger(terminal.nextCursor) && terminal.nextCursor >= 0
        ? String(terminal.nextCursor) : required(terminal.nextCursor);
      const oldest=terminal.oldestCursor;
      return { text: terminal.tail.join('\n'), cursor,
        ...(['stream','screen'].includes(terminal.source) ? {source:terminal.source as 'stream'|'screen'} : {}),
        ...(typeof terminal.limited==='boolean' ? {limited:terminal.limited} : {}),
        ...(typeof terminal.truncated==='boolean' ? {truncated:terminal.truncated} : {}),
        ...(requested!==undefined && Number(oldest)>Number(requested) ? {oldestCursor:String(oldest)} : {}) };
    }, budget);
  }
  return {
    async repoAdd(path) {
      const repos = await run(['repo', 'list'], result => {
        if (!Array.isArray(result?.repos)) throw new OrcaError('cli_error', 'Lista de repositorios inválida');
        return result.repos;
      });
      const repo = repos.find((entry: any) => typeof entry.path === 'string' && resolve(entry.path) === resolve(path));
      if (repo) return { repoId: required(repo.id) };
      return run(['repo', 'add', '--path', path], result => ({ repoId: required(result?.repo?.id) }));
    },
    async worktreeCreate(repoId, name, _agent) {
      const created = await run(['worktree', 'create', '--repo', `id:${repoId}`, '--name', name, '--no-parent'], result => ({
        worktreeId: required(result?.worktree?.id), path: required(result?.worktree?.path),
        branch: required(result?.worktree?.branch), terminalHandle: result?.startupTerminal?.handle,
      }));
      if (created.terminalHandle !== undefined && created.terminalHandle !== null) {
        return { ...created, terminalHandle: required(created.terminalHandle) };
      }
      const terminalHandle = await run(['terminal', 'list', '--worktree', `id:${created.worktreeId}`], result => {
        if (!Array.isArray(result?.terminals)) throw new OrcaError('cli_error', 'Lista de terminales inválida');
        if (result.truncated===true) throw new OrcaError('cli_error', 'Lista de terminales truncada; unicidad incierta');
        const candidates = result.terminals.filter((terminal: any) => terminal?.worktreeId === created.worktreeId
          && terminal.connected === true && terminal.writable === true && terminal.orphaned === false);
        if (candidates.length !== 1) throw new OrcaError('cli_error',
          `Worktree ${created.worktreeId} creado: terminal escribible ${candidates.length ? 'ambiguo' : 'ausente'}`);
        return required(candidates[0].handle);
      });
      return { ...created, terminalHandle };
    },
    terminalRead: read,
    async terminalIsIdle(handle) {
      try {
        return await run(['terminal','wait','--terminal',handle,'--for','tui-idle','--timeout-ms','50'],
          result=>result?.wait?.satisfied===true);
      } catch(error) {if(error instanceof OrcaError && error.code==='timeout' && error.source==='condition') return false;throw error;}
    },
    async terminalSend(handle, text) {
      if (/[\r\n"'()]/.test(text)) throw new OrcaError('cli_error', 'Envía el texto mediante un archivo');
      await run(['terminal', 'send', '--terminal', handle, '--text', text, '--enter'], result => {
        const accepted = result?.send === undefined ? result?.accepted : result.send?.accepted;
        if (accepted !== true) throw new OrcaError('cli_error', 'El terminal no aceptó el texto');
      });
    },
    async terminalWaitIdle(handle, timeoutMs, pattern=/Ask\s*Codex/i) {
      const deadline = performance.now() + timeoutMs;
      while (performance.now() < deadline) {
        try {
          pattern.lastIndex=0;
          if (pattern.test((await read(handle, undefined, deadline - performance.now())).text)) return true;
          const remaining = deadline - performance.now();
          if (remaining <= 0) return false;
          await run(['terminal', 'wait', '--terminal', handle, '--for', 'tui-idle',
            '--timeout-ms', String(Math.max(1, Math.min(1000, Math.floor(remaining / 2))))],
          () => {}, remaining);
        } catch (error) {
          if (error instanceof OrcaError && error.code==='timeout' && performance.now()>=deadline) return false;
          if (!(error instanceof OrcaError) || error.code !== 'timeout' || error.source !== 'condition') throw error;
          if (performance.now() >= deadline) return false;
        }
        await delay(Math.min(50, Math.max(0, deadline - performance.now())));
      }
      return false;
    },
    async terminalClose(handle) {
      await run(['terminal', 'close', '--terminal', handle], () => {});
    },
    async terminalAlive(handle) {
      try { await read(handle); return true; }
      catch (error) { if (error instanceof OrcaError && error.code === 'cli_error') return false; throw error; }
    },
    async worktreeRemove(worktreeId, force = false) {
      await run(['worktree', 'rm', '--worktree', `id:${worktreeId}`, ...(force ? ['--force'] : [])], () => {});
    },
  };
}
