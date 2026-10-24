import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GitRun } from './git.ts';

/** Patrones de Unreal que van a Git LFS (hito 5b, decisión del usuario «Ok git lfs»). */
export const lfsPatterns = ['*.uasset', '*.umap', '*.ubulk', '*.uexp', '*.uptnl', '*.dna', '*.fbx', '*.wav', '*.mp4', '*.tga', '*.psd', '*.exr'];

export type GitLfs = {
  /** Versión de git-lfs (`3.7.1`), o null si no está instalado. */
  lfsVersion(dir: string): Promise<string | null>;
  /** Archivos añadidos o cambiados entre `from` y `to` con el tamaño de su blob en `to` (un puntero LFS mide ~130 bytes). */
  blobSizes(dir: string, from: string, to: string): Promise<{path: string; size: number}[]>;
  /** Pasa a LFS los commits de `branch` que no están en `keep` (la rama objetivo nunca se reescribe) y borra los blobs viejos. */
  lfsMigrate(dir: string, branch: string, keep: string): Promise<void>;
  /** Commit en `dir` (el workspace de integración, en HEAD separada) de `.gitattributes` (si `content`) y de lo ya seguido que
   *  debía ser puntero LFS; devuelve el sha, o null si no había nada que cambiar. */
  commitAttributes(dir: string, content: string | null, message: string): Promise<string | null>;
  showFile(dir: string, ref: string, path: string): Promise<string | null>;
  hasRemote(dir: string): Promise<{any: boolean; github: boolean}>;
  /** `path` en `to` es el puntero LFS del mismo contenido que tenía en `from` (renormalizado, no cambiado). */
  samePointer(dir: string, from: string, to: string, path: string): Promise<boolean>;
};

/** sha256 y tamaño de un blob sin pasarlo por una cadena (un .uasset es binario). */
const blobDigest = (dir: string, ref: string) => new Promise<{oid: string; size: number}>((accept, reject) => {
  const child = spawn('git', ['-C', dir, 'cat-file', 'blob', ref], {windowsHide: true}), hash = createHash('sha256');
  let size = 0;
  child.stdout.on('data', (chunk: Buffer) => { hash.update(chunk); size += chunk.length; });
  child.on('error', reject);
  child.on('close', code => code === 0 ? accept({oid: hash.digest('hex'), size}) : reject(new Error(`git cat-file: ${code}`)));
});

export function gitLfs(run: GitRun): GitLfs {
  return {
    async lfsVersion(dir) {
      try { return (await run(dir, ['lfs', 'version'])).match(/git-lfs\/(\S+)/)?.[1] ?? null; } catch { return null; }
    },
    async blobSizes(dir, from, to) {
      const changed = new Set((await run(dir, ['diff', '--name-only', '-z', '--no-renames', '--diff-filter=AMT', from, to])).split('\0').filter(Boolean));
      // ls-tree -l: «modo tipo sha tamaño\truta»
      return (await run(dir, ['ls-tree', '-r', '-l', '-z', to])).split('\0').filter(Boolean)
        .map(record => { const [meta, path] = record.split('\t'); return {path, size: Number(meta.split(/ +/)[3]) || 0}; })
        .filter(file => changed.has(file.path));
    },
    async lfsMigrate(dir, branch, keep) {
      await run(dir, ['lfs', 'install', '--local']);
      // 1,5 GB tardan minutos: tope generoso (el comando va en el carril largo, con latido)
      await run(dir, ['lfs', 'migrate', 'import', `--include=${lfsPatterns.join(',')}`, `--include-ref=refs/heads/${branch}`,
        `--exclude-ref=refs/heads/${keep}`, '--yes'], false, 60 * 60_000);
      // los blobs de antes de migrar quedan sin referencia: fuera, para que .git no cargue los binarios dos veces
      await run(dir, ['reflog', 'expire', '--expire-unreachable=now', '--all']);
      await run(dir, ['gc', '--prune=now', '--quiet'], false, 30 * 60_000);
    },
    async commitAttributes(dir, content, message) {
      if (content !== null) { writeFileSync(join(dir, '.gitattributes'), content, 'utf8'); await run(dir, ['add', '--', '.gitattributes']); }
      // lo que la rama ya seguía como blob completo (un .uasset de antes) pasa a puntero: si no, con LFS en .gitattributes sale
      // «modificado» en cualquier checkout y el merge siguiente se niega. Solo esos (git lfs ls-files dice cuáles ya lo son)
      const pointers = new Set((await run(dir, ['lfs', 'ls-files', '-n'])).split(/\r?\n/).filter(Boolean));
      const stale = (await run(dir, ['ls-files', '-z', '--', ...lfsPatterns.map(p => `:(glob)**/${p}`)])).split('\0').filter(f => f && !pointers.has(f));
      for (let i = 0; i < stale.length; i += 100) await run(dir, ['add', '--renormalize', '--', ...stale.slice(i, i + 100)]);
      if (!(await run(dir, ['diff', '--cached', '--name-only'])).trim()) return null;
      await run(dir, ['commit', '-m', message]);
      return (await run(dir, ['rev-parse', '--verify', 'HEAD'])).trim();
    },
    async showFile(dir, ref, path) {
      try { return await run(dir, ['show', `${ref}:${path}`]); } catch { return null; }
    },
    async samePointer(dir, from, to, path) {
      const pointer = await run(dir, ['cat-file', 'blob', `${to}:${path}`]).catch(() => '');
      const oid = /^oid sha256:([0-9a-f]{64})$/m.exec(pointer)?.[1], size = Number(/^size (\d+)$/m.exec(pointer)?.[1]);
      if (!oid) return false;
      const before = await blobDigest(dir, `${from}:${path}`).catch(() => null);
      return before !== null && before.oid === oid && before.size === size;
    },
    async hasRemote(dir) {
      const urls = (await run(dir, ['remote', '-v'])).trim();
      return {any: urls.length > 0, github: /github\.com/i.test(urls)};
    },
  };
}
