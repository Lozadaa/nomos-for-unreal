import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../service/src/db.ts';
import { appendEvent, createMessage, listEvents } from '../../service/src/store.ts';
import { claim, complete, fail } from '../../service/src/commands.ts';
import { read } from '../../service/src/repo/rows.ts';
import { reservations } from '../../service/src/scheduler-state.ts';
import { directorPoll, directorTick, directorWake } from '../../service/src/director.ts';
import type { Run } from '../../service/src/model.ts';
import { removeDir } from '../remove-dir.ts';
import { fixture } from './route-fixture.ts';
import { startRun } from '../../service/src/repo/runs.ts';

/** Orca falso en memoria: un terminal por director; `out` es lo que escribe y `idle` si ya terminó. */
function setup(t: any, director: object = {mode: 'evento', debounceSeconds: 60}) {
  const root = mkdtempSync(join(tmpdir(), 'nomos-dir-')), project = join(root, 'Juego'), dataDir = join(project, '.nomos');
  mkdirSync(dataDir, {recursive: true});
  writeFileSync(join(dataDir, 'config.json'), JSON.stringify({director}));
  const db = openDb(join(dataDir, 'nomos.db'));
  t.after(() => { db.close(); removeDir(root); });
  const terms: {path: string; command: string; out: string[]; idle: boolean; closed: boolean}[] = [];
  const orca: any = {
    async terminalCreate(path: string, _title: string, command: string) { terms.push({path, command, out: [], idle: false, closed: false}); return `t${terms.length}`; },
    async terminalRead(handle: string, cursor?: string) {
      const term = terms[Number(handle.slice(1)) - 1], from = Number(cursor ?? 0);
      return {text: term.out.slice(from).join('\n'), cursor: String(term.out.length)};
    },
    async terminalIsIdle(handle: string) { return terms[Number(handle.slice(1)) - 1].idle; },
    async terminalClose(handle: string) { terms[Number(handle.slice(1)) - 1].closed = true; },
  };
  const ctx: any = {db, orca, dataDir, projectDir: project};
  const pending = (type: string) => db.prepare("select count(*) n from commands where type=? and state='pending'").get(type)!.n as number;
  // ejecuta las órdenes de director pendientes (sin esperar a notBefore) como el runner
  async function drain(type: string) {
    db.prepare("update commands set not_before=null where type=?").run(type);
    for (let c = claim(db, 'test'); c; c = claim(db, 'test')) {
      if (c.type !== type) { complete(db, c.id); continue; }
      try { complete(db, c.id, (await (type === 'director.wake' ? directorWake : directorPoll)(c, ctx)) || undefined); }
      catch (error) { fail(db, c.id, (error as Error).message, {retry: false}); }
    }
  }
  const later = (s: number) => Date.now() + s * 1000;
  const runs = () => db.prepare("select id from runs where role='director' order by rowid").all().map(r => read<Run>(db, 'runs', r.id as string)!);
  return {db, ctx, terms, pending, drain, later, runs, dataDir, project};
}

test('hito 27: los eventos se agrupan durante debounceSeconds en un solo despertar con su brief', async t => {
  const f = setup(t);
  createMessage(f.db, 'Hola', 'web');
  directorTick(f.ctx);
  assert.equal(f.pending('director.wake'), 0, 'dentro de la ventana no se despierta');
  appendEvent(f.db, 'worker.waiting', null, {runId: 'r', taskId: 'x', question: '¿Sigo?'});
  directorTick(f.ctx, f.later(61)); directorTick(f.ctx, f.later(62));
  assert.equal(f.pending('director.wake'), 1, 'dos eventos, un despertar');
  await f.drain('director.wake');
  assert.equal(f.terms.length, 1);
  assert.equal(f.terms[0].path, f.project, 'el director corre en la raíz del juego');
  assert.match(f.terms[0].command, /^claude --model sonnet --dangerously-skip-permissions --session-id [0-9a-f-]{36} "\/nomos evento: lee \.nomos\/director-brief\.md/);
  assert.match(readFileSync(join(f.dataDir, 'director-brief.md'), 'utf8'), /Hola[\s\S]*worker\.waiting/);
  const [run] = f.runs();
  assert.deepEqual([run.taskId, run.role, run.provider, run.state], ['director', 'director', 'claude', 'running']);
  assert.equal(reservations(f.db).usage.claude, 0, 'el director no ocupa cupo de workers');
});

test('hito 27: un director a la vez; lo que llega durante la sesión despierta al siguiente; sus propios eventos no', async t => {
  const f = setup(t, {mode: 'evento', debounceSeconds: 0});
  createMessage(f.db, 'Primero', 'web');
  directorTick(f.ctx); await f.drain('director.wake');
  createMessage(f.db, 'Segundo', 'web');
  directorTick(f.ctx);
  assert.equal(f.pending('director.wake'), 0, 'con un director activo no se lanza otro');
  f.terms[0].out.push('Respondido el mensaje Primero.'); f.terms[0].idle = true;
  await f.drain('director.poll'); await f.drain('director.poll'); await f.drain('director.poll');
  const [first] = f.runs();
  assert.equal(first.state, 'done');
  assert.equal(first.summary, 'Respondido el mensaje Primero.');
  assert.equal(f.terms[0].closed, true, 'la sesión termina y su terminal se cierra');
  assert.equal(f.db.prepare("select count(*) n from commands where type='run.tokens'").get()!.n, 1, 'tokens medidos como un worker');
  directorTick(f.ctx); await f.drain('director.wake');
  assert.equal(f.terms.length, 2, 'el mensaje encolado lanza el siguiente');
  assert.match(readFileSync(join(f.dataDir, 'director-brief.md'), 'utf8'), /Segundo/);
  f.terms[1].out.push('Hecho.'); f.terms[1].idle = true;
  await f.drain('director.poll'); await f.drain('director.poll'); await f.drain('director.poll');
  directorTick(f.ctx);
  assert.equal(f.pending('director.wake'), 0, 'su run.finished y sus órdenes no lo despiertan otra vez');
});

test('hito 27: pasados 20 min la run falla, el terminal se cierra, command.failed y el siguiente evento vuelve a lanzar', async t => {
  const f = setup(t, {mode: 'evento', debounceSeconds: 0});
  createMessage(f.db, 'Uno', 'web');
  directorTick(f.ctx); await f.drain('director.wake');
  const [run] = f.runs();
  assert.equal(Date.parse(run.metadata.deadlineAt!) - Date.parse(run.startedAt) >= 20 * 60_000 - 1000, true);
  f.db.prepare('update runs set metadata=json_set(metadata,\'$.deadlineAt\',?) where id=?').run(new Date(Date.now() - 1000).toISOString(), run.id);
  await f.drain('director.poll');
  assert.equal(f.runs()[0].state, 'failed');
  assert.equal(f.terms[0].closed, true);
  assert.ok(listEvents(f.db, 0).some(e => e.type === 'command.failed' && (e.payload as any).type === 'director.poll'));
  createMessage(f.db, 'Dos', 'web');
  directorTick(f.ctx); await f.drain('director.wake');
  assert.equal(f.terms.length, 2);
});

test('hito 27: en modo sesion (por defecto) no se lanza ningún director', async t => {
  const f = setup(t, {});
  createMessage(f.db, 'Hola', 'web');
  directorTick(f.ctx, f.later(3600));
  assert.equal(f.pending('director.wake'), 0);
});

test('hito 27: GET /runs/:id de un director (sin tarea) responde para que Producción lo enseñe', async t => {
  const f = await fixture(); t.after(() => f.close());
  const run = startRun(f.db, {taskId: 'director', role: 'director', provider: 'claude'});
  const res = await f.request(`/runs/${run.id}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual([body.run.role, body.worktree, body.latestStatus.state], ['director', null, 'running']);
});

// experimento metras 2026-11-08: 40 despertares, casi todos para pasos que el servicio ya da solo
test('en evento, lo que el servicio ya mueve solo no despierta; lo que pide juicio, sí', async t => {
  const f = setup(t, {mode: 'evento', debounceSeconds: 0});
  const {createTask} = await import('../../service/src/repo/tasks.ts');
  const {openDecision} = await import('../../service/src/repo/decisions.ts');
  const task = createTask(f.db, {title: 'Metras', area: 'gameplay'});
  appendEvent(f.db, 'run.finished', null, {taskId: task.id, runId: 'r1', state: 'done'});
  appendEvent(f.db, 'task.moved', null, {taskId: task.id, from: 'implementando', state: 'revisando'});
  appendEvent(f.db, 'review.finished', null, {taskId: task.id, approved: true, findings: [], stale: false});
  appendEvent(f.db, 'integration.completed', null, {taskId: task.id, commit: 'abc'});
  openDecision(f.db, {taskId: task.id, reason: 'Máximo de tres correcciones alcanzado', evidence: [{kind: 'gate:corrections', ref: 'x'}],
    options: [{id: 'review', label: '', description: ''}, {id: 'aceptar', label: '', description: ''}]});
  directorTick(f.ctx);
  assert.equal(f.pending('director.wake'), 0, 'pasos rutinarios y una Decisión que se resuelve sola en 1 min');
  appendEvent(f.db, 'review.finished', null, {taskId: task.id, approved: false, findings: [], stale: false});
  directorTick(f.ctx);
  assert.equal(f.pending('director.wake'), 1, 'un rechazo cuyos hallazgos nadie reenvió sí despierta');
  await f.drain('director.wake');
  const other = createTask(f.db, {title: 'Otra', area: 'gameplay'});
  appendEvent(f.db, 'run.finished', null, {taskId: other.id, runId: 'r2', state: 'failed'});
  openDecision(f.db, {taskId: other.id, reason: '¿Puede ampliar su alcance?', evidence: [], options: [{id: 'si', label: '', description: ''}]});
  const {pendingWake} = await import('../../service/src/director.ts');
  assert.deepEqual(pendingWake(f.db, f.dataDir).map(e => e.type), ['run.finished', 'decision.opened'], 'fallos y preguntas de verdad');
});
