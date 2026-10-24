import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { quote, runLogged } from './process.ts';

/** Ejecutable de ffmpeg; en pruebas, node con el ffmpeg falso en `baseArgs`. */
export type Ffmpeg = {bin: string; baseArgs?: string[]};

/** `ffmpegPath` del config.json, si no `ffmpeg.exe` del PATH y, por último, el enlace que deja winget. */
export function findFfmpeg(configured?: unknown): Ffmpeg | null {
  if (typeof configured === 'string' && configured.trim()) return existsSync(configured) ? {bin: configured} : null;
  const dirs = (process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':').filter(Boolean);
  const local = process.env.LOCALAPPDATA ? [join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links')] : [];
  for (const dir of [...dirs, ...local])
    for (const name of ['ffmpeg.exe', 'ffmpeg']) if (existsSync(join(dir, name))) return {bin: join(dir, name)};
  return null;
}

const run = (ff: Ffmpeg, args: string[], timeoutMs = 120_000) =>
  runLogged(ff.bin, [...(ff.baseArgs ?? []), ...args].map(quote), {timeoutMs});

/** «8.1.2-full_build-www.gyan.dev» de `ffmpeg -version`; null si no arranca. */
export async function ffmpegVersion(ff: Ffmpeg): Promise<string | null> {
  try { return (await run(ff, ['-version'], 15_000)).log.match(/ffmpeg version (\S+)/)?.[1] ?? null; } catch { return null; }
}

/** `frame_0000.png…` → MP4 H.264 yuv420p a `fps` con faststart (se reproduce en el navegador sin descargarlo entero). */
export async function encodeFrames(ff: Ffmpeg, dir: string, out: string, fps = 30, crf = 23): Promise<void> {
  const {exitCode, log} = await run(ff, ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(dir, 'frame_%04d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', String(crf), '-movflags', '+faststart', out]);
  if (exitCode !== 0 || !existsSync(out)) throw Object.assign(new Error('ffmpeg_failed'), {log});
}
