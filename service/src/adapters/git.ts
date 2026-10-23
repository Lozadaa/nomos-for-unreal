import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
export type Git = {
  isRepo(dir: string): Promise<boolean>; currentBranch(dir: string): Promise<string>;
  excludeLocal(dir: string): Promise<void>;
  head(dir: string): Promise<string>; renameBranch(dir: string, name: string): Promise<void>;
  diff(dir: string, base: string): Promise<{stat: string; patch: string}>;
  log(dir: string, base: string): Promise<{sha: string; subject: string}[]>;
};
export function createGit(): Git {
  const run = (dir: string, args: string[], diff = false) => new Promise<string>((accept, reject) => {
    const child = spawn('git', ['-C', dir, ...args], {windowsHide:true,shell:false,env:{...process.env,LC_ALL:'C'}});
    let stdout='', stderr='';
    child.stdout.on('data', chunk => {stdout+=chunk;}); child.stderr.on('data', chunk => {stderr+=chunk;});
    child.on('error',reject);
    child.on('close',code => code === 0 || diff && code === 1 ? accept(stdout) : reject(new Error(stderr || `git: ${code}`)));
  });
  const local = (path: string) => /^(\.kratos(?:\/|$)|\.kratos-brief\.md$|\.kratos-inbox(?:\/|$))/.test(path);
  const paths = ['--', '.', ':!/.kratos', ':!/.kratos-brief.md', ':!/.kratos-inbox'];
  return {
    async isRepo(dir) {
      try {
        const root = resolve((await run(dir,['rev-parse','--show-toplevel'])).trim());
        const target = resolve(dir);
        return process.platform === 'win32' ? root.toLowerCase() === target.toLowerCase() : root === target;
      } catch {return false;}
    },
    async currentBranch(dir) {return (await run(dir,['branch','--show-current'])).trim();},
    async head(dir) {return (await run(dir,['rev-parse','--verify','HEAD'])).trim();},
    async renameBranch(dir,name) {await run(dir,['branch','-m',name]);},
    async excludeLocal(dir) {
      const common=resolve(dir,(await run(dir,['rev-parse','--git-common-dir'])).trim());
      mkdirSync(join(common,'info'),{recursive:true});
      const file=join(common,'info','exclude'),old=existsSync(file) ? readFileSync(file,'utf8') : '';
      const patterns=['/.kratos-brief.md','/.kratos-inbox/'];
      writeFileSync(file,old+'\n'+patterns.filter(p=>!old.split(/\r?\n/).includes(p)).join('\n')+'\n');
    },
    async diff(dir,base) {
      if (!base) throw new Error('invalid_base');
      let stat=await run(dir,['diff','--stat',base,...paths]);
      const binary=(await run(dir,['diff','--numstat','--no-renames','-z',base,...paths])).split('\0')
        .filter(record=>record.startsWith('-\t-\t')).map(record=>`:(literal,exclude)${record.slice(4)}`);
      let patch=await run(dir,['diff','--no-ext-diff',base,...paths,...binary]);
      const untracked=(await run(dir,['ls-files','--others','--exclude-standard','-z'])).split('\0').filter(p=>p&&!local(p));
      for (const file of untracked) {
        stat+=await run(dir,['diff','--no-index','--stat','--','/dev/null',file],true);
        patch+=await run(dir,['diff','--no-index','--no-ext-diff','--','/dev/null',file],true);
      }
      patch=patch.split(/(?=^diff --git )/m).filter(block=>!/^Binary files .+ differ$|^GIT binary patch$/m.test(block)).join('');
      return {stat,patch};
    },
    async log(dir,base) {
      if (!base) throw new Error('invalid_base');
      return (await run(dir,['log','--format=%H%x09%s',`${base}..HEAD`])).trim().split('\n').filter(Boolean)
        .map(line=>{const [sha,...subject]=line.split('\t');return {sha,subject:subject.join('\t')};});
    },
  };
}
