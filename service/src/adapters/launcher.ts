import { spawn } from 'node:child_process';
import { closeSync, openSync, readSync, statSync } from 'node:fs';

export type Launcher = {openFab: () => void};

/** Abre el Epic Games Launcher en Fab; el resto (Mi biblioteca, «+», proyecto) lo hace una persona o Computer use. */
export const launcher: Launcher = {
  openFab() {
    spawn('cmd', ['/c', 'start', '', 'com.epicgames.launcher://ue/fab'], {windowsHide: true, detached: true, stdio: 'ignore'}).unref();
  },
};

/** Líneas completas añadidas al log desde `sinceBytes`; si el Launcher rotó el log (más corto), empieza de nuevo. */
export function tailLog(path: string, sinceBytes: number): {lines: string[]; offset: number} {
  let size: number;
  try { size = statSync(path).size; } catch { return {lines: [], offset: sinceBytes}; }
  const start = size < sinceBytes ? 0 : sinceBytes;
  if (size === start) return {lines: [], offset: start};
  const buffer = Buffer.alloc(size - start), fd = openSync(path, 'r');
  try { readSync(fd, buffer, 0, buffer.length, start); } finally { closeSync(fd); }
  const end = buffer.lastIndexOf(0x0a);
  if (end < 0) return {lines: [], offset: start};
  return {lines: buffer.subarray(0, end).toString('utf8').split('\n').map(line => line.replace(/\r$/, '')).filter(Boolean), offset: start + end + 1};
}

/**
 * Fin de una descarga de Fab: `HandleTaskComplete AlertCode=[ok]` de un AppId que antes apareció en
 * `LogFabViewModel: Manifest downloaded`. El Launcher emite la misma línea para juegos (Fortnite) y plugins.
 */
export function parseCompletion(lines: string[], knownApps: string[] = []): {done: boolean; appName?: string; fabApps: string[]} {
  const fabApps = new Set(knownApps);
  for (const line of lines) {
    const manifest = /LogFabViewModel: Manifest downloaded for AppId (\S+)/.exec(line);
    if (manifest) fabApps.add(manifest[1]);
    const complete = /HandleTaskComplete: AppId \[([^\]]+)\] AlertCode=\[ok\]/.exec(line);
    if (complete && fabApps.has(complete[1])) return {done: true, appName: complete[1].split(':').at(-1), fabApps: [...fabApps]};
  }
  return {done: false, fabApps: [...fabApps]};
}
