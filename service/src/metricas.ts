import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { openDb } from './db.ts';
import { dbFile } from './legacy.ts';

/**
 * `nomos metricas`: dónde se va el reloj de las tareas, leído de `nomos.db` (docs/x10/siguiente.md). Son las medidas con
 * las que se encontró el tiempo muerto de Herbalist; sin ellas cada mejora se proyecta en vez de medirse.
 */
export type Serie = {n: number; mediana: number; p90: number; suma: number};
export type Metricas = {
  desde: string | null; hasta: string | null;
  tareas: {cerradas: number; horas: Serie};
  estados: Record<string, Serie>;
  huecos: {entregaAComprobacion: Serie; decisionAbierta: Serie; preguntaARespuesta: Serie; rechazoACorreccion: Serie};
  decisiones: {abiertas: number; resueltas: number; automaticas: number; porQuien: Record<string, number>};
  diferidas: {motivo: string; veces: number; horas: number}[];
  revisiones: {total: number; rechazadas: number; correcciones: number};
  comprobaciones: Record<string, Serie>;
};
type Ev = {type: string; payload: Record<string, any>; at: number};

const serie = (values: number[]): Serie => {
  const v = [...values].sort((a, b) => a - b), at = (q: number) => v.length ? v[Math.min(v.length - 1, Math.floor(v.length * q))] : 0;
  const median = !v.length ? 0 : v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  return {n: v.length, mediana: median, p90: at(0.9), suma: v.reduce((a, b) => a + b, 0)};
};
const minutes = (ms: number) => ms / 60_000;
/** «3,2 GB libres, hacen falta 6» y los ids de tarea se pliegan en un solo motivo. */
export const motivo = (reason: string) => reason.replace(/\d+(,\d+)? GB libres/, 'N GB libres').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '#').slice(0, 70);

export function metricas(db: DatabaseSync, desde?: string): Metricas {
  const rows = db.prepare(`select type,payload,created_at at from events where created_at>=? and type in ('task.moved','task.done','task.created','test.running','test.passed','test.failed',
    'review.started','review.finished','worker.waiting','worker.message_sent','decision.opened','decision.resolved','decision.auto_resolved','command.deferred') order by seq`)
    .all(desde ?? '').map(r => ({type: r.type as string, payload: JSON.parse(r.payload as string), at: Date.parse(r.at as string)}) as Ev);
  const tasks = db.prepare(`select id,created_at,updated_at from tasks where state='done'${desde ? ' and updated_at>=?' : ''}`).all(...(desde ? [desde] : []));
  const estados: Record<string, number[]> = {}, last: Record<string, Ev> = {};
  const gaps = {entrega: [] as number[], pregunta: [] as number[], rechazo: [] as number[], decision: [] as number[]};
  const pendingDelivery: Record<string, number> = {}, pendingAsk: Record<string, number> = {}, pendingReject: Record<string, number> = {}, opened: Record<string, number> = {};
  const checks: Record<string, number[]> = {}, running: Record<string, {at: number; check: string}> = {};
  const deferred: Record<string, number> = {}, porQuien: Record<string, number> = {};
  let reviews = 0, rejected = 0, corrections = 0, automaticas = 0, resueltas = 0;
  for (const e of rows) {
    const p = e.payload, taskId = p.taskId as string;
    switch (e.type) {
      case 'task.moved': {
        const previous = last[taskId];
        if (previous) (estados[previous.payload.state] ??= []).push(minutes(e.at - previous.at));
        last[taskId] = e;
        // una entrega que vuelve a implementando sin comprobación ni revisión no estaba esperando ninguna
        if (p.state === 'revisando') pendingDelivery[taskId] = e.at; else delete pendingDelivery[taskId];
        break;
      }
      case 'test.running': running[p.testRunId ?? `${taskId}:${p.check}`] = {at: e.at, check: p.check}; // fall through
      case 'review.started':
        if (taskId in pendingDelivery) { gaps.entrega.push(minutes(e.at - pendingDelivery[taskId])); delete pendingDelivery[taskId]; }
        break;
      case 'test.passed': case 'test.failed': {
        const key = p.testRunId ?? `${taskId}:${p.check}`, start = running[key];
        if (start) { (checks[start.check] ??= []).push(minutes(e.at - start.at)); delete running[key]; }
        break;
      }
      case 'review.finished':
        reviews++;
        if (p.approved === false) { rejected++; pendingReject[taskId] = e.at; }
        break;
      case 'worker.waiting': pendingAsk[p.runId] ??= e.at; break;
      case 'worker.message_sent':
        corrections++;
        if (p.runId in pendingAsk) { gaps.pregunta.push(minutes(e.at - pendingAsk[p.runId])); delete pendingAsk[p.runId]; }
        if (taskId in pendingReject) { gaps.rechazo.push(minutes(e.at - pendingReject[taskId])); delete pendingReject[taskId]; }
        break;
      case 'decision.opened': opened[p.decisionId] = e.at; break;
      case 'decision.resolved':
        resueltas++; porQuien[p.by ?? '?'] = (porQuien[p.by ?? '?'] ?? 0) + 1;
        if (p.decisionId in opened) { gaps.decision.push(minutes(e.at - opened[p.decisionId])); delete opened[p.decisionId]; }
        break;
      case 'decision.auto_resolved': automaticas++; break;
      case 'command.deferred': { const m = motivo(String(p.reason ?? '')); deferred[m] = (deferred[m] ?? 0) + 1; break; }
    }
  }
  const abiertas = Number(db.prepare("select count(*) n from decisions where state='open'").get()!.n);
  return {
    desde: desde ?? null, hasta: rows.at(-1) ? new Date(rows.at(-1)!.at).toISOString() : null,
    tareas: {cerradas: tasks.length, horas: serie(tasks.map(t => (Date.parse(t.updated_at as string) - Date.parse(t.created_at as string)) / 3_600_000))},
    estados: Object.fromEntries(Object.entries(estados).map(([k, v]) => [k, serie(v)])),
    huecos: {entregaAComprobacion: serie(gaps.entrega), decisionAbierta: serie(gaps.decision), preguntaARespuesta: serie(gaps.pregunta), rechazoACorreccion: serie(gaps.rechazo)},
    decisiones: {abiertas, resueltas, automaticas, porQuien},
    // una orden diferida se reintenta cada 5 s: veces × 5 s ≈ horas paradas por ese motivo
    diferidas: Object.entries(deferred).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([m, n]) => ({motivo: m, veces: n, horas: n * 5 / 3600})),
    revisiones: {total: reviews, rechazadas: rejected, correcciones: corrections},
    comprobaciones: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, serie(v)])),
  };
}

const f = (n: number, d = 1) => n.toFixed(d).replace('.', ',');
const line = (label: string, s: Serie, unit = 'min') => `${label.padEnd(44)} n=${String(s.n).padStart(4)}  mediana ${f(s.mediana).padStart(7)} ${unit}  p90 ${f(s.p90).padStart(7)} ${unit}  suma ${f(unit === 'h' ? s.suma : s.suma / 60).padStart(7)} h`;
export function renderMetricas(m: Metricas): string {
  const out = [`Métricas${m.desde ? ` desde ${m.desde}` : ''}${m.hasta ? ` hasta ${m.hasta.slice(0, 16).replace('T', ' ')}` : ''}`, '',
    `Tareas cerradas: ${m.tareas.cerradas}`, line('  reloj de cada tarea (h)', m.tareas.horas, 'h'), '', 'Horas por estado'];
  for (const [state, s] of Object.entries(m.estados).sort((a, b) => b[1].suma - a[1].suma)) out.push(line(`  ${state}`, s));
  out.push('', 'Huecos (tiempo muerto)', line('  entrega → 1.ª comprobación o revisión', m.huecos.entregaAComprobacion),
    line('  decisión abierta → resuelta', m.huecos.decisionAbierta), line('  pregunta del worker → respuesta', m.huecos.preguntaARespuesta),
    line('  revisión rechazada → corrección enviada', m.huecos.rechazoACorreccion), '',
    `Decisiones: ${m.decisiones.abiertas} abiertas · ${m.decisiones.resueltas} resueltas (${m.decisiones.automaticas} solas)`
    + (Object.keys(m.decisiones.porQuien).length ? ' · por ' + Object.entries(m.decisiones.porQuien).map(([k, v]) => `${k} ${v}`).join(', ') : ''),
    `Revisiones: ${m.revisiones.total} · rechazadas ${m.revisiones.rechazadas}`
    + (m.revisiones.total ? ` (${Math.round(100 * m.revisiones.rechazadas / m.revisiones.total)} %)` : '') + ` · correcciones enviadas ${m.revisiones.correcciones}`, '',
    'Órdenes diferidas (≈ h paradas por motivo)');
  for (const d of m.diferidas) out.push(`  ${String(d.veces).padStart(6)} × ${f(d.horas).padStart(6)} h  ${d.motivo}`);
  if (!m.diferidas.length) out.push('  ninguna');
  out.push('', 'Comprobaciones');
  for (const [check, s] of Object.entries(m.comprobaciones).sort((a, b) => b[1].suma - a[1].suma)) out.push(line(`  ${check}`, s));
  if (!Object.keys(m.comprobaciones).length) out.push('  ninguna');
  return out.join('\n');
}

/** `nomos metricas [--desde AAAA-MM-DD] [--json]`: lee la base directamente, con o sin servicio en marcha. */
export async function metricasCli(argv: string[]): Promise<boolean> {
  const words = argv.filter((a, i) => !a.startsWith('--') && !['--data', '--desde'].includes(argv[i - 1]));
  if (words[0] !== 'metricas') return false;
  const flags = argv.filter(a => a.startsWith('--'));
  if (words.length !== 1 || flags.some(a => !['--data', '--desde', '--json'].includes(a))) throw new Error('Uso: nomos metricas [--desde AAAA-MM-DD] [--json]');
  const dataDir = resolve(argv[argv.indexOf('--data') + 1]);
  const desde = argv.includes('--desde') ? argv[argv.indexOf('--desde') + 1] : undefined;
  if (desde !== undefined && Number.isNaN(Date.parse(desde))) throw new Error('--desde espera una fecha AAAA-MM-DD');
  if (!existsSync(dbFile(dataDir))) throw new Error(`Sin base de datos en ${dataDir}`);
  const db = openDb(dbFile(dataDir));
  try {
    const m = metricas(db, desde ? new Date(desde).toISOString() : undefined);
    console.log(argv.includes('--json') ? JSON.stringify(m, null, 2) : renderMetricas(m));
  } finally { db.close(); }
  return true;
}
