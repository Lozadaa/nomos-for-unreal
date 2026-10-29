import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { writeAtomic } from './atomic.ts';
import { status } from './store.ts';
import { activeHolds } from './hold.ts';
import { listDecisions } from './repo/decisions.ts';
import { read } from './repo/rows.ts';
import type { Task } from './model.ts';
import { listPeers } from './team.ts';

/** Hito 24: `.nomos/reanudacion.md`, lo que necesita un director nuevo para seguir sin la sesión anterior. */
const types = 'message.received,run.finished,worker.waiting,command.failed,review.finished,test.failed,task.moved,integration.completed,task.closing_blocked';
const cell = (v: unknown) => v === null || v === undefined || v === '' ? '—' : String(v).replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 90);
let version: string | undefined;
const nomosVersion = () => version ??= (() => {
  try { return readFileSync(join(import.meta.dirname, '..', '..', 'VERSION'), 'utf8').split(' ')[0].trim(); } catch { /* sin VERSION: repo de Nomos */ }
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {cwd: import.meta.dirname, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']}).trim(); }
  catch { return 'desconocida'; }
})();
const table = (head: string, rows: string[], empty: string) => rows.length ? [head, head.replace(/[^|]+/g, '---'), ...rows] : [empty];

export function renderResume(db: DatabaseSync, dataDir: string, service: string, now = new Date()): string {
  const tasks = db.prepare("select id,title,state,wait_reason wait from tasks where state!='done' order by state,updated_at desc").all();
  const done = Number(db.prepare("select count(*) n from tasks where state='done'").get()!.n), s = status(db);
  const title = (id: string | null) => cell(id ? read<Task>(db, 'tasks', id)?.title ?? id : null);
  // hito 25: las 5 últimas lecciones que guardaron los cierres de hito
  const peers = listPeers(db);
  const lessons = db.prepare("select metadata from runs where json_extract(metadata,'$.lessons') is not null order by updated_at desc limit 5").all()
    .flatMap(r => JSON.parse(r.metadata as string).lessons as string[]).slice(0, 5);
  return [`# Reanudación de Nomos`, '', `Generado ${now.toISOString()} por Nomos; no lo edites a mano.`, '',
    ...table('| Servicio | Versión de Nomos | Último director | Eventos sin leer |', [`| ${service} | ${nomosVersion()} | ${cell(s.director)} | ${s.pending} |`], ''), '',
    `## Tareas (${tasks.length} abiertas, ${done} terminadas)`, '',
    ...table('| Estado | Tarea | Espera |', tasks.slice(0, 15).map(t => `| ${t.state} | ${cell(t.title)} (${String(t.id).slice(0, 8)}) | ${cell(t.wait)} |`), 'Ninguna abierta.'),
    ...(tasks.length > 15 ? [`| … | ${tasks.length - 15} más en el panel | |`] : []), '',
    '## Decisiones abiertas', '', ...table('| Tarea | Pregunta |', listDecisions(db, 'open').slice(0, 5).map(d => `| ${title(d.taskId)} | ${cell(d.reason)} |`), 'Ninguna.'), '',
    '## Holds', '', ...table('| Tarea | Espera |', activeHolds(db).slice(0, 5).map(h => `| ${cell(h.title)} | ${cell(h.text)} |`), 'Ninguno.'), '',
    // hito 29: los otros Nomos del equipo (lo último que se vio de la rama nomos/equipo)
    ...(peers.length ? ['## Equipo', '', ...table('| Persona | Frente | Presente | En curso | Reservas | Build |', peers.map(p => `| ${cell(p.name)} | ${cell(p.frente)} | ${p.present ? 'sí' : 'no'} | `
      + `${p.tasks.filter(t => !['pendiente', 'preparada'].includes(t.state)).length} | ${cell(p.leases.map(l => l.path.split('/').at(-1)).join(', '))} | ${cell(p.build?.commit.slice(0, 7))} |`), ''), ''] : []),
    '## Lecciones', '', ...(lessons.length ? lessons.map(l => `- ${l.replace(/\s+/g, ' ')}`) : ['Sin lecciones todavía: llegan con cada cierre de hito.']), '',
    '## Rearmar el vigilante', '', 'Arranca con `/nomos` y arma Monitor (30 min) con:', '',
    '```', `nomos vigila --session ${s.director ?? '<sesion>'} --data "${dataDir}" --types ${types}`, '```', ''].join('\n');
}

export const writeResume = (db: DatabaseSync, dataDir: string, service: string) =>
  writeAtomic(join(dataDir, 'reanudacion.md'), renderResume(db, dataDir, service));
