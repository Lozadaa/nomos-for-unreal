import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { autonomous, directorConfig, readConfig, roleModel } from './config.ts';
import { autoOption } from './decisiones-auto.ts';
import { read } from './repo/rows.ts';
import type { Decision } from './model.ts';
import type { Handler, WorkerContext } from './runner.ts';
import { enqueue } from './commands.ts';
import { writeAtomic } from './atomic.ts';
import { finishRun, startRun } from './repo/runs.ts';
import { requireRun, updateRun } from './repo/worker.ts';
import { launchCommand } from './handlers/worker-launch.ts';
import { listDecisions } from './repo/decisions.ts';
import { listLeases } from './leases.ts';
import { listPeers, teamConfig } from './team.ts';
import { nomosSkills } from './skills-install.ts';
import { listarPedidos } from './pedidos.ts';
import { requiredTypes } from './watcher-cursors.ts';
import type { EventRow } from './store.ts';

/** Hito 27: lo que despierta al director (SKILL.md paso 3, Decisiones y «Por aprobar», equipo y conflictos). */
export const wakeTypes = [...new Set(['message.received', 'run.finished', 'worker.waiting', 'command.failed', 'review.finished', 'test.failed',
  'task.moved', 'integration.completed', 'task.closing_blocked', ...requiredTypes, 'team.joined', 'team.request', 'lease.conflict', 'integration.conflict'])];
const cell = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 90);
/** Candela 2026-11-10: el brief cortaba el mensaje a 90 caracteres y el director inventó otro juego. El texto entero va a
 *  `<datos>/mensajes/<id>.md` y el brief manda leerlo. */
function whole(dataDir: string, m: {id: unknown; text: unknown}): string {
  const text = String(m.text ?? '');
  if (text.replace(/\s+/g, ' ').trim().length <= 90) return '';
  const dir = join(dataDir, 'mensajes');
  mkdirSync(dir, {recursive: true});
  writeFileSync(join(dir, `${m.id}.md`), text);
  return ` → recortado: léelo entero en \`${basename(dataDir)}/mensajes/${m.id}.md\` antes de actuar`;
}
const short = (id: unknown) => String(id ?? '').slice(0, 8);
const more = (rows: string[], max: number, empty: string, tail = (n: number) => `… ${n} más`) =>
  !rows.length ? [empty] : rows.length > max ? [...rows.slice(0, max), tail(rows.length - max)] : rows;

/** Eventos que despiertan, posteriores al cursor propio `director.wake_seq`; lo que provoca el propio director no cuenta. */
export function pendingWake(db: DatabaseSync, dataDir: string): EventRow[] {
  const since = Number(db.prepare('select wake_seq from director where id=1').get()!.wake_seq);
  return db.prepare(`select seq,id,type,message_id messageId,payload,created_at createdAt from events where seq>? and type in (${wakeTypes.map(() => '?').join(',')}) order by seq`)
    .all(since, ...wakeTypes).map(r => ({...r, payload: JSON.parse(r.payload as string)}) as EventRow)
    .filter(e => e.payload.taskId !== 'director' && !String(e.payload.type ?? '').startsWith('director.') && !serviceHandles(db, dataDir, e));
}

/** Experimento metras 2026-11-08 (40 despertares, casi todos rutinarios): lo que el servicio ya mueve solo no despierta.
 *  Quedan mensajes, esperas, fallos, Decisiones que no se resuelven solas y hallazgos que nadie reenvió. */
function serviceHandles(db: DatabaseSync, dataDir: string, e: EventRow): boolean {
  const p = e.payload as Record<string, any>;
  // el servicio reenvió los hallazgos al responsable (corrección en cola tras el evento)
  const forwarded = () => !!db.prepare(`select 1 from commands where type='worker.send' and created_at>=?
    and json_extract(payload,'$.runId') in (select id from runs where task_id=?)`).get(e.createdAt, p.taskId ?? '');
  switch (e.type) {
    // la revisión tras NOMOS_DONE, la integración tras aprobar y el cierre tras integrar los pide el servicio
    case 'task.moved': case 'integration.completed': return true;
    case 'run.finished': return p.state === 'done';
    case 'review.finished': return !p.stale && (p.approved || forwarded());
    case 'test.failed': return forwarded();
    case 'decision.opened': case 'decision.updated': {
      const d = read<Decision>(db, 'decisions', p.decisionId);
      return !!d && autoOption(d, 0, autonomous(readConfig(dataDir))) !== null;
    }
    default: return false;
  }
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
  const events = pendingWake(db, dataDir), waiting = db.prepare("select id,task_id t from runs where state='running' and json_extract(metadata,'$.waiting')").all();
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
      ...approvals.map(a => `- Por aprobar: ${title(a.t)}`),
      // lo que solo puede hacer el usuario a mano (PBRGen en el navegador): docs/pedidos/ del juego, ya integrado
      ...listarPedidos(dirname(resolve(dataDir))).filter(p => p.estado === 'pendiente').map(p => `- Pedido manual ${p.id} (${p.para}): ${cell(p.prompt)} → ${p.destino}/`)],
      4, 'Nada pendiente.').join('\n'),
    mensajes: more(messages.map(m => `- seq ${m.seq} · ${m.id} · «${cell(m.text)}»${whole(dataDir, m)}`), 3, 'Ninguno.').join('\n'),
    eventos: (events.length > 6 ? [`… ${events.length - 6} anteriores`] : []).concat(events.slice(-6).map(e =>
      `- ${e.seq} ${e.type} · ${cell(e.payload.text ?? (e.payload.taskId ? title(e.payload.taskId) : '') ?? '')}${e.payload.summary || e.payload.reason ? ` · ${cell(e.payload.summary ?? e.payload.reason)}` : ''}`))
      .join('\n') || 'Ninguno desde la última sesión.',
    acciones: actions.join('\n') || '1. Sin nada que decidir: termina.'};
  const template = readFileSync(join(nomosSkills, 'nomos', 'references', 'brief-director.md'), 'utf8');
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? '').split('\n').slice(0, 60).join('\n');
}

const maxMinutes = 20, pollMs = 5000;
const activeRun = (db: DatabaseSync) => db.prepare("select id,metadata from runs where role='director' and state='running'").get();
const poll = (db: DatabaseSync, runId: string, key = randomUUID()) =>
  enqueue(db, 'director.poll', {runId}, `director.poll:${runId}:${key}`, {notBefore: new Date(Date.now() + pollMs).toISOString()});

/** Pasada del planificador: con `director.mode: "evento"` y sin director en marcha, el primer evento pendiente con
 *  `debounceSeconds` cumplidos encola un despertar (los que llegan en la ventana van en el mismo). */
export function directorTick(ctx: Pick<WorkerContext, 'db' | 'dataDir'>, now = Date.now()): void {
  const {mode, debounceSeconds} = directorConfig(readConfig(ctx.dataDir));
  if (mode !== 'evento') return;
  const active = activeRun(ctx.db);
  // si su sondeo se perdió (Orca sin responder), un sondeo pasado el plazo la cierra
  if (active) { if (now > Date.parse(JSON.parse(active.metadata as string).deadlineAt)) poll(ctx.db, active.id as string, 'plazo'); return; }
  const first = pendingWake(ctx.db, ctx.dataDir)[0];
  if (first && now - Date.parse(first.createdAt) >= debounceSeconds * 1000) enqueue(ctx.db, 'director.wake', {}, `director.wake:${first.seq}`);
}

/** Lanza una sesión corta de Claude Code en la raíz del juego con el mismo lanzador que los workers (Orca o proceso). */
export const directorWake: Handler = async (_cmd, ctx) => {
  const {db, orca, dataDir, projectDir} = ctx;
  if (activeRun(db)) return {skipped: 'director en marcha'};
  const events = pendingWake(db, dataDir);
  if (!events.length) return {skipped: 'sin eventos'};
  const brief = renderDirectorBrief(db, dataDir), file = join(dataDir, 'director-brief.md');
  // el cursor avanza antes de lanzar: si el lanzamiento falla, el siguiente evento vuelve a lanzar
  db.prepare('update director set wake_seq=? where id=1').run(events.at(-1)!.seq);
  writeAtomic(file, brief);
  const model = roleModel(readConfig(dataDir), 'director'), sessionId = randomUUID();
  const run = startRun(db, {taskId: 'director', role: 'director', provider: 'claude', model,
    metadata: {sessionId, model, phase: 'running', deadlineAt: new Date(Date.now() + maxMinutes * 60_000).toISOString()}});
  try {
    if (!orca.terminalCreate) throw new Error('orca: no puede abrir un terminal para el director');
    const path = relative(projectDir, file).replace(/\\/g, '/');
    const handle = await orca.terminalCreate(projectDir, 'nomos-director', `${launchCommand('claude', model, 'nomos', sessionId)} "/nomos evento: lee ${path} y actúa solo con lo que dice"`);
    updateRun(db, run.id, {}, {sessionRef: handle});
  } catch (error) {
    finishRun(db, run.id, 'failed', error instanceof Error ? error.message : String(error));
    throw error;
  }
  poll(db, run.id);
  return {runId: run.id, events: events.length};
};

/** Terminada = hubo salida y el terminal está en reposo dos sondeos seguidos (proceso salido o TUI quieta). */
export const directorPoll: Handler = async (cmd, ctx) => {
  const {db, orca} = ctx, run = requireRun(db, (cmd.payload as {runId: string}).runId);
  if (run.state !== 'running') return;
  const close = async (state: 'done' | 'failed', summary: string) => {
    finishRun(db, run.id, state, summary);
    try { await orca.terminalClose(run.sessionRef!); } catch { /* ya cerrado */ }
    updateRun(db, run.id, {phase: 'finished', terminalClosed: true});
  };
  if (Date.now() >= Date.parse(run.metadata.deadlineAt!)) {
    await close('failed', `El director no terminó en ${maxMinutes} min`);
    throw new Error(`orca: el director no terminó en ${maxMinutes} min`);
  }
  const page = await orca.terminalRead(run.sessionRef!, run.metadata.cursor);
  const lastLines = [...run.metadata.lastLines ?? [], ...page.text.split('\n')].map(l => l.replace(/[│┃╭╮╰╯─━]/g, '').trim()).filter(Boolean).slice(-20);
  const idlePolls = lastLines.length && await orca.terminalIsIdle(run.sessionRef!) ? (run.metadata.idlePolls ?? 0) + 1 : 0;
  updateRun(db, run.id, {cursor: page.cursor, lastLines, idlePolls});
  if (idlePolls >= 2) { await close('done', (lastLines.at(-1) ?? '').slice(0, 280)); return {done: true}; }
  poll(db, run.id);
};
