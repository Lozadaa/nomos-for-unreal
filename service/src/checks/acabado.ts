import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runLogged, quote } from '../adapters/process.ts';
import { nomosSkills } from '../skills-install.ts';
import { pythonBin } from '../config.ts';
import { empaqueta, selectChecks } from './select.ts';
import type { Executor } from './run.ts';

/** Diff con algo que el jugador puede ver: código del juego, assets, mapas o la config de empaquetado. */
export const touchesVisible = (files: string[]) => files.some(f => /\.(cpp|h|hpp|uasset|umap)$/i.test(f) || /(^|[\\/])Config[\\/]Default[^\\/]*\.ini$/i.test(f));
export const acabadoScript = () => join(nomosSkills, 'ue-oficio', 'scripts', 'revisar_acabado.py');

/**
 * Acabado (2026-11-10, metras Canicas-6): nada del motor por defecto en lo que ve el jugador y texturas que se empaquetan.
 * Solo los archivos del diff, sin Unreal. Las reglas de juego entero (pantalla de carga, MapsToCook, fuente propia) solo
 * en la tarea que empaqueta (`build`): así la pista de gameplay no falla por lo que aún le toca a la visual.
 */
export const acabadoCheck: Executor = async (_ctx, {task, files, worktree, dir}) => {
  const script = acabadoScript();
  if (!existsSync(script)) return {result: 'unavailable', log: '', summary: [`Falta ${script}: reinstala las skills de Nomos`]};
  const lista = join(dir, 'archivos.txt');
  writeFileSync(lista, files.join('\n') + '\n', 'utf8');
  const final = selectChecks(files, task.scope).includes('build') || empaqueta(task);
  const [bin, ...pre] = pythonBin();
  const {exitCode, log} = await runLogged(bin, [...pre, script, worktree, '--archivos-de', lista, ...(final ? [] : ['--parcial'])].map(quote),
    {timeoutMs: 120_000});
  const fallos = log.split(/\r?\n/).filter(l => l.startsWith('FALLO ')).map(l => l.slice(6));
  // excepciones `forma-basica` (2026-11-11): se cuentan siempre; más de cinco es aviso
  const formas = log.split(/\r?\n/).filter(l => /formas básicas con motivo/.test(l));
  if (exitCode === 0) return {result: 'passed', log, summary: [final ? 'Acabado del juego entero sin fallos' : 'Acabado del diff sin fallos', ...formas]};
  return {result: 'failed', log, summary: fallos.length
    ? [`Acabado: ${fallos.length} fallos (lee ue-oficio/references/acabado.md)`, ...fallos]
    : ['revisar_acabado.py terminó con error sin lista de fallos: revisa el log']};
};
