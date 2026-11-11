import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { quote, runLogged } from './process.ts';
import { editorCmdIn } from '../engine-path.ts';

/** Sin motor en el `.uproject` ni `unrealPath`: `NOMOS_UNREAL_ROOT` o el 5.8 donde lo deja cada plataforma (Linux: ~/UnrealEngine). */
export const defaultUnrealCmd = process.platform === 'win32' && !process.env.NOMOS_UNREAL_ROOT
  ? 'C:\\Program Files\\Epic Games\\UE_5.8\\Engine\\Binaries\\Win64\\UnrealEditor-Cmd.exe'
  : editorCmdIn(process.env.NOMOS_UNREAL_ROOT ?? (process.platform === 'darwin' ? '/Users/Shared/Epic Games/UE_5.8' : join(homedir(), 'UnrealEngine')));
const scripts = join(import.meta.dirname, '..', '..', 'unreal');

export type VerifyReport = {
  ok: boolean; root: string; engine: string | null; assets: Record<string, unknown>[];
  missing_dependencies: {from: string; to: string}[]; external_dependencies: {from: string; to: string}[]; errors: string[];
};
export type RunResult = {exitCode: number | null; log: string; reportJson?: Record<string, unknown>};
/** `offscreen` (FASTVFX): editor sin ventana pero con RHI real (`-RenderOffscreen`); con -NullRHI no se compilan shaders
 *  y MaterialEditingLibrary.get_statistics devuelve 0 instrucciones. */
export type RenderOpts = {render?: {width: number; height: number; map?: string}; offscreen?: boolean};
export type UnrealCmd = ReturnType<typeof createUnrealCmd>;

/** Editor sin GUI (`UnrealEditor-Cmd -ExecutePythonScript -NullRHI`); con `render`, ventana a resolución fija para PIE y capturas.
 *  En pruebas, `bin` es node y `baseArgs` el ejecutable falso. */
/** `captureCvars` (hito 22, `checks.captureCvars`): consola antes de cada captura con render, p. ej. cámara fija sin handheld. */
export function createUnrealCmd(opts: {bin?: string | null; baseArgs?: string[]; timeoutMs?: number; engineDir?: string; captureCvars?: string[]} = {}) {
  const bin = opts.bin || defaultUnrealCmd;
  async function runPython(uproject: string, script: string, env: Record<string, string> = {}, timeoutMs = opts.timeoutMs ?? 180_000,
    run: RenderOpts = {}): Promise<RunResult> {
    if (!existsSync(bin)) throw new Error('unreal_missing');
    // barras normales: con barras invertidas el editor lee \r y \n de rutas como ...\richa\...\nomos_x.py (Herbalist H0.3)
    script = script.replace(/\\/g, '/');
    const dir = mkdtempSync(join(tmpdir(), 'nomos-unreal-'));
    const report = env.NOMOS_REPORT ?? join(dir, 'report.json');
    // con render se lanza el juego (`-game <mapa>`) en ventana a resolución fija: la captura es el viewport del juego
    const view = run.render ? [...(run.render.map ? [run.render.map] : []), '-game', `-ResX=${run.render.width}`, `-ResY=${run.render.height}`,
      '-windowed', '-ForceRes'] : [run.offscreen ? '-RenderOffscreen' : '-NullRHI'];
    // -ExecutePythonScript cierra el editor al volver el script; con render (PIE) el script se lanza con «py» y cierra él mismo
    // la ruta va por NOMOS_SCRIPT: «py» corta en el primer espacio y ExecCmds en cada coma
    const exec = run.render ? `-ExecCmds="${[...opts.captureCvars ?? [], "py import os;exec(open(os.environ['NOMOS_SCRIPT']).read())"].join(',')}"`
      : `-ExecutePythonScript=${quote(script)}`;
    const args = [...[...(opts.baseArgs ?? []), uproject].map(quote), ...view, exec,
      '-unattended', '-nopause', '-nosplash', '-stdout', '-FullStdOutLogOutput'];
    try {
      const {exitCode, log} = await runLogged(bin, args, {timeoutMs, env: {...process.env, PYTHONUTF8: '1', ...env, NOMOS_REPORT: report, NOMOS_SCRIPT: script}});
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
    const {exitCode, reportJson} = await runPython(uproject, join(scripts, 'nomos_verify.py'), {NOMOS_ROOT: root});
    if (!reportJson) return {ok: false, root, engine: null, assets: [], missing_dependencies: [], external_dependencies: [],
      errors: [`El editor terminó con código ${exitCode} sin escribir el informe`]};
    return {engine: null, ...reportJson} as VerifyReport;
  }
  async function importFile(uproject: string, sourceFile: string, destFolder: string, name: string): Promise<{assets: string[]}> {
    const {reportJson} = await runPython(uproject, join(scripts, 'nomos_import.py'),
      {NOMOS_SOURCE: sourceFile, NOMOS_DEST: destFolder, NOMOS_NAME: name});
    if (!reportJson?.ok) throw new Error('unreal_import_failed');
    return {assets: reportJson.assets as string[]};
  }
  return {runPython, verifyPack, importFile, engineVersion};
}
