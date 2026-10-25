import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { within } from './retention.ts';
import { registryFile } from './projects.ts';

/** Hito 20: servicios de Nomos (`server.ts --serve`) que quedaron vivos sin nadie que los pare (pruebas, aceptaciones). */
export type Server = {pid: number; data: string; start: number};
export type Orphan = Server & {why: string};

/** La carpeta de `--data` de una línea de órdenes de `server.ts --serve`; null si no lo es. */
export function dataOf(command: string): string | null {
  if (!/server\.ts"?\s.*--serve\b/.test(command)) return null;
  const m = /--data\s+(?:"([^"]*)"|(\S+))/.exec(command);
  return m ? m[1] ?? m[2] : null;
}

export const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; } };

/** El proceso y todo su árbol (en Windows el servicio lanza editores y workers). */
export function killTree(pid: number): void {
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], {windowsHide: true, stdio: 'ignore'}); } catch { /* ya cerrado */ }
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* ya cerrado */ } }
  }
}

/** Los `server.ts --serve` vivos de la máquina con su `--data` y su hora de arranque. */
export function listServers(): Server[] {
  let rows: {pid: number; command: string; start: number}[] = [];
  if (process.platform === 'win32') {
    const ps = "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ForEach-Object { [pscustomobject]@{pid=$_.ProcessId;command=$_.CommandLine;"
      + "start=[long]($_.CreationDate.ToUniversalTime() - [datetime]'1970-01-01').TotalMilliseconds} } | ConvertTo-Json -Compress";
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {encoding: 'utf8', windowsHide: true}).trim();
    rows = out ? [JSON.parse(out)].flat() : [];
  } else {
    const now = Date.now();
    rows = execFileSync('ps', ['-eo', 'pid=,etimes=,args='], {encoding: 'utf8'}).split('\n').map(l => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l))
      .filter(m => !!m).map(m => ({pid: Number(m[1]), start: now - Number(m[2]) * 1000, command: m[3]}));
  }
  return rows.flatMap(r => { const data = dataOf(r.command ?? ''); return data ? [{pid: r.pid, data, start: r.start}] : []; });
}

/** Carpetas de datos de los proyectos registrados en la máquina (`projects.json`). */
export function registeredData(): string[] {
  try { const list = JSON.parse(readFileSync(registryFile(), 'utf8')); return Array.isArray(list) ? list.map(e => String(e.dataDir)) : []; }
  catch { return []; }
}

/**
 * Huérfanos: su `--data` ya no existe y lleva `minAge` vivo, o está en el temporal, no es de ningún proyecto registrado y lleva
 * `quiet` vivo. Las edades protegen las suites en marcha en otros worktrees (una prueba borra su carpeta mientras su servicio
 * aún cierra). Nunca un `--data` relativo (no se sabe de qué carpeta) ni uno vivo fuera de Temp.
 */
export function orphans(list: Server[], o: {tmp: string; registered: string[]; now: number; quiet: number; minAge: number}): Orphan[] {
  const same = (a: string, b: string) => within(a, b) && within(b, a);
  return list.flatMap(s => {
    if (s.pid === process.pid || !isAbsolute(s.data) || o.registered.some(r => same(r, s.data)) || o.now - s.start < o.minAge) return [];
    if (!existsSync(s.data)) return [{...s, why: 'su carpeta de datos ya no existe'}];
    if (within(s.data, o.tmp) && o.now - s.start >= o.quiet) return [{...s, why: 'carpeta temporal sin proyecto registrado'}];
    return [];
  });
}
