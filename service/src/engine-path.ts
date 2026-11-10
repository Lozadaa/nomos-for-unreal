import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { projectInfo } from './project-root.ts';

const cmdIn = (install: string) => join(install, 'Engine', 'Binaries', 'Win64', 'UnrealEditor-Cmd.exe');
const json = (file: string) => { try { return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch { return null; } };

/**
 * Jam 2026-11-10: el motor que pide el `.uproject` (`EngineAssociation` «5.9»), buscado en `LauncherInstalled.dat` y en
 * `<Program Files>/Epic Games/UE_<versión>`. `null`: asociación sin versión (GUID de un motor compilado) o `.uproject` ilegible.
 * `{missing}`: la pide y no está instalada.
 */
export function enginePathFor(uproject: string, opts: {launcherDat?: string; programFiles?: string} = {}):
  {cmd: string; version: string} | {missing: string} | null {
  const version = json(uproject)?.EngineAssociation;
  if (typeof version !== 'string' || !/^\d+\.\d+$/.test(version)) return null;
  const app = `UE_${version}`;
  const listed = json(opts.launcherDat ?? 'C:/ProgramData/Epic/UnrealEngineLauncher/LauncherInstalled.dat')?.InstallationList;
  const installs = [...(Array.isArray(listed) ? listed.filter(i => i?.AppName === app).map(i => String(i.InstallLocation)) : []),
    join(opts.programFiles ?? 'C:/Program Files', 'Epic Games', app)];
  const install = installs.find(dir => existsSync(join(dir, 'Engine', 'Binaries', 'Win64')));
  return install ? {cmd: cmdIn(install), version} : {missing: version};
}

/** El motor del juego de `dir` (su carpeta de datos `.nomos` o la del juego). */
export function gameEngine(dir: string | undefined, opts: {launcherDat?: string; programFiles?: string} = {}) {
  const info = projectInfo(dir);
  const uproject = info && [join(dirname(dir!), info.uproject), join(dir!, info.uproject)].find(existsSync);
  return uproject ? enginePathFor(uproject, opts) : null;
}
