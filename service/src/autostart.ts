import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readJson } from './atomic.ts';
import { registryFile, type Entry } from './projects.ts';
import { readServiceInfo, isAlive } from './service-info.ts';

/** Hito 22: «Nomos - arranque», la tarea programada que instala `scripts/instalar-arranque.ps1`. */
export const taskName = 'Nomos - arranque';
const script = join(import.meta.dirname, '../../scripts/instalar-arranque.ps1');
const cli = join(import.meta.dirname, 'cli.ts');

/**
 * Levanta, uno detrás de otro, los servicios del registro cuyo proceso ya no vive (tras un reinicio, todos), con su
 * `--data` y su puerto. La lista se lee una vez al empezar: cada arranque reescribe el registro sin las entradas muertas.
 */
export async function startRegistered(log: (line: string) => void = console.log): Promise<{name: string; port: number; started: boolean}[]> {
  const entries = readJson<Entry[]>(registryFile(), []), result = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry?.dataDir || !Number.isInteger(entry.port) || !existsSync(entry.dataDir)) continue;
    const info = readServiceInfo(entry.dataDir);
    if (info && await isAlive(info)) { result.push({name: entry.name, port: entry.port, started: false}); continue; }
    const run = spawnSync(process.execPath, [cli, 'start', '--data', entry.dataDir, '--port', String(entry.port), '--no-open'],
      {cwd: entry.dir, encoding: 'utf8', windowsHide: true, timeout: 60_000});
    log(`${entry.name} (${entry.port}): ${run.status === 0 ? 'arrancado' : 'no arrancó'}`);
    result.push({name: entry.name, port: entry.port, started: run.status === 0});
  }
  return result;
}

/** `nomos autostart on|off|status|run`. */
export async function autostartCli(argv: string[]): Promise<boolean> {
  const words = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--data');
  if (words[0] !== 'autostart') return false;
  const action = words.length === 2 ? words[1] : undefined;
  if (action === 'run') { console.log(JSON.stringify(await startRegistered())); return true; }
  if (action === 'status') {
    const query = process.platform === 'win32' ? spawnSync('schtasks', ['/Query', '/TN', taskName], {windowsHide: true}) : {status: 1};
    const services = readJson<Entry[]>(registryFile(), []);
    console.log(JSON.stringify({installed: query.status === 0, task: taskName,
      services: (Array.isArray(services) ? services : []).map(e => ({name: e.name, port: e.port}))}));
    return true;
  }
  if (action !== 'on' && action !== 'off') throw new Error('Uso: nomos autostart on|off|status');
  if (process.platform !== 'win32') throw new Error('El arranque al iniciar sesión es una tarea programada de Windows');
  const run = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...(action === 'off' ? ['-Desinstalar'] : [])],
    {stdio: 'inherit', windowsHide: true});
  if (run.status !== 0) throw new Error('No se pudo cambiar la tarea programada');
  return true;
}
