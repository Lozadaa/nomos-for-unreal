import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { readConfig } from './config.ts';
import { listDecisions } from './repo/decisions.ts';
import { listLeases } from './leases.ts';
import { listPeers, teamConfig } from './team.ts';
import { nomosSkills } from './skills-install.ts';
import { requiredTypes } from './watcher-cursors.ts';
import type { EventRow } from './store.ts';

/** Hito 27: lo que despierta al director (SKILL.md paso 3, Decisiones y «Por aprobar», equipo y conflictos). */
export const wakeTypes = [...new Set(['message.received', 'run.finished', 'worker.waiting', 'command.failed', 'review.finished', 'test.failed',
  'task.moved', 'integration.completed', 'task.closing_blocked', ...requiredTypes, 'team.joined', 'team.request', 'lease.conflict', 'integration.conflict'])];
const cell = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 90);
const short = (id: unknown) => String(id ?? '').slice(0, 8);
const more = (rows: string[], max: number, empty: string, tail = (n: number) => `… ${n} más`) =>
  !rows.length ? [empty] : rows.length > max ? [...rows.slice(0, max), tail(rows.length - max)] : rows;

/** Eventos que despiertan, posteriores al cursor propio `director.wake_seq`; lo que provoca el propio director no cuenta. */
export function pendingWake(db: DatabaseSync): EventRow[] {
  const since = Number(db.prepare('select wake_seq from director where id=1').get()!.wake_seq);
  return db.prepare(`select seq,id,type,message_id messageId,payload,created_at createdAt from events where seq>? and type in (${wakeTypes.map(() => '?').join(',')}) order by seq`)
    .all(since, ...wakeTypes).map(r => ({...r, payload: JSON.parse(r.payload as string)}) as EventRow)
    .filter(e => e.payload.taskId !== 'director' && !String(e.payload.type ?? '').startsWith('director.'));
}

/** `nomos brief director`: ≤ 60 líneas para decidir sin historial (plantilla en references/brief-director.md). */
export function renderDirectorBrief(db: DatabaseSync, dataDir: string, now = new Date()): string {
  const config = readConfig(dataDir) as {jam?: {enabled?: boolean; days?: number; start?: string}};
  const title = (id: unknown) => cell((db.prepare('select title from tasks where id=?').get(String(id ?? ''))?.title as string) ?? id);
  const tasks = db.prepare("select id,title,state,blocked_reason blocked,wait_reason wait from tasks where state!='done' order by updated_at desc").all();
  // último evento de cada tarea, entre los 5 000 más recientes (Block Kings tiene 100 000)
  const last = new Map(db.prepare(`select json_extract(payload,'$.taskId') t,type from events where seq>(select coalesce(max(seq),0)-5000 from events)
    and json_extract(payload,'$.taskId') is not null order by seq`).all().map(r => [r.t as string, r.type as string]));
  const mine = listLeases(db).map(l => l.path.toLowerCase());
  const equipo = teamConfig(dataDir) ? ['## Equipo', '', ...more(listPeers(db, now.getTime()).map(p => {
    const clash = p.leases.filter(l => mine.includes(l.path.toLowerCase())).map(l => l.path.split('/').at(-1));
    return `- ${p.name} (${p.frente}): ${p.present ? 'presente' : 'ausente'} · ${p.tasks.length} tareas · reservas ${p.leases.map(l => l.path.split('/').at(-1)).join(', ') || '—'}`
      + ` · build ${p.build?.commit.slice(0, 7) ?? '—'}${clash.length ? ` · aviso: también reservas ${clash.join(', ')}` : ''}`;
  }), 3, 'Nadie más todavía.'), '', ''].join('\n') : '';
  const closing = tasks.filter(t => /^\s*cierre/i.test(t.title as string)).at(-1);
  const jam = config.jam?.enabled && config.jam.start ? ` · día ${Math.floor((now.getTime() - Date.parse(config.jam.start)) / 86_400_000) + 1} de ${config.jam.days}` : '';
  const approvals = db.prepare("select task_id t from approvals where state='pending' order by created_at").all();
  const messages = db.prepare(`select m.id,m.text,e.seq from messages m join events e on e.message_id=m.id and e.type='message.received'
    where m.replied_at is null order by e.seq`).all();
  const events = pendingWake(db), waiting = db.prepare("select id,task_id t from runs where state='running' and json_extract(metadata,'$.waiting')").all();
  const actions = [
    ...messages.map(m => `\`nomos ack ${m.seq} --session director\` y \`nomos reply ${m.id} -- '<respuesta>'\``),
    ...waiting.map(r => `\`nomos worker send ${r.id} --text '<respuesta>'\` (espera en ${title(r.t)})`),
    ...tasks.filter(t => t.state === 'revisando' && !t.blocked).map(t => `\`nomos task review ${t.id}\` (${cell(t.title)})`),
    ...tasks.filter(t => t.state === 'integrando' && !t.blocked).map(t => `\`nomos task integrate ${t.id}\` (${cell(t.title)})`),
  ].slice(0, 3).map((a, i) => `${i + 1}. ${a}`);
  const values: Record<string, string> = {now: now.toISOString().slice(0, 16).replace('T', ' '), data: dataDir, equipo,
    nomos: `node "${join(nomosSkills, 'nomos', 'scripts', 'nomos.ts')}"`,
    hito: closing ? `${cell(closing.title)} (${short(closing.id)}, ${closing.state})${jam}` : `Sin tarea de cierre abierta${jam}`,
    tareas: more(tasks.map(t => `- ${t.state} · ${cell(t.title)} (${short(t.id)}) · último: ${last.get(t.id as string) ?? '—'}${t.blocked || t.wait ? ` · ${cell(t.blocked ?? t.wait)}` : ''}`), 8, 'Ninguna abierta.').join('\n'),
    pendientes: more([...listDecisions(db, 'open').map(d => `- Decisión ${short(d.id)} · ${title(d.taskId)}: ${cell(d.reason)}`),
      ...approvals.map(a => `- Por aprobar: ${title(a.t)}`)], 4, 'Nada pendiente.').join('\n'),
    mensajes: more(messages.map(m => `- seq ${m.seq} · ${m.id} · «${cell(m.text)}»`), 3, 'Ninguno.').join('\n'),
    eventos: (events.length > 6 ? [`… ${events.length - 6} anteriores`] : []).concat(events.slice(-6).map(e =>
      `- ${e.seq} ${e.type} · ${cell(e.payload.text ?? (e.payload.taskId ? title(e.payload.taskId) : '') ?? '')}${e.payload.summary || e.payload.reason ? ` · ${cell(e.payload.summary ?? e.payload.reason)}` : ''}`))
      .join('\n') || 'Ninguno desde la última sesión.',
    acciones: actions.join('\n') || '1. Sin nada que decidir: termina.'};
  const template = readFileSync(join(nomosSkills, 'nomos', 'references', 'brief-director.md'), 'utf8');
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? '').split('\n').slice(0, 60).join('\n');
}
