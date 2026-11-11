import { spawn } from 'node:child_process';

// Unreal lee `-Clave=valor` del texto de la línea de órdenes: el valor con espacios va entre comillas tras el `=`.
export const quote = (value: string) => /[\s"]/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;

/** `args` ya van entrecomillados por el llamador (`quote`). Proceso con log acotado; al agotar el tiempo mata el árbol (el editor lanza ShaderCompileWorker) y rechaza con el log. */
export function runLogged(bin: string, args: string[], opts: {env?: NodeJS.ProcessEnv; timeoutMs: number; cwd?: string}):
  Promise<{exitCode: number | null; log: string}> {
  return new Promise((resolve, reject) => {
    // los .bat solo se ejecutan a través de cmd.exe; el resto, directo y con los argumentos tal cual
    const bat = /\.(bat|cmd)$/i.test(bin);
    const child = bat
      ? spawn('cmd.exe', ['/d', '/s', '/c', `"${[quote(bin), ...args].join(' ')}"`], {windowsHide: true, windowsVerbatimArguments: true, env: opts.env, cwd: opts.cwd})
      : spawn(bin, args, {windowsHide: true, windowsVerbatimArguments: true, shell: false, argv0: quote(bin), env: opts.env, cwd: opts.cwd});
    // las marcas NOMOS_ de lo que se recorta se conservan delante (TrompoArte: 12 000 avisos del motor se comieron «NOMOS_DEMO activo»)
    let log = '', marks = '';
    const keep = (chunk: Buffer) => {
      log += chunk.toString('utf8');
      if (log.length <= 2_000_000) return;
      marks += log.slice(0, -2_000_000).split(/\r?\n/).filter(l => l.includes('NOMOS_')).map(l => l + '\n').join('');
      log = log.slice(-2_000_000);
    };
    child.stdout.on('data', keep); child.stderr.on('data', keep);
    const kill = () => process.platform === 'win32' && child.pid
      ? spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {windowsHide: true}) : child.kill();
    const timer = setTimeout(() => { kill(); reject(Object.assign(new Error('unreal_timeout'), {log: marks + log})); }, opts.timeoutMs);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', exitCode => { clearTimeout(timer); resolve({exitCode, log: marks + log}); });
  });
}
