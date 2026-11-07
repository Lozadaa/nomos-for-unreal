import type { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { capture } from './map.ts';
import { decodePng, pixelDiffRatio } from './png.ts';
import { unrealOf, type Executor, type Outcome } from './run.ts';
import { appendEvent } from '../store.ts';

export type UmgOptions = {resolutions?: [number, number][]; map?: string; widgets?: string[]};
export const defaultResolutions: [number, number][] = [[1280, 720], [1920, 1080]];
/** Review Focus 2: con UI y sin UI deben diferir al menos en el 0,5 % de los píxeles. */
export const minUiDiff = 0.005;

type Pie = {ok: boolean; map?: string; widgets: string[]; errors: string[]; engine?: string};

/** Ciclo UMG, fase de captura: por resolución, juego con UI y captura de control; deja la prueba en `running` para el QA visual. */
export function umgCapture(opts: UmgOptions = {}): Executor {
  return async (ctx, {project, dir}, deps) => {
    const unreal = unrealOf(ctx, deps), logs: string[] = [], summary: string[] = [];
    const artifacts: NonNullable<Outcome['artifacts']> = [];
    let map: string | null = opts.map ?? null, engine: string | null = null;
    for (const [width, height] of opts.resolutions ?? defaultResolutions) {
      const name = `ui-${width}x${height}`, shot = join(dir, `${name}.png`), control = join(dir, `${name}-control.png`);
      const run = await capture(unreal, project.uproject, opts.map, [width, height], shot, deps,
        {NOMOS_CONTROL: control, ...(opts.widgets?.length ? {NOMOS_WIDGETS: JSON.stringify(opts.widgets)} : {})});
      logs.push(run.log);
      const pie = run.reportJson as Pie | undefined;
      if (!pie?.ok) return {result: 'failed', log: logs.join('\n'), map, summary: [`${width}×${height}: ${pie?.errors.join('; ') || 'el juego no produjo las capturas'}`]};
      map = pie.map ?? map; engine = pie.engine ?? engine;
      const ratio = pixelDiffRatio(decodePng(readFileSync(shot)), decodePng(readFileSync(control)));
      if (ratio < minUiDiff) return {result: 'failed', log: logs.join('\n'), map, engine,
        summary: [`${width}×${height}: la captura no contiene la UI (difiere un ${(ratio * 100).toFixed(2).replace('.', ',')} % de la captura sin widgets)`,
          `Widgets en el viewport: ${pie.widgets.join(', ') || 'ninguno'}`]};
      summary.push(`${width}×${height}: UI visible (${(ratio * 100).toFixed(1).replace('.', ',')} % de píxeles), widgets ${pie.widgets.join(', ') || 'sin nombre'}`);
      artifacts.push({kind: 'screenshot', path: shot, provenance: {resolution: `${width}x${height}`, map, widget: pie.widgets[0] ?? null,
        widgets: pie.widgets, control, diffRatio: Number(ratio.toFixed(4))}});
    }
    return {result: 'running', log: logs.join('\n'), map, engine, config: (opts.resolutions ?? defaultResolutions).map(r => r.join('x')).join(', '),
      summary: [...summary, 'Capturas listas: esperando el QA visual'], artifacts};
  };
}

/** Un fallo medible de un intento umg: qué regla, dónde, cuánto mide y cuánto se espera (docs/x10/umg-bucles.md). */
export type UmgFinding = {rule: string; where: string; measured: string; expected: string; weight: number;
  /** Medida numérica y su umbral; `up` = la regla pide subir (UI visible), si no, bajar (línea base). */ value?: number; target?: number; up?: boolean};
const num = (s: string) => Number(s.replace(',', '.'));
const pct = (v: number) => `${String(v).replace('.', ',')} %`;
const severity: Record<string, number> = {bloqueante: 3, mayor: 2, menor: 1};

/** Los fallos de un resumen `test.failed` de umg: capturas sin UI, regresión de línea base y hallazgos del QA visual. */
export function umgFindings(summary: string): UmgFinding[] {
  const lines = summary.split('\n'), out: UmgFinding[] = [];
  const widgets = lines.find(l => l.startsWith('Widgets en el viewport:'))?.slice('Widgets en el viewport:'.length).trim();
  for (const line of lines) {
    let m: RegExpExecArray | null;
    if ((m = /^(\d+×\d+): la captura no contiene la UI \(difiere un ([\d,.]+) %/.exec(line)))
      out.push({rule: 'UI visible', where: `${m[1]}${widgets ? ` · widgets ${widgets}` : ''}`, measured: `${m[2]} %`, expected: `≥ ${pct(minUiDiff * 100)}`,
        value: num(m[2]), target: minUiDiff * 100, up: true, weight: 3});
    else if ((m = /^(\S+): la captura difiere un ([\d,.]+) % de la línea base \(tolerancia ([\d,.]+) %\)/.exec(line)))
      out.push({rule: 'línea base', where: m[1], measured: `${m[2]} %`, expected: `≤ ${m[3]} %`, value: num(m[2]), target: num(m[3]), weight: 2});
    else if ((m = /^(.+?:\d+) \[(bloqueante|mayor|menor)\] (.+)$/.exec(line)))
      out.push({rule: `QA ${m[2]}`, where: m[1].replace(/^\.nomos-review\//, ''), measured: m[3].slice(0, 200), expected: 'sin hallazgo', weight: severity[m[2]]});
    else if ((m = /^(\d+×\d+): (?!UI visible)(.+)$/.exec(line)))
      out.push({rule: 'captura', where: m[1], measured: m[2].slice(0, 200), expected: 'el juego deja las capturas', weight: 3});
  }
  // un fallo sin forma conocida (tiempo agotado, error del script) sigue contando como uno
  return out.length || !lines[0] ? out : [{rule: 'comprobación', where: '-', measured: lines[0].slice(0, 200), expected: 'que termine', weight: 3}];
}

/** Lo que tiene que acercarse una medida a su umbral para contar como mejora (el ruido de la captura ronda ±2 puntos). */
export const umgProgress = 0.25;
const gap = (f: UmgFinding) => Math.max(0, f.up ? f.target! - f.value! : f.value! - f.target!);
const label = (f: UmgFinding) => `${f.rule} · ${f.where}`;

/** Compara con el intento anterior: mejora si pesan menos los fallos o, con el mismo peso, una medida se acerca a su umbral sin que otra se aleje.
 *  ponytail: los hallazgos del QA se emparejan por regla y archivo, no por texto (lo reescribe un modelo cada vez). */
export function compareUmg(previous: UmgFinding[], current: UmgFinding[]): {improved: boolean; lines: string[]} {
  const pool = [...previous], lines: string[] = [];
  let closer = false, farther = false;
  for (const f of current) {
    const i = pool.findIndex(p => label(p) === label(f));
    if (i < 0) { lines.push(`- Nuevo: ${label(f)}`); continue; }
    const [p] = pool.splice(i, 1);
    if (p.value === undefined || f.value === undefined) { lines.push(`- Sigue: ${label(f)}`); continue; }
    const before = gap(p), after = gap(f), moved = before - after;
    const trend = moved > 0 && moved >= before * umgProgress ? 'Mejora' : moved < 0 && -moved >= before * umgProgress ? 'Empeora' : 'Sigue igual';
    if (trend === 'Mejora') closer = true; else if (trend === 'Empeora') farther = true;
    lines.push(`- ${trend}: ${label(f)} (${p.measured} → ${f.measured}, se espera ${f.expected})`);
  }
  for (const p of pool) lines.unshift(`- Resuelto: ${label(p)}`);
  const weight = (list: UmgFinding[]) => list.reduce((n, f) => n + f.weight, 0);
  const improved = weight(current) < weight(previous) || weight(current) === weight(previous) && closer && !farther;
  return {improved, lines};
}

/** Un intento umg fallido tal como queda en el evento `umg.attempt`. */
export type UmgAttempt = {taskId: string; testRunId: string; findings: UmgFinding[]; inputHash: string | null; attempt: number;
  /** Fallos seguidos sin mejora medible, contando este; una mejora, un QA aprobado o `umg.reset` lo devuelven a 1. */ stalled: number;
  head: string; diagnosis: string[]; comparison: string[]};
const findingLine = (f: UmgFinding) => `- ${f.where === '-' ? f.rule : label(f)}: ${f.rule.startsWith('QA') ? f.measured : `mide ${f.measured} · se espera ${f.expected}`}`;

/** Registra el intento umg fallido y arma su diagnóstico corto: qué falla, dónde, medido frente a esperado y qué cambió desde el anterior. */
export function umgAttempt(db: DatabaseSync, taskId: string, testRunId: string, summary: string): UmgAttempt {
  // la clave de entrada la guardó ui.cycle en su run de pruebas (también vale para el veredicto del QA visual de esas capturas)
  const inputHash = (db.prepare(`select json_extract(r.metadata,'$.umgInput') h from test_runs t join runs r on r.id=t.run_id where t.id=?`).get(testRunId)?.h ?? null) as string | null;
  const last = db.prepare(`select type, payload from events where json_extract(payload,'$.taskId')=? and (type in ('umg.attempt','umg.reset')
    or type='test.passed' and json_extract(payload,'$.check')='umg') order by seq desc limit 1`).get(taskId);
  const previous = last?.type === 'umg.attempt' ? JSON.parse(last.payload as string) as UmgAttempt : undefined;
  const attempt = Number(db.prepare(`select count(*) n from events where type='umg.attempt' and json_extract(payload,'$.taskId')=?`).get(taskId)!.n) + 1;
  const findings = umgFindings(summary), compared = previous ? compareUmg(previous.findings, findings) : undefined;
  const stalled = previous && !compared!.improved ? previous.stalled + 1 : 1;
  const head = `Diagnóstico umg (intento ${attempt}${stalled > 1 ? `, ${stalled} seguidos sin mejora` : ''}):`;
  const comparison = [...(compared ? ['Frente al intento anterior:', ...compared.lines.slice(0, 12)] : []),
    ...(findings.some(f => f.rule === 'línea base') ? ['Si el cambio de aspecto es a propósito, no lo corrijas en la UI: avisa al director para renovar la línea base.'] : [])];
  const result = {taskId, testRunId, findings, inputHash, attempt, stalled, head, diagnosis: findings.slice(0, 12).map(findingLine), comparison};
  appendEvent(db, 'umg.attempt', null, result);
  return result;
}

/** Clave de entrada de un ciclo UMG (como la caché de FASTVFX): el contenido de los archivos dados y lo pedido. Misma clave → mismo resultado.
 *  ponytail: lee cada archivo entero; con uassets de cientos de MB convendría la fecha y el tamaño. */
export function umgInputHash(paths: string[], extra: unknown): string {
  const hash = createHash('sha256').update(JSON.stringify(extra));
  for (const path of paths.toSorted()) hash.update(`\0${path}\0`).update(existsSync(path) ? readFileSync(path) : '');
  return hash.digest('hex').slice(0, 24);
}
/** Lo que un intento cacheado puede repetir: solo fallos medidos; si el juego no dejó capturas o se agotó el tiempo, puede ser pasajero. */
export const umgCacheable = (a: UmgAttempt) => a.findings.length > 0 && a.findings.every(f => !['captura', 'comprobación'].includes(f.rule));
