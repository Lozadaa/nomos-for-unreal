import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { projectInfo } from './project-root.ts';

export type EngineOpts = {launcherDat?: string; programFiles?: string; platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv; installIni?: string};

/** Carpeta de binarios del editor por plataforma. macOS y Linux: sin probar con Unreal. */
const binDir = (platform: NodeJS.Platform) => platform === 'win32' ? 'Win64' : platform === 'darwin' ? 'Mac' : 'Linux';

/** El editor de línea de órdenes de una instalación: `UnrealEditor-Cmd(.exe)`; en macOS y Linux, si la instalación no lo
 *  trae, el propio editor (en macOS dentro del .app), que también acepta `-ExecutePythonScript -NullRHI`. */
export function editorCmdIn(install: string, platform: NodeJS.Platform = process.platform): string {
  const bin = join(install, 'Engine', 'Binaries', binDir(platform));
  if (platform === 'win32') return join(bin, 'UnrealEditor-Cmd.exe');
  const fallback = platform === 'darwin' ? join(bin, 'UnrealEditor.app', 'Contents', 'MacOS', 'UnrealEditor') : join(bin, 'UnrealEditor');
  return [join(bin, 'UnrealEditor-Cmd'), fallback].find(existsSync) ?? fallback;
}

/** Dónde deja el motor el launcher de Epic en cada plataforma (Linux no tiene launcher) y el Install.ini de los motores compilados. */
function defaults(platform: NodeJS.Platform) {
  const home = homedir();
  if (platform === 'win32') return {dat: 'C:/ProgramData/Epic/UnrealEngineLauncher/LauncherInstalled.dat', root: 'C:/Program Files/Epic Games', ini: null};
  if (platform === 'darwin') return {dat: join(home, 'Library', 'Application Support', 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat'),
    root: '/Users/Shared/Epic Games', ini: join(home, 'Library', 'Application Support', 'Epic', 'UnrealEngine', 'Install.ini')};
  return {dat: null, root: null, ini: join(home, '.config', 'Epic', 'UnrealEngine', 'Install.ini')};
}

const json = (file: string) => { try { return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch { return null; } };

/** `[Installations] {GUID}=/ruta` de Install.ini: los motores compilados desde el código en macOS y Linux. */
export function iniInstall(file: string | null, guid: string): string | null {
  let text = '';
  try { text = file ? readFileSync(file, 'utf8') : ''; } catch { return null; }
  const key = guid.replace(/[{}]/g, '').toLowerCase();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*\{?([0-9a-f-]+)\}?\s*=\s*(.+?)\s*$/i);
    if (m && m[1].toLowerCase() === key) return m[2];
  }
  return null;
}

/**
 * Jam 2026-11-10: el motor que pide el `.uproject`. `NOMOS_UNREAL_ROOT` (la carpeta que contiene `Engine/`) manda en todas las
 * plataformas. Si no, una versión («5.9») se busca en `LauncherInstalled.dat` y en `C:/Program Files/Epic Games/UE_5.9` (Windows)
 * o `/Users/Shared/Epic Games/UE_5.9` (macOS); un GUID (motor compilado), en `Install.ini` (macOS y Linux).
 * `null`: asociación sin motor conocido o `.uproject` ilegible. `{missing}`: pide una versión que no está instalada.
 */
export function enginePathFor(uproject: string, opts: EngineOpts = {}): {cmd: string; version: string} | {missing: string} | null {
  const platform = opts.platform ?? process.platform, env = opts.env ?? process.env, base = defaults(platform);
  const version = json(uproject)?.EngineAssociation;
  if (typeof version !== 'string') return null;
  const has = (dir: string) => existsSync(join(dir, 'Engine', 'Binaries', binDir(platform)));
  const root = env.NOMOS_UNREAL_ROOT;
  if (root && has(root)) return {cmd: editorCmdIn(root, platform), version};
  if (!/^\d+\.\d+$/.test(version)) {
    const install = platform === 'win32' ? null : iniInstall(opts.installIni ?? base.ini, version);
    return install && has(install) ? {cmd: editorCmdIn(install, platform), version} : null;
  }
  const app = `UE_${version}`, dat = opts.launcherDat ?? base.dat;
  const epic = opts.programFiles ? join(opts.programFiles, 'Epic Games') : base.root;
  const listed = dat ? json(dat)?.InstallationList : null;
  const installs = [...(Array.isArray(listed) ? listed.filter(i => i?.AppName === app).map(i => String(i.InstallLocation)) : []),
    ...(epic ? [join(epic, app)] : [])];
  const install = installs.find(has);
  return install ? {cmd: editorCmdIn(install, platform), version} : {missing: version};
}

/** El motor del juego de `dir` (su carpeta de datos `.nomos` o la del juego). */
export function gameEngine(dir: string | undefined, opts: EngineOpts = {}) {
  const info = projectInfo(dir);
  const uproject = info && [join(dirname(dir!), info.uproject), join(dir!, info.uproject)].find(existsSync);
  return uproject ? enginePathFor(uproject, opts) : null;
}
