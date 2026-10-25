import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, createReadStream } from 'node:fs';
import { gameSkills } from '../skills-install.ts';
import { legacyLocalPaths } from '../legacy.ts';
import { gitLfs, type GitLfs } from './git-lfs.ts';
// hito 16: por streaming; readFileSync de un .uasset grande paraba el servicio (y no pasa de 2 GB)
export const fileHash = async (file: string) => { const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest('hex'); };
export type GitRun = (dir: string, args: string[], diff?: boolean, timeoutMs?: number) => Promise<string>;
export type Git = GitLfs & {
  isRepo(dir: string): Promise<boolean>; currentBranch(dir: string): Promise<string>; excludeLocal(dir: string): Promise<void>;
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
  /** Hito 13: «Commitear al run» al reconciliar un worker cancelado. */
  commitAll(dir: string, message: string): Promise<void>;
  /** Deshace en `dir` esos archivos: los seguidos vuelven a HEAD, los nuevos se borran (lo que escribió un lote de pruebas). */
  discard(dir: string, files: string[]): Promise<void>;
  branchExists(dir: string, branch: string): Promise<boolean>;
  contains(dir: string, branch: string, commit: string): Promise<boolean>; /** hito 22 */ tip?(dir: string, branch: string): Promise<string>; resetHard?(dir: string, ref: string): Promise<void>;
  filesBetween(dir: string, from: string, to: string): Promise<string[]>;
  advanceBranch(repoDir: string, branch: string, commit: string, expected: string): Promise<void>;
};
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
  const localPaths = ['.nomos', '.nomos-brief.md', '.nomos-inbox', '.nomos-review', ...legacyLocalPaths], paths = ['--', '.', ...localPaths.map(name => ':!/' + name)];
  const local = (path: string) => localPaths.some(name => path === name || path.startsWith(name + '/'));
  // hito 7: lo que Unreal genera al compilar o empaquetar no es trabajo del worker ni entra en la revisión
  const generated = (path: string) => /^(Build|Saved|Intermediate|DerivedDataCache|Binaries)\//.test(path);
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
      const patterns=['/.nomos-brief.md','/opencode.json','/.nomos-inbox/','/.nomos-review/',
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
        fingerprint.update(JSON.stringify([records[i+1],await fileHash(join(dir,records[i+1]))]));
      // los binarios (también renombrados o con cambio de modo, que no dicen «Binary files») se quitan del patch por ruta,
      // no con una exclusión por archivo: 1.361 rutas no caben en la línea de órdenes de Windows
      const binary=(await run(dir,['diff','--numstat','--no-renames','-z',base,...paths])).split('\0')
        .filter(record=>record.startsWith('-\t-\t')).map(record=>record.slice(4));
      const isBinary=(block:string)=>{const head=block.slice(0,block.indexOf('\n'));
        return binary.some(p=>head.startsWith(`diff --git a/${p} `)||head.endsWith(` b/${p}`));};
      let patch=await run(dir,['diff','--no-ext-diff',base,...paths]);
      const untracked=(await run(dir,['ls-files','--others','--exclude-standard','-z'])).split('\0').filter(p=>p&&!local(p)&&!generated(p)).sort();
      for (const file of untracked) {
        fingerprint.update(JSON.stringify([file,await fileHash(join(dir,file))]));
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
    async commitAll(dir,message) {await run(dir,['add','-A']);await run(dir,['commit','-m',message]);},
    async discard(dir,files) {
      for(let i=0;i<files.length;i+=100) {
        const chunk=files.slice(i,i+100),tracked=new Set((await run(dir,['ls-files','-z','--',...chunk])).split('\0').filter(Boolean));
        if(tracked.size) await run(dir,['checkout','HEAD','--',...tracked]);
        for(const file of chunk) if(!tracked.has(file)) rmSync(join(dir,file),{force:true});
      }
    },
    async tip(dir,branch) {return (await run(dir,['rev-parse','--verify',`refs/heads/${branch}`])).trim();}, async resetHard(dir,ref) {await run(dir,['reset','--hard',ref]);},
    async branchExists(dir,branch) {try {await run(dir,['rev-parse','--verify','--quiet',`refs/heads/${branch}`]);return true;} catch {return false;}},
    async contains(dir,branch,commit) {try {await run(dir,['merge-base','--is-ancestor',commit,`refs/heads/${branch}`]);return true;} catch {return false;}},
    async filesBetween(dir,from,to) {return (await run(dir,['diff','--name-only','-z',from,to])).split('\0').filter(Boolean);},
    async advanceBranch(repoDir,branch,commit,expected) {
      // si la rama está activa en algún checkout (el del usuario), avanzarla allí con --ff-only mantiene su árbol al día
      const trees=(await run(repoDir,['worktree','list','--porcelain'])).split(/\r?\n\r?\n/);
      const owner=trees.find(block=>block.split(/\r?\n/).includes(`branch refs/heads/${branch}`));
      if(!owner) { await run(repoDir,['update-ref',`refs/heads/${branch}`,commit,expected]); return; }
      const dir=owner.split(/\r?\n/)[0].slice('worktree '.length),ff=()=>run(dir,['merge','--ff-only',commit]);
      try { await ff(); return; } catch(error) {
        // hito 7: lo del checkout byte a byte igual a lo que llega (asset que Nomos migró sin versionar, la línea de LiveLink
        // ya puesta) se sustituye; lo distinto (Config con secretos del usuario) no se toca y el rechazo sigue, ya solo con eso
        // la lista la calcula Nomos: git trunca su mensaje a 4 KB y con cientos de archivos corta rutas a medias
        if(!/would be overwritten by merge/.test(error instanceof Error ? error.message : String(error))) throw error;
        const z=(out:string)=>out.split('\0').filter(Boolean);
        const incoming=new Set(z(await run(dir,['diff','--name-only','-z','--no-renames','--diff-filter=ACMRT','HEAD',commit])));
        // por contenido, nunca por la caché de stat de git (con .gitattributes recién cambiado da «sin cambios» según el reloj)
        const tracked=new Set(z(await run(dir,['ls-files','-z'])));
        const blocked={untracked:z(await run(dir,['ls-files','--others','--exclude-standard','-z'])).filter(f=>incoming.has(f)),
          changed:[...incoming].filter(f=>tracked.has(f)&&existsSync(join(dir,f)))};
        const differ={untracked:[] as string[],changed:[] as string[]},same:string[]=[];
        for(const kind of ['untracked','changed'] as const) for(let i=0;i<blocked[kind].length;i+=100) {
          // hash-object aplica los filtros de .gitattributes (LFS) igual que el commit; por lotes, por la línea de órdenes
          const chunk=blocked[kind].slice(i,i+100),blobs=(refs:string[])=>run(dir,['rev-parse',...refs]).then(o=>o.trim().split(/\r?\n/));
          const local=(await run(dir,['hash-object','--',...chunk])).trim().split(/\r?\n/);
          const next=await blobs(chunk.map(f=>`${commit}:${f}`)),head=kind==='changed' ? await blobs(chunk.map(f=>`HEAD:${f}`)) : [];
          // igual a lo que llega: se registra; igual a HEAD (seguido y sin tocar): el avance lo actualiza solo; si no, es del usuario
          chunk.forEach((file,j)=>{ if(local[j]===next[j]) same.push(file); else if(local[j]!==head[j]) differ[kind].push(file); });
        }
        // solo se toca algo si todo es igual: si el merge sigue sin poder hacerse, nada desaparece del disco
        if(differ.untracked.length||differ.changed.length) throw new Error([
          ...(differ.untracked.length ? ['error: The following untracked working tree files would be overwritten by merge:',...differ.untracked.map(f=>`\t${f}`)] : []),
          ...(differ.changed.length ? ['error: Your local changes to the following files would be overwritten by merge:',...differ.changed.map(f=>`\t${f}`)] : []),
        ].join('\n'));
        // lo igual se registra en el índice tal cual (el filtro limpio da el mismo blob) y el avance lo acepta sin borrar ni
        // reescribir nada del disco; también vale cuando .gitattributes acaba de pasar ese tipo a LFS
        if(!same.length) throw error;
        // --renormalize en los seguidos: sin él, `add` también se fía del stat y deja el blob viejo en el índice
        for(let i=0;i<same.length;i+=100) {
          const chunk=same.slice(i,i+100),known=chunk.filter(f=>tracked.has(f)),fresh=chunk.filter(f=>!tracked.has(f));
          if(known.length) await run(dir,['add','--renormalize','--',...known]);
          if(fresh.length) await run(dir,['add','--',...fresh]);
        }
        await ff();
      }
    },
    ...gitLfs(run),
  };
}
