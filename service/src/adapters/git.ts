import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { gameSkills } from '../skills-install.ts';
export type Git = {
  isRepo(dir: string): Promise<boolean>; currentBranch(dir: string): Promise<string>;
  excludeLocal(dir: string): Promise<void>;
  head(dir: string): Promise<string>; renameBranch(dir: string, name: string): Promise<void>;
  diff(dir: string, base: string): Promise<{stat: string; patch: string; fingerprint?:string}>;
  log(dir: string, base: string): Promise<{sha: string; subject: string}[]>;
  changedFiles?(dir: string, base: string): Promise<string[]>;
  // integración y cierre (hito 6)
  merge(dir: string, branch: string, opts: {noFf: true; message?: string}): Promise<{ok: true; commit: string} | {ok: false; conflicts: string[]}>;
  conflictKinds(dir: string): Promise<{text: string[]; binary: string[]; versions: Record<string, {ours: string | null; theirs: string | null}>}>;
  conflictText(dir: string, file: string): Promise<string>;
  abortMerge(dir: string): Promise<void>;
  checkout(dir: string, ref: string): Promise<void>;
  worktreeAdd(repoDir: string, path: string, ref: string): Promise<void>;
  worktreeRemove(repoDir: string, path: string): Promise<void>;
  status(dir: string): Promise<{clean: boolean; files: string[]}>;
  branchExists(dir: string, branch: string): Promise<boolean>;
  contains(dir: string, branch: string, commit: string): Promise<boolean>;
  filesBetween(dir: string, from: string, to: string): Promise<string[]>;
  advanceBranch(repoDir: string, branch: string, commit: string, expected: string): Promise<void>;
};
export function createGit(): Git {
  const run = (dir: string, args: string[], diff = false) => new Promise<string>((accept, reject) => {
    const child = spawn('git', ['-c', 'core.quotepath=false', '-C', dir, ...args], {windowsHide:true,shell:false,env:{...process.env,LC_ALL:'C'}});
    let stdout='', stderr='';
    child.stdout.on('data', chunk => {stdout+=chunk;}); child.stderr.on('data', chunk => {stderr+=chunk;});
    child.on('error',reject);
    child.on('close',code => code === 0 || diff && code === 1 ? accept(stdout) : reject(new Error(stderr || `git: ${code}`)));
  });
  const local = (path: string) => /^(\.kratos(?:\/|$)|\.kratos-brief\.md$|\.kratos-inbox(?:\/|$)|\.kratos-review(?:\/|$))/.test(path);
  // hito 7: lo que Unreal genera al compilar o empaquetar no es trabajo del worker ni entra en la revisión
  const generated = (path: string) => /^(Build|Saved|Intermediate|DerivedDataCache|Binaries)\//.test(path);
  const paths = ['--', '.', ':!/.kratos', ':!/.kratos-brief.md', ':!/.kratos-inbox', ':!/.kratos-review'];
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
      const patterns=['/.kratos-brief.md','/.kratos-inbox/','/.kratos-review/',
        ...gameSkills.map(name=>`/.claude/skills/${name}/`)];
      writeFileSync(file,old+'\n'+patterns.filter(p=>!old.split(/\r?\n/).includes(p)).join('\n')+'\n');
    },
    async diff(dir,base) {
      if (!base) throw new Error('invalid_base');
      let stat=await run(dir,['diff','--stat',base,...paths]);
      const fingerprint=createHash('sha256').update(await run(dir,['diff','--binary','--no-ext-diff',base,...paths]));
      const binary=(await run(dir,['diff','--numstat','--no-renames','-z',base,...paths])).split('\0')
        .filter(record=>record.startsWith('-\t-\t')).map(record=>`:(literal,exclude)${record.slice(4)}`);
      let patch=await run(dir,['diff','--no-ext-diff',base,...paths,...binary]);
      const untracked=(await run(dir,['ls-files','--others','--exclude-standard','-z'])).split('\0').filter(p=>p&&!local(p)&&!generated(p)).sort();
      for (const file of untracked) {
        fingerprint.update(JSON.stringify([file,createHash('sha256').update(readFileSync(join(dir,file))).digest('hex')]));
        // Config sin seguir (puede llevar secretos del usuario): el revisor ve que existe, nunca su contenido
        if (/^Config\//.test(file)) { stat+=` ${file} | sin seguir (contenido fuera de la revisión)\n`; continue; }
        stat+=await run(dir,['diff','--no-index','--stat','--','/dev/null',file],true);
        patch+=await run(dir,['diff','--no-index','--no-ext-diff','--','/dev/null',file],true);
      }
      patch=patch.split(/(?=^diff --git )/m).filter(block=>!/^Binary files .+ differ$|^GIT binary patch$/m.test(block)).join('');
      return {stat,patch,fingerprint:fingerprint.digest('hex')};
    },
    async changedFiles(dir,base) {
      if (!base) throw new Error('invalid_base');
      const tracked=(await run(dir,['diff','--name-only','-z',base,...paths])).split('\0');
      const untracked=(await run(dir,['ls-files','--others','--exclude-standard','-z'])).split('\0');
      return [...new Set([...tracked,...untracked])].filter(p=>p&&!local(p)).sort();
    },
    async log(dir,base) {
      if (!base) throw new Error('invalid_base');
      return (await run(dir,['log','--format=%H%x09%s',`${base}..HEAD`])).trim().split('\n').filter(Boolean)
        .map(line=>{const [sha,...subject]=line.split('\t');return {sha,subject:subject.join('\t')};});
    },
    async merge(dir,branch,opts) {
      try {
        await run(dir,['-c','merge.conflictStyle=diff3','merge','--no-ff','--no-edit',...(opts.message ? ['-m',opts.message] : []),branch]);
        return {ok:true,commit:(await run(dir,['rev-parse','--verify','HEAD'])).trim()};
      } catch(error) {
        const conflicts=(await run(dir,['diff','--name-only','--diff-filter=U','-z'])).split('\0').filter(Boolean);
        if(!conflicts.length) throw error;
        return {ok:false,conflicts};
      }
    },
    async conflictKinds(dir) {
      // ls-files -u: «modo sha etapa\truta»; etapa 2 = rama objetivo (ours), 3 = rama del worktree (theirs)
      const versions:Record<string,{ours:string|null;theirs:string|null}>={};
      for(const record of (await run(dir,['ls-files','-u','-z'])).split('\0').filter(Boolean)) {
        const [meta,path]=record.split('\t'),[,sha,stage]=meta.split(' ');
        versions[path]??={ours:null,theirs:null};
        if(stage==='2') versions[path].ours=sha; if(stage==='3') versions[path].theirs=sha;
      }
      const text:string[]=[],binary:string[]=[];
      for(const [path,v] of Object.entries(versions)) {
        // misma heurística que Git: un NUL en los primeros 8000 bytes de cualquiera de los lados es binario
        const sides=await Promise.all([v.ours,v.theirs].filter((s):s is string=>!!s).map(sha=>run(dir,['cat-file','blob',sha])));
        (sides.some(side=>side.slice(0,8000).includes('\0')) || /\.(uasset|umap)$/i.test(path) ? binary : text).push(path);
      }
      return {text,binary,versions};
    },
    async conflictText(dir,file) {return readFileSync(join(dir,file),'utf8');},
    async abortMerge(dir) {await run(dir,['merge','--abort']);},
    async checkout(dir,ref) {await run(dir,['checkout','--detach',ref]);},
    async worktreeAdd(repoDir,path,ref) {await run(repoDir,['worktree','add','--detach',path,ref]);},
    // sin --force: si el árbol tiene cambios, Git se niega y el cierre se detiene con el motivo
    async worktreeRemove(repoDir,path) {await run(repoDir,['worktree','remove',path]);},
    async status(dir) {
      const files=(await run(dir,['status','--porcelain','-z','--untracked-files=all'])).split('\0').filter(Boolean)
        .map(record=>record.slice(3)).filter(path=>path&&!local(path));
      return {clean:!files.length,files};
    },
    async branchExists(dir,branch) {
      try {await run(dir,['rev-parse','--verify','--quiet',`refs/heads/${branch}`]);return true;} catch {return false;}
    },
    async contains(dir,branch,commit) {
      try {await run(dir,['merge-base','--is-ancestor',commit,`refs/heads/${branch}`]);return true;} catch {return false;}
    },
    async filesBetween(dir,from,to) {
      return (await run(dir,['diff','--name-only','-z',from,to])).split('\0').filter(Boolean);
    },
    async advanceBranch(repoDir,branch,commit,expected) {
      // si la rama está activa en algún checkout (el del usuario), avanzarla allí con --ff-only mantiene su árbol al día
      const trees=(await run(repoDir,['worktree','list','--porcelain'])).split(/\r?\n\r?\n/);
      const owner=trees.find(block=>block.split(/\r?\n/).includes(`branch refs/heads/${branch}`));
      if(owner) {
        const dir=owner.split(/\r?\n/)[0].slice('worktree '.length),ff=()=>run(dir,['-c','core.quotepath=false','merge','--ff-only',commit]);
        try { await ff(); return; } catch(error) {
          // hito 7: un sin seguir byte a byte igual al que llega (asset que Kratos migró sin versionar) se sustituye;
          // uno distinto (Config con secretos del usuario) no se toca y el rechazo sigue, ya solo con esos
          const text=error instanceof Error ? error.message : String(error);
          if(!/untracked working tree files would be overwritten/.test(text)) throw error;
          const files=text.split(/\r?\n/).filter(l=>l.startsWith('\t')).map(l=>l.trim());
          const differ=[];
          for(const file of files) if((await run(dir,['hash-object','--',file])).trim()!==(await run(dir,['rev-parse',`${commit}:${file}`])).trim()) differ.push(file);
          // solo se borra si todos son iguales: si el merge sigue sin poder hacerse, nada desaparece del disco
          if(differ.length) throw new Error(`error: The following untracked working tree files would be overwritten by merge:\n${differ.map(f=>`\t${f}`).join('\n')}`);
          for(const file of files) rmSync(join(dir,file));
          await ff();
        }
      }
      else await run(repoDir,['update-ref',`refs/heads/${branch}`,commit,expected]);
    },
  };
}
