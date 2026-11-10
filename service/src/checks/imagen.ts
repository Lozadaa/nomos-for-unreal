import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runLogged, quote } from '../adapters/process.ts';
import { nomosSkills } from '../skills-install.ts';
import { demoConfig, pythonBin, readConfig } from '../config.ts';
import { scripts } from './blueprint.ts';
import { unrealOf, type Executor } from './run.ts';

export const imagenScript = () => join(nomosSkills, 'ue-oficio', 'scripts', 'revisar_imagen.py');

/**
 * Imagen (jam vista, 2026-11-10): Candela B salió ilegible (brasa de 10 px, medio cuadro negro, arranque en negro) y ninguna
 * puerta miraba la imagen. Juego en `-game` con el editor (el Shipping no tiene Python para el JSON de escena) y su modo demo,
 * tres capturas y `revisar_imagen.py`. Solo en la tarea que empaqueta, tras compilar.
 */
export const imagenCheck: Executor = async (ctx, {project, dir}, deps) => {
  const script = deps.imagenScript ?? imagenScript();
  if (!existsSync(script)) return {result: 'unavailable', log: '', summary: [`Falta ${script}: reinstala las skills de Nomos`]};
  const demo = demoConfig(readConfig(ctx.dataDir), project.name), out = join(dir, 'capturas');
  const game = await unrealOf(ctx, deps).runPython(project.uproject, join(scripts, 'nomos_demo.py'),
    {NOMOS_DEMO_DIR: out, NOMOS_DEMO_SEGUNDOS: demo.segundos.join(','), [demo.env]: '1'}, 5 * 60_000, {render: {width: 1280, height: 720}});
  if (!game.log.includes('NOMOS_DEMO activo'))
    return {result: 'unavailable', log: game.log, summary: [`El juego no tiene modo demo: variable \`${demo.env}\`=1 debe jugarlo solo y escribir «NOMOS_DEMO activo» en el log`]};
  const shots = ['inicio', 'mitad', 'final'].map(n => join(out, `${n}.png`));
  const artifacts = shots.filter(p => existsSync(p)).map(path => ({kind: 'screenshot' as const, path, provenance: {demo: true}}));
  const [bin, ...pre] = pythonBin();
  const {exitCode, log} = await runLogged(bin, [...pre, script, out].map(quote), {timeoutMs: 120_000});
  const lines = log.split(/\r?\n/).filter(l => /^(FALLO|AVISO) /.test(l));
  if (exitCode === 3) return {result: 'unavailable', log, summary: ['Falta Pillow para medir las capturas: pip install pillow']};
  if (exitCode === 0) return {result: 'passed', log, artifacts, summary: ['Las tres capturas del modo demo se leen', ...lines]};
  return {result: 'failed', log: `${log}\n${game.log}`, artifacts, summary: lines.length
    ? [`Imagen: ${lines.filter(l => l.startsWith('FALLO')).length} fallos (ábrelas: ${out})`, ...lines]
    : ['revisar_imagen.py terminó con error sin lista de fallos: revisa el log']};
};
