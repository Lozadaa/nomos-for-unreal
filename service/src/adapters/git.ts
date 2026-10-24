import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { gameSkills } from '../skills-install.ts';
import { gitLfs, type GitLfs } from './git-lfs.ts';
export type GitRun = (dir: string, args: string[], diff?: boolean, timeoutMs?: number) => Promise<string>;
export type Git = GitLfs & {
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
/** Lo que impide un --ff-only: sin seguir que se sobrescribiría y cambios locales de archivos seguidos (git los sangra con tabulador). */
function overwritten(text: string): {untracked: string[]; changed: string[]} | null {
  const found={untracked:[] as string[],changed:[] as string[]};
  let kind: keyof typeof found | null=null;
  for(const line of text.split(/\r?\n/)) {
    if(/untracked working tree files would be overwritten/.test(line)) kind='untracked';
    else if(/local changes to the following files would be overwritten/.test(line)) kind='changed';
    else if(line.startsWith('\t')&&kind) found[kind].push(line.trim());
    else kind=null;
  }
  return found.untracked.length||found.changed.length ? found : null;
}
export function createGit(): Git {
  // `timeoutMs`: tope para lo largo (git lfs migrate); sin él, sin tope
  const run: GitRun = (dir, args, diff = false, timeoutMs = 0) => new Promise<string>((accept, reject) => {
    const child = spawn('git', ['-c', 'core.quotepath=false', '-C', dir, ...args], {windowsHide:true,shell:false,env:{...process.env,LC_ALL:'C'}});
    let stdout='', stderr='';
    const timer = timeoutMs ? setTimeout(() => child.kill(), timeoutMs) : undefined;
    child.stdout.on('data', chunk => {stdout+=chunk;}); child.stderr.on('data', chunk => {stderr+=chunk;});
    child.on('error',reject);
    child.on('close',code => {clearTimeout(timer); code === 0 || diff && code === 1 ? accept(stdout) : reject(new Error(stderr || `git: ${code}`));});
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
      // huella del contenido por los shas de blob (diff --raw): un diff --binary de 1,5 GB tardaba más de 5 minutos; lo que
      // solo está en el árbol de trabajo sale con sha nulo y se hashea su contenido
      const raw=await run(dir,['diff','--raw','--no-abbrev','--no-renames','-z',base,...paths]);
      const fingerprint=createHash('sha256').update(raw), records=raw.split('\0');
      for (let i=0;i+1<records.length;i+=2) if (/ 0{40} \w$/.test(records[i]) && existsSync(join(dir,records[i+1])))
        fingerprint.update(JSON.stringify([records[i+1],createHash('sha256').update(readFileSync(join(dir,records[i+1]))).digest('hex')]));
      // los binarios (también renombrados o con cambio de modo, que no dicen «Binary files») se quitan del patch por ruta,
      // no con una exclusión por archivo: 1.361 rutas no caben en la línea de órdenes de Windows
      const binary=(await run(dir,['diff','--numstat','--no-renames','-z',base,...paths])).split('\0')
        .filter(record=>record.startsWith('-\t-\t')).map(record=>record.slice(4));
      const isBinary=(block:string)=>{const head=block.slice(0,block.indexOf('\n'));
        return binary.some(p=>head.startsWith(`diff --git a/${p} `)||head.endsWith(` b/${p}`));};
      let patch=await run(dir,['diff','--no-ext-diff',base,...paths]);
      const untracked=(await run(dir,['ls-files','--others','--exclude-standard','-z'])).split('\0').filter(p=>p&&!local(p)&&!generated(p)).sort();
      for (const file of untracked) {
        fingerprint.update(JSON.stringify([file,createHash('sha256').update(readFileSync(join(dir,file))).digest('hex')]));
        // Config sin seguir (puede llevar secretos del usuario): el revisor ve que existe, nunca su contenido
        if (/^Config\//.test(file)) { stat+=` ${file} | sin seguir (contenido fuera de la revisión)\n`; continue; }
        stat+=await run(dir,['diff','--no-index','--stat','--','/dev/null',file],true);
        patch+=await run(dir,['diff','--no-index','--no-ext-diff','--','/dev/null',file],true);
      }
      patch=patch.split(/(?=^diff --git )/m).filter(block=>!/^Binary files .+ differ$|^GIT binary patch$/m.test(block)&&!isBinary(block)).join('');
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
      if(!owner) { await run(repoDir,['update-ref',`refs/heads/${branch}`,commit,expected]); return; }
      const dir=owner.split(/\r?\n/)[0].slice('worktree '.length),ff=()=>run(dir,['merge','--ff-only',commit]);
      try { await ff(); return; } catch(error) {
        // hito 7: lo del checkout byte a byte igual a lo que llega (asset que Kratos migró sin versionar, la línea de LiveLink
        // ya puesta) se sustituye; lo distinto (Config con secretos del usuario) no se toca y el rechazo sigue, ya solo con eso
        const blocked=overwritten(error instanceof Error ? error.message : String(error));
        if(!blocked) throw error;
        const differ={untracked:[] as string[],changed:[] as string[]};
        for(const kind of ['untracked','changed'] as const) for(let i=0;i<blocked[kind].length;i+=100) {
          // hash-object aplica los filtros de .gitattributes (LFS) igual que el commit; por lotes, por la línea de órdenes
          const chunk=blocked[kind].slice(i,i+100);
          const local=(await run(dir,['hash-object','--',...chunk])).trim().split(/\r?\n/);
          const incoming=(await run(dir,['rev-parse',...chunk.map(f=>`${commit}:${f}`)])).trim().split(/\r?\n/);
          chunk.forEach((file,j)=>{ if(local[j]!==incoming[j]) differ[kind].push(file); });
        }
        // solo se toca algo si todo es igual: si el merge sigue sin poder hacerse, nada desaparece del disco
        if(differ.untracked.length||differ.changed.length) throw new Error([
          ...(differ.untracked.length ? ['error: The following untracked working tree files would be overwritten by merge:',...differ.untracked.map(f=>`\t${f}`)] : []),
          ...(differ.changed.length ? ['error: Your local changes to the following files would be overwritten by merge:',...differ.changed.map(f=>`\t${f}`)] : []),
        ].join('\n'));
        for(const file of blocked.untracked) rmSync(join(dir,file));
        for(let i=0;i<blocked.changed.length;i+=100) await run(dir,['checkout','--',...blocked.changed.slice(i,i+100)]);
        await ff();
      }
    },
    ...gitLfs(run),
  };
}
