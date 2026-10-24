import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { JsonValue } from '../model.ts';
import { encodeFrames } from '../adapters/ffmpeg.ts';
import { writeZip } from '../catalog/zip.ts';
import { decodePng, pixelDiffRatio } from './png.ts';
import { packages, scripts } from './blueprint.ts';
import { ffmpegOf, unrealOf, type Executor, type Outcome } from './run.ts';

/** Ficha del personaje que deja `character.setup` en la raíz del proyecto (y en el diff): qué malla y qué clips se prueban. */
export type CharacterSpec = {mesh: string; animations: string[]; targetSkeleton?: 'metahuman'};
export const specFile = 'kratos-personaje.json';
export const resolutions: [number, number][] = [[1280, 720], [1920, 1080]];
/** Review Focus 9: por debajo de este cambio medio entre fotogramas, la animación no se mueve. */
export const minMotion = 0.002;
export const animMap = '/Game/Kratos/Maps/AnimTest';

type Frame = {fraction: number; ratio: number; pose_diff: number | null; worst_bone: string | null; zero_scale_bones: string[];
  stretch?: {pelvis_cm: number; errors: string[]}; deformation_ok: boolean; screenshot: string | null};
type Capture = {ok: boolean; frames: Frame[]; errors: string[]; engine?: string; video_frames?: number; video_seconds?: number};
const short = (path: string) => path.split('/').at(-1)!.split('.')[0];
const pct = (fraction: number) => `${Math.round(fraction * 100)} %`;
const comma = (n: number) => String(n).replace('.', ',');

export function readSpec(dir: string): CharacterSpec | null {
  try { return JSON.parse(readFileSync(join(dir, specFile), 'utf8')); } catch { return null; }
}

/** Sin ficha: la primera malla con esqueleto del diff y sus clips. */
function fromDiff(files: string[]): CharacterSpec | null {
  const pkgs = packages(files, f => /\.uasset$/i.test(f));
  const mesh = pkgs.find(p => /\/(SKM|SK)_[^/]+$/i.test(p)), animations = pkgs.filter(p => /\/(AM|A|MM|BS)_[^/]+$/i.test(p));
  return mesh && animations.length ? {mesh, animations} : null;
}

/** El personaje que probaría `animation`: la ficha del árbol o la malla y los clips del diff; sin él, la comprobación no aplica. */
export const characterOf = (worktree: string, files: string[]) => readSpec(worktree) ?? fromDiff(files);

/** Diferencia media entre fotogramas (uno de cada tres pares, para no decodificar 240 PNG). */
export function motionOf(dir: string): number {
  const frames = readdirSync(dir).filter(f => /^frame_\d+\.png$/.test(f)).sort();
  const ratios: number[] = [];
  for (let i = 0; i + 1 < frames.length; i += 3)
    ratios.push(pixelDiffRatio(decodePng(readFileSync(join(dir, frames[i]))), decodePng(readFileSync(join(dir, frames[i + 1])))));
  return ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;
}

/**
 * Comprobación `animation` (hito 5b): prepara el personaje (retarget si su esqueleto es otro), lo juega a 1280×720 y 1920×1080
 * congelado en el 0, 50 y 90 % del clip con la comprobación de deformación, y graba el clip entero como vídeo (corrección 2).
 */
export function animationCheck(given?: CharacterSpec): Executor {
  return async (ctx, {project, files, dir, worktree}, deps) => {
    const spec = given ?? characterOf(worktree, files);
    if (!spec) return {result: 'skipped', log: '', summary: [`Sin personaje que reproducir: falta ${specFile} y el diff no trae malla y clips`]};
    const unreal = unrealOf(ctx, deps), clip = short(spec.animations[0]);
    const setup = await unreal.runPython(project.uproject, join(scripts, 'kratos_character.py'), {KRATOS_MESH: spec.mesh,
      KRATOS_ANIMATIONS: JSON.stringify(spec.animations), KRATOS_TARGET: spec.targetSkeleton ?? '', KRATOS_MAP: animMap}, 15 * 60_000);
    const character = setup.reportJson as Record<string, any> | undefined;
    const logs = [setup.log], artifacts: NonNullable<Outcome['artifacts']> = [];
    if (!character) return {result: 'failed', log: setup.log, summary: [`El editor terminó con código ${setup.exitCode} sin el informe del personaje`]};
    const report = (name: string, label: string, data: unknown) => {
      writeFileSync(join(dir, name), JSON.stringify(data, null, 2), 'utf8');
      artifacts.push({kind: 'report', path: join(dir, name), provenance: {label}});
    };
    if (character.retarget) report('retarget.json', 'Retarget · informe', character.retarget);
    const critical: string[] = character.retarget?.critical_unmapped ?? [];
    if (critical.length) return {result: 'failed', log: setup.log, engine: character.engine, artifacts,
      summary: [`Retarget manual: ${critical.join(', ')} sin mapear`, ...(character.errors ?? [])]};
    if (!character.ok) return {result: 'failed', log: setup.log, engine: character.engine, artifacts, summary: character.errors?.length ? character.errors : ['El personaje no quedó listo']};
    const failures: string[] = [], lines: string[] = [], deformation: Record<string, JsonValue> = {};
    for (const [width, height] of resolutions) {
      const res = `${width}×${height}`, prefix = `anim-${width}x${height}`, frames = width === 1280 ? join(dir, 'fotogramas') : '';
      const run = await unreal.runPython(project.uproject, join(scripts, 'kratos_anim_capture.py'), {KRATOS_SHOT_DIR: dir, KRATOS_PREFIX: prefix,
        KRATOS_REST: JSON.stringify(character.rest_extent ?? null), KRATOS_PELVIS: JSON.stringify(character.rest_pelvis ?? null),
        KRATOS_WAIT: String(deps.playSeconds ?? 10), ...(frames ? {KRATOS_VIDEO_DIR: frames} : {})}, 10 * 60_000, {render: {width, height, map: animMap}});
      logs.push(run.log);
      const capture = run.reportJson as Capture | undefined;
      if (!capture?.frames?.length) { failures.push(`${res}: ${capture?.errors?.join('; ') || 'el juego no produjo las capturas'}`); continue; }
      deformation[res] = capture.frames as unknown as JsonValue;
      for (const frame of capture.frames) {
        if (frame.screenshot) artifacts.push({kind: 'screenshot', path: frame.screenshot,
          provenance: {label: `Animación · captura ${res} · ${pct(frame.fraction)}`, resolution: `${width}x${height}`, map: animMap, fraction: frame.fraction}});
        // Review Focus 10: la malla estirada hacia la raíz se dice tal cual, antes que cualquier otra medida
        for (const error of frame.stretch?.errors ?? []) failures.push(`${res} ${pct(frame.fraction)}: ${error}`);
        if (!frame.deformation_ok && !frame.stretch?.errors.length) failures.push(`${res} ${pct(frame.fraction)}: deformación (caja ×${comma(frame.ratio)}`
          + `${frame.pose_diff !== null ? `, pose ${comma(frame.pose_diff)} en ${frame.worst_bone}` : ''}${frame.zero_scale_bones.length ? `, huesos a escala 0: ${frame.zero_scale_bones.join(', ')}` : ''})`);
      }
      failures.push(...capture.errors.map(e => `${res}: ${e}`));
      if (!frames || !existsSync(frames)) continue;
      const motion = motionOf(frames);
      if (motion < minMotion) failures.unshift(`${res}: la animación no se reproduce (cambio medio entre fotogramas ${comma(Number((motion * 100).toFixed(2)))} %)`);
      const middle = capture.frames.find(f => f.fraction === 0.5)?.screenshot ?? undefined;
      const side = existsSync(join(frames, 'lateral', 'frame_0000.png')) ? join(frames, 'lateral') : undefined;
      const ff = ffmpegOf(ctx, deps), meta = {resolution: `${width}x${height}`, clip, seconds: capture.video_seconds ?? null,
        frames: capture.video_frames ?? null, angles: side ? 2 : 1};
      if (ff) {
        const video = join(dir, `${prefix}.mp4`);
        await encodeFrames(ff, frames, video, side);
        artifacts.push({kind: 'video', path: video, previewPath: middle, provenance: {label: `Animación · vídeo ${res} · ${clip}`, ...meta}});
      } else {
        const zip = join(dir, `${prefix}-fotogramas.zip`);
        const pngs = (d: string, prefix = '') => readdirSync(d).filter(n => n.endsWith('.png')).sort().map(name => ({name: prefix + name, path: join(d, name)}));
        writeZip([...pngs(frames), ...(side ? pngs(side, 'lateral/') : [])], zip);
        artifacts.push({kind: 'report', path: zip, provenance: {label: `Animación · fotogramas ${res} · ${clip}`, ...meta}});
        lines.push('Vídeo: sin ffmpeg, los fotogramas van en un zip');
      }
      lines.push(`${res}: ${capture.video_frames ?? '?'} fotogramas, movimiento medio ${comma(Number((motion * 100).toFixed(1)))} %`);
    }
    report('deformacion.json', 'Deformación · informe', deformation);
    const played = (character.clips ?? []).map((c: {played: string; retargeted: boolean}) => `${short(c.played)}${c.retargeted ? ' (retargeteado)' : ''}`);
    return {result: failures.length ? 'failed' : 'passed', log: logs.join('\n'), map: animMap, engine: character.engine,
      config: resolutions.map(r => r.join('x')).join(', '), artifacts,
      summary: failures.length ? failures : [`${short(spec.mesh)} reproduce ${played.join(', ')} sin deformación`, ...lines]};
  };
}
