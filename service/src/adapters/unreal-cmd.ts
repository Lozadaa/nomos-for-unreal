import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const defaultUnrealCmd = 'C:\\Program Files\\Epic Games\\UE_5.8\\Engine\\Binaries\\Win64\\UnrealEditor-Cmd.exe';
const scripts = join(import.meta.dirname, '..', '..', 'unreal');

export type VerifyReport = {
  ok: boolean; root: string; engine: string | null; assets: Record<string, unknown>[];
  missing_dependencies: {from: string; to: string}[]; external_dependencies: {from: string; to: string}[]; errors: string[];
};
export type RunResult = {exitCode: number | null; log: string; reportJson?: Record<string, unknown>};
export type UnrealCmd = ReturnType<typeof createUnrealCmd>;

// Unreal lee `-Clave=valor` del texto de la línea de órdenes: el valor con espacios va entre comillas tras el `=`.
const quote = (value: string) => /[\s"]/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;

/** Editor sin GUI (`UnrealEditor-Cmd -ExecutePythonScript -NullRHI`); en pruebas, `bin` es node y `baseArgs` el ejecutable falso. */
export function createUnrealCmd(opts: {bin?: string | null; baseArgs?: string[]; timeoutMs?: number} = {}) {
  const bin = opts.bin || defaultUnrealCmd;
  function runPython(uproject: string, script: string, env: Record<string, string> = {}, timeoutMs = opts.timeoutMs ?? 180_000): Promise<RunResult> {
    if (!existsSync(bin)) return Promise.reject(new Error('unreal_missing'));
    const dir = mkdtempSync(join(tmpdir(), 'kratos-unreal-'));
    const report = env.KRATOS_REPORT ?? join(dir, 'report.json');
    const args = [...(opts.baseArgs ?? []), uproject].map(quote).concat(`-ExecutePythonScript=${quote(script)}`,
      '-unattended', '-nopause', '-nosplash', '-NullRHI', '-stdout', '-FullStdOutLogOutput');
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, {windowsHide: true, windowsVerbatimArguments: true, shell: false, argv0: quote(bin),
        env: {...process.env, PYTHONUTF8: '1', ...env, KRATOS_REPORT: report}});
      let log = '';
      const keep = (chunk: Buffer) => { log = (log + chunk.toString('utf8')).slice(-200_000); };
      child.stdout.on('data', keep); child.stderr.on('data', keep);
      // el editor lanza procesos hijos (ShaderCompileWorker): en Windows se mata el árbol entero
      const kill = () => process.platform === 'win32' && child.pid
        ? spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {windowsHide: true}) : child.kill();
      const timer = setTimeout(() => { kill(); reject(new Error('unreal_timeout')); }, timeoutMs);
      child.once('error', error => { clearTimeout(timer); rmSync(dir, {recursive: true, force: true}); reject(error); });
      child.once('close', exitCode => {
        clearTimeout(timer);
        let reportJson: Record<string, unknown> | undefined;
        try { reportJson = JSON.parse(readFileSync(report, 'utf8')); } catch { reportJson = undefined; }
        rmSync(dir, {recursive: true, force: true});
        resolve({exitCode, log, reportJson});
      });
    });
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
  return {runPython, verifyPack, importFile};
}
