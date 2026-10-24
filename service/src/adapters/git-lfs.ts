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
  /** Commit de un solo archivo en `dir` (el workspace de integración, en HEAD separada); devuelve el sha. */
  commitFile(dir: string, path: string, content: string, message: string): Promise<string>;
  showFile(dir: string, ref: string, path: string): Promise<string | null>;
  hasRemote(dir: string): Promise<{any: boolean; github: boolean}>;
};

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
    async commitFile(dir, path, content, message) {
      writeFileSync(join(dir, path), content, 'utf8');
      await run(dir, ['add', '--', path]);
      await run(dir, ['commit', '-m', message, '--', path]);
      return (await run(dir, ['rev-parse', '--verify', 'HEAD'])).trim();
    },
    async showFile(dir, ref, path) {
      try { return await run(dir, ['show', `${ref}:${path}`]); } catch { return null; }
    },
    async hasRemote(dir) {
      const urls = (await run(dir, ['remote', '-v'])).trim();
      return {any: urls.length > 0, github: /github\.com/i.test(urls)};
    },
  };
}
