import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { WorkerContext } from '../runner.ts';
import type { Artifact, JsonValue, Run, Task, TestRun } from '../model.ts';
import { filtered, read } from '../repo/rows.ts';
import { locatedPath } from '../data-paths.ts';
import { nomosSkills } from '../skills-install.ts';
import { demoConfig, limits, readConfig } from '../config.ts';
import { scripts } from './blueprint.ts';
import { unrealOf, type Executor } from './run.ts';

/** Criterios del juez de arte (references/brief-juez-arte.md); todos deben quedar en 2 o más. */
export const criteriosArte = ['forma', 'materiales', 'suelo_fondo', 'luz_color', 'camara', 'efectos', 'coherencia'];
const tomas = (dir: string) => existsSync(dir) ? readdirSync(dir).filter(n => /^(inicio|mitad|final|detalle-.+)\.png$/i.test(n)).sort() : [];

/**
 * Arte (2026-11-11): Trompo con Nomos salió con formas básicas y colores planos y ninguna puerta miraba el oficio.
 * Reutiliza las capturas de `imagen` de este mismo lote (nomos_demo.py ya saca los primeros planos `detalle-<rol>`);
 * si no las hay, juega el modo demo. Queda `running`: decide el juez de arte (review.start con `arte`).
 */
export const arteCheck: Executor = async (ctx, {project, dir, run}, deps) => {
  const imagen = filtered<TestRun>(ctx.db, 'test_runs', {runId: run.id, checkId: 'imagen'}).at(-1);
  let out = imagen ? join(ctx.dataDir, 'artifacts', 'tests', imagen.id, 'capturas') : '', log = '';
  if (!tomas(out).some(n => n.startsWith('detalle-'))) {
    const demo = demoConfig(readConfig(ctx.dataDir), project.name);
    out = join(dir, 'capturas');
    const game = await unrealOf(ctx, deps).runPython(project.uproject, join(scripts, 'nomos_demo.py'),
      {NOMOS_DEMO_DIR: out, NOMOS_DEMO_SEGUNDOS: demo.segundos.join(','), [demo.env]: '1'}, 6 * 60_000, {render: {width: 1280, height: 720}});
    log = game.log;
  }
  const shots = tomas(out);
  if (!shots.length) return {result: 'unavailable', log, summary: ['El modo demo no dejó capturas para el juez de arte']};
  return {result: 'running', log, summary: [`${shots.length} capturas para el juez de arte: ${shots.join(', ')}`],
    artifacts: shots.map(n => ({kind: 'screenshot' as const, path: join(out, n), provenance: {arte: true, toma: n.replace(/\.png$/i, '')}}))};
};

/** Brief del juez: copia las capturas al árbol de revisión; solo capturas, criterios del encargo y docs/direccion.md, nada de código. */
export function arteBrief(ctx: WorkerContext, task: Task, testRunId: string, implementer: Run, path: string): string {
  const dir = join(path, '.nomos-review');
  mkdirSync(dir, {recursive: true});
  const shots = filtered<Artifact>(ctx.db, 'artifacts', {taskId: task.id, kind: 'screenshot'})
    .filter(a => (a.provenance as Record<string, JsonValue>)?.testRunId === testRunId).map(shot => {
      copyFileSync(locatedPath(join(ctx.dataDir, 'artifacts'), shot.path), join(dir, basename(shot.path)));
      return `- \`.nomos-review/${basename(shot.path)}\``;
    });
  const tree = implementer.metadata.worktreeId ? read<{path: string}>(ctx.db, 'worktrees', implementer.metadata.worktreeId)?.path : undefined;
  const direccion = [tree, ctx.projectDir].filter(Boolean).map(d => join(d!, 'docs', 'direccion.md')).find(existsSync);
  const pasada = filtered<TestRun>(ctx.db, 'test_runs', {taskId: task.id, checkId: 'arte'}).filter(r => r.result === 'failed').length + 1;
  const values: Record<string, string> = {title: task.title, captures: shots.join('\n') || '(sin capturas)',
    acceptance: task.acceptance.map(s => `- ${s}`).join('\n'), pasada: String(pasada), limite: String(limits(readConfig(ctx.dataDir)).arte),
    direction: direccion ? readFileSync(direccion, 'utf8') : 'El juego no tiene docs/direccion.md: juzga contra el encargo.'};
  return readFileSync(join(nomosSkills, 'nomos', 'references', 'brief-juez-arte.md'), 'utf8').replace(/\{\{(\w+)\}\}/g, (_, k) => values[k] ?? '');
}

export type Fallo = {criterio: string; nota: number; note: string};
/** Criterios por debajo de 2 (los que faltan cuentan 0), con su «qué cambiar» de los findings. */
export function fallosArte(notas: Record<string, number> | undefined, findings: {file: string; note: string}[]): Fallo[] {
  return criteriosArte.map(c => ({criterio: c, nota: Number(notas?.[c] ?? 0)})).filter(c => !(c.nota >= 2))
    .map(c => ({...c, note: findings.filter(f => f.file === c.criterio).map(f => f.note).join(' · ') || 'sin indicación'}));
}
export const lineaFallo = (f: Fallo) => `${f.criterio} ${f.nota}/3 — ${f.note}`;

/** Última pasada sin llegar: lo pendiente queda en docs/hecho.md del árbol del responsable, commiteado, y se integra igual. */
export async function pendienteVisual(ctx: WorkerContext, tree: string, fallos: Fallo[]): Promise<void> {
  mkdirSync(join(tree, 'docs'), {recursive: true});
  appendFileSync(join(tree, 'docs', 'hecho.md'), `\n${fallos.map(f => `PENDIENTE VISUAL: ${lineaFallo(f)}`).join('\n')}\n`, 'utf8');
  await ctx.git.commitAll(tree, 'Juez de arte: pendientes visuales en docs/hecho.md');
}
