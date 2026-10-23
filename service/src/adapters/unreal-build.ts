import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { defaultUnrealCmd } from './unreal-cmd.ts';
import { quote, runLogged } from './process.ts';

export type BuildOpts = {bin?: string | null; baseArgs?: string[]; engineDir?: string; timeoutMs?: number};
export type BuildResult = {ok: boolean; log: string; errors: string[]};

/** Carpeta `Engine` a partir de la ruta de UnrealEditor-Cmd.exe (`Engine/Binaries/Win64/...`). */
export const engineDirOf = (cmdPath: string | null | undefined) => resolve(dirname(cmdPath || defaultUnrealCmd), '..', '..');
// MSVC «x.cpp(12): error C2065», enlazador «error LNK2019» y UBT «Error: …»; nunca «0 error(s)»
export const errorLines = (log: string) => log.split(/\r?\n/).filter(line => /(: error |\berror [A-Z]+\d+|^\s*error:)/i.test(line));

async function run(script: string, args: string[], opts: BuildOpts, timeoutMs: number) {
  const bin = opts.bin || join(opts.engineDir ?? engineDirOf(null), 'Build', 'BatchFiles', script);
  if (!existsSync(bin)) throw new Error('unreal_missing');
  const {exitCode, log} = await runLogged(bin, [...(opts.baseArgs ?? []).map(quote), ...args.map(quote)], {timeoutMs: opts.timeoutMs ?? timeoutMs});
  return {exitCode, log: `> ${script} ${args.join(' ')}\n${log}`};
}

/** Compila el target de editor del proyecto (Build.bat); 20 min por defecto. */
export async function buildEditorTarget(uproject: string, opts: BuildOpts = {}): Promise<BuildResult> {
  const name = basename(uproject, '.uproject');
  const {exitCode, log} = await run('Build.bat',
    [`${name}Editor`, 'Win64', 'Development', `-Project=${uproject}`, '-WaitMutex', '-FromMsBuild'], opts, 20 * 60_000);
  return {ok: exitCode === 0, log, errors: errorLines(log)};
}

/** Empaqueta con RunUAT BuildCookRun en `outDir`; 40 min por defecto. */
export async function buildCookRun(uproject: string, outDir: string, opts: BuildOpts = {}): Promise<BuildResult & {exePath?: string}> {
  const {exitCode, log} = await run('RunUAT.bat', ['BuildCookRun', `-project=${uproject}`, '-platform=Win64',
    '-clientconfig=Development', '-build', '-cook', '-stage', '-pak', '-archive', `-archivedirectory=${outDir}`, '-unattended'], opts, 40 * 60_000);
  const windows = join(outDir, 'Windows');
  const exe = existsSync(windows) ? readdirSync(windows).find(name => name.toLowerCase().endsWith('.exe')) : undefined;
  return {ok: exitCode === 0, log, errors: errorLines(log), ...(exe ? {exePath: join(windows, exe)} : {})};
}
