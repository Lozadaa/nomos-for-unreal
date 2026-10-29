import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { writeAtomic } from './atomic.ts';
import { status } from './store.ts';
import { activeHolds } from './hold.ts';
import { listDecisions } from './repo/decisions.ts';
import { read } from './repo/rows.ts';
import type { Task } from './model.ts';

/** Hito 24: `.nomos/reanudacion.md`, lo que necesita un director nuevo para seguir sin la sesión anterior. */
const types = 'message.received,run.finished,worker.waiting,command.failed,review.finished,test.failed,task.moved,integration.completed,task.closing_blocked';
const cell = (v: unknown) => v === null || v === undefined || v === '' ? '—' : String(v).replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 90);
let version: string | undefined;
const nomosVersion = () => version ??= (() => {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {cwd: import.meta.dirname, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']}).trim(); }
  catch { return 'desconocida'; }
})();
const table = (head: string, rows: string[], empty: string) => rows.length ? [head, head.replace(/[^|]+/g, '---'), ...rows] : [empty];

export function renderResume(db: DatabaseSync, dataDir: string, service: string, now = new Date()): string {
  const tasks = db.prepare("select id,title,state,wait_reason wait from tasks where state!='done' order by state,updated_at desc").all();
  const done = Number(db.prepare("select count(*) n from tasks where state='done'").get()!.n), s = status(db);
  const title = (id: string | null) => cell(id ? read<Task>(db, 'tasks', id)?.title ?? id : null);
  return [`# Reanudación de Nomos`, '', `Generado ${now.toISOString()} por Nomos; no lo edites a mano.`, '',
    ...table('| Servicio | Versión de Nomos | Último director | Eventos sin leer |', [`| ${service} | ${nomosVersion()} | ${cell(s.director)} | ${s.pending} |`], ''), '',
    `## Tareas (${tasks.length} abiertas, ${done} terminadas)`, '',
    ...table('| Estado | Tarea | Espera |', tasks.slice(0, 15).map(t => `| ${t.state} | ${cell(t.title)} (${String(t.id).slice(0, 8)}) | ${cell(t.wait)} |`), 'Ninguna abierta.'),
    ...(tasks.length > 15 ? [`| … | ${tasks.length - 15} más en el panel | |`] : []), '',
    '## Decisiones abiertas', '', ...table('| Tarea | Pregunta |', listDecisions(db, 'open').slice(0, 5).map(d => `| ${title(d.taskId)} | ${cell(d.reason)} |`), 'Ninguna.'), '',
    '## Holds', '', ...table('| Tarea | Espera |', activeHolds(db).slice(0, 5).map(h => `| ${cell(h.title)} | ${cell(h.text)} |`), 'Ninguno.'), '',
    '## Lecciones', '', 'Sin lecciones: el cierre todavía no guarda `lessons`.', '',
    '## Rearmar el vigilante', '', 'Arranca con `/nomos` y arma Monitor (30 min) con:', '',
    '```', `nomos vigila --session ${s.director ?? '<sesion>'} --data "${dataDir}" --types ${types}`, '```', ''].join('\n');
}

export const writeResume = (db: DatabaseSync, dataDir: string, service: string) =>
  writeAtomic(join(dataDir, 'reanudacion.md'), renderResume(db, dataDir, service));
