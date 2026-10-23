import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { quote, runLogged } from './process.ts';

export const defaultUnrealCmd = 'C:\\Program Files\\Epic Games\\UE_5.8\\Engine\\Binaries\\Win64\\UnrealEditor-Cmd.exe';
const scripts = join(import.meta.dirname, '..', '..', 'unreal');

export type VerifyReport = {
  ok: boolean; root: string; engine: string | null; assets: Record<string, unknown>[];
  missing_dependencies: {from: string; to: string}[]; external_dependencies: {from: string; to: string}[]; errors: string[];
};
export type RunResult = {exitCode: number | null; log: string; reportJson?: Record<string, unknown>};
export type RenderOpts = {render?: {width: number; height: number; map?: string}};
export type UnrealCmd = ReturnType<typeof createUnrealCmd>;

/** Editor sin GUI (`UnrealEditor-Cmd -ExecutePythonScript -NullRHI`); con `render`, ventana a resolución fija para PIE y capturas.
 *  En pruebas, `bin` es node y `baseArgs` el ejecutable falso. */
export function createUnrealCmd(opts: {bin?: string | null; baseArgs?: string[]; timeoutMs?: number; engineDir?: string} = {}) {
  const bin = opts.bin || defaultUnrealCmd;
  async function runPython(uproject: string, script: string, env: Record<string, string> = {}, timeoutMs = opts.timeoutMs ?? 180_000,
    run: RenderOpts = {}): Promise<RunResult> {
    if (!existsSync(bin)) throw new Error('unreal_missing');
    const dir = mkdtempSync(join(tmpdir(), 'kratos-unreal-'));
    const report = env.KRATOS_REPORT ?? join(dir, 'report.json');
    // con render se lanza el juego (`-game <mapa>`) en ventana a resolución fija: la captura es el viewport del juego
    const view = run.render ? [...(run.render.map ? [run.render.map] : []), '-game', `-ResX=${run.render.width}`, `-ResY=${run.render.height}`,
      '-windowed', '-ForceRes'] : ['-NullRHI'];
    // -ExecutePythonScript cierra el editor al volver el script; con render (PIE) el script se lanza con «py» y cierra él mismo
    // la ruta va por KRATOS_SCRIPT: «py» corta en el primer espacio y ExecCmds en cada coma
    const exec = run.render ? `-ExecCmds="py import os;exec(open(os.environ['KRATOS_SCRIPT']).read())"` : `-ExecutePythonScript=${quote(script)}`;
    const args = [...[...(opts.baseArgs ?? []), uproject].map(quote), ...view, exec,
      '-unattended', '-nopause', '-nosplash', '-stdout', '-FullStdOutLogOutput'];
    try {
      const {exitCode, log} = await runLogged(bin, args, {timeoutMs, env: {...process.env, PYTHONUTF8: '1', ...env, KRATOS_REPORT: report, KRATOS_SCRIPT: script}});
      let reportJson: Record<string, unknown> | undefined;
      try { reportJson = JSON.parse(readFileSync(report, 'utf8')); } catch { reportJson = undefined; }
      return {exitCode, log, reportJson};
    } finally { rmSync(dir, {recursive: true, force: true}); }
  }
  /** «5.8.3» desde `Engine/Build/Build.version`, sin arrancar el editor; null si no está. */
  function engineVersion(_uproject?: string): string | null {
    try {
      const v = JSON.parse(readFileSync(join(opts.engineDir ?? resolve(dirname(bin), '..', '..'), 'Build', 'Build.version'), 'utf8'));
      return `${v.MajorVersion}.${v.MinorVersion}.${v.PatchVersion}`;
    } catch { return null; }
  }
  async function verifyPack(uproject: string, root: string): Promise<VerifyReport> {
    const {exitCode, reportJson} = await runPython(uproject, join(scripts, 'kratos_verify.py'), {KRATOS_ROOT: root});
    if (!reportJson) return {ok: false, root, engine: null, assets: [], missing_dependencies: [], external_dependencies: [],
      errors: [`El editor terminó con código ${exitCode} sin escribir el informe`]};
    return {engine: null, ...reportJson} as VerifyReport;
  }
  async function importFile(uproject: string, sourceFile: string, destFolder: string, name: string): Promise<{assets: string[]}> {
    const {reportJson} = await runPython(uproject, join(scripts, 'kratos_import.py'),
      {KRATOS_SOURCE: sourceFile, KRATOS_DEST: destFolder, KRATOS_NAME: name});
    if (!reportJson?.ok) throw new Error('unreal_import_failed');
    return {assets: reportJson.assets as string[]};
  }
  return {runPython, verifyPack, importFile, engineVersion};
}
