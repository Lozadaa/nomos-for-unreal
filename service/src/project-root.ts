import { readdirSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFile } from 'node:child_process';

const fold=(value: string)=>process.platform==='win32' ? value.toLowerCase() : value;
async function commonDir(dir: string): Promise<string | undefined> {
  return new Promise(accept=>execFile('git',['-C',dir,'rev-parse','--git-common-dir'],{windowsHide:true},(error,stdout)=>{
    if (error) return accept(undefined);
    try {accept(fold(realpathSync(resolve(dir,stdout.trim()))));} catch {accept(undefined);}
  }));
}
export async function requireGameProject(projectDir: string): Promise<void> {
  const own=resolve(import.meta.dirname,'../..');
  const target=realpathSync(projectDir);
  if (fold(target)===fold(realpathSync(own))) throw new Error('invalid_kratos_project');
  const [projectGit,ownGit]=await Promise.all([commonDir(target),commonDir(own)]);
  if (projectGit && projectGit===ownGit) throw new Error('invalid_kratos_project');
  if (!readdirSync(target,{withFileTypes:true}).some(e=>e.isFile() && e.name.toLowerCase().endsWith('.uproject')))
    throw new Error('invalid_unreal_project');
}

export type ProjectInfo = { name: string; uproject: string } | null;

/** Busca un .uproject en la carpeta de datos y, si no hay, en su padre. */
export function projectInfo(dataDir: string | undefined): ProjectInfo {
  if (!dataDir) return null;
  for (const dir of [dataDir, dirname(dataDir)]) {
    try {
      const file = readdirSync(dir).filter(name => name.endsWith('.uproject')).sort()[0];
      if (file) return { name: file.slice(0, -'.uproject'.length), uproject: file };
    } catch { /* carpeta ilegible: se prueba la siguiente */ }
  }
  return null;
}
