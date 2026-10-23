import { readFile, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname, sep, join, win32 } from 'node:path';
import { json } from '../http.ts';
import { listArtifacts } from '../repo/artifacts.ts';
import { read } from '../repo/rows.ts';
import type { Artifact } from '../model.ts';
import { id, type Context } from './context.ts';

function contained(root: string, file: string): boolean {
  const rel = relative(root, file);
  return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
}

export async function file(res: Context['res'], root: string | undefined, name: string): Promise<void> {
  const hasTraversal = name.split(/[\\/]/).includes('..');
  const driveRelative = /^[a-z]:[^\\/]/i.test(name) || /^[a-z]:$/i.test(name);
  if (name.includes('\0') || hasTraversal || driveRelative) throw new Error('invalid_artifact_path');
  if (!root) throw new Error('unknown_file');
  const candidate = resolve(root, name);
  if (!contained(root, candidate) || (win32.isAbsolute(name) && !isAbsolute(name))) {
    throw new Error('invalid_artifact_path');
  }
  try {
    const actualRoot = await realpath(root);
    const actual = await realpath(candidate);
    if (!contained(actualRoot, actual)) throw new Error('invalid_artifact_path');
    const content = await readFile(actual);
    const types: Record<string, string> = {
      '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json; charset=utf-8',
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
      '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
      '.json': 'application/json; charset=utf-8', '.html': 'text/html; charset=utf-8',
      '.pdf': 'application/pdf', '.mp4': 'video/mp4'
    };
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    res.writeHead(200, {'Content-Type': types[extname(actual).toLowerCase()] ?? 'application/octet-stream'});
    res.end(content);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR') throw new Error('unknown_file');
    throw error;
  }
}

export async function artifacts({db, req, res, url, dataDir}: Context): Promise<boolean> {
  if (req.method !== 'GET') return false;
  if (url.pathname === '/artifacts') {
    json(res, 200, listArtifacts(db, {taskId: url.searchParams.get('taskId') ?? undefined}));
    return true;
  }
  const match = /^\/artifacts\/([^/]+)\/file$/.exec(url.pathname);
  if (!match) return false;
  const artifactId = id(match[1]);
  // node:sqlite text reads truncate at NUL, so check the stored value in SQL first.
  const unsafe = db.prepare('select instr(path,char(0)) nul from artifacts where id=?').get(artifactId);
  if (unsafe && Number(unsafe.nul) > 0) throw new Error('invalid_artifact_path');
  const artifact = read<Artifact>(db, 'artifacts', artifactId);
  if (!artifact) throw new Error('unknown_artifact');
  await file(res, dataDir ? resolve(join(dataDir, 'artifacts')) : undefined, artifact.path);
  return true;
}
