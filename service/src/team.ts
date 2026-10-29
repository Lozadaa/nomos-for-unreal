import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { readConfig } from './config.ts';
import { appendEvent, createMessage } from './store.ts';
import { latestBuild } from './play.ts';
import { getTask, moveTask } from './repo/tasks.ts';

/**
 * Hito 29: varios Nomos sobre el mismo juego. El estado compartido vive en la rama `nomos/equipo` del remoto `origin`:
 * un archivo `equipo/<id>.json` por persona, escrito solo por su dueño (nunca hay conflicto de fusión en la rama).
 * Todo por Git de línea de órdenes y por fontanería (índice temporal, commit-tree, push): ningún checkout se toca.
 */
export type TeamConfig = {enabled: boolean; name: string; frente: string; branch: string; pullSeconds: number};
export type Card = {id: string; name: string; frente: string; updatedAt: string;
  tasks: {id: string; title: string; state: string; area: string}[];
  leases: {path: string; taskId: string; until: string; at: string}[];
  decisions: {id: string; title: string}[];
  build: {commit: string; at: string} | null;
  requests: {to: string; title: string; text: string; at: string; taskId?: string; reopen?: boolean}[]};
export type Peer = Card & {present: boolean};

export const HEARTBEAT_MS = 5 * 60_000, ABSENT_MS = 30 * 60_000;

/** `config.json: team`; null si el equipo está apagado. */
export function teamConfig(dataDir: string): TeamConfig | null {
  let team: Partial<TeamConfig> | undefined;
  try { team = (readConfig(dataDir) as {team?: Partial<TeamConfig>}).team; } catch { return null; }
  if (!team?.enabled) return null;
  return {enabled: true, name: team.name ?? 'Yo', frente: team.frente ?? '', branch: team.branch ?? 'nomos/equipo', pullSeconds: team.pullSeconds ?? 60};
}
/** Identidad por persona y clon (no por máquina). */
export function identity(dataDir: string): {id: string} {
  const file = join(dataDir, 'identity.json');
  try { const id = JSON.parse(readFileSync(file, 'utf8')).id; if (typeof id === 'string' && /^[\w-]+$/.test(id)) return {id}; } catch { /* se crea */ }
  mkdirSync(dataDir, {recursive: true});
  const id = randomUUID().slice(0, 8);
  writeFileSync(file, JSON.stringify({id}) + '\n');
  return {id};
}
export const myId = (dataDir: string) => existsSync(join(dataDir, 'identity.json')) || teamConfig(dataDir) ? identity(dataDir).id : null;

/** Git sin preguntas (`GIT_TERMINAL_PROMPT=0`), con entrada y entorno opcionales. */
export function teamGit(dir: string, args: string[], opts: {input?: string; env?: Record<string, string>} = {}): Promise<string> {
  return new Promise((accept, reject) => {
    const child = spawn('git', ['-c', 'core.quotepath=false', '-C', dir, ...args], {windowsHide: true, shell: false,
      env: {...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', SSH_ASKPASS: '', LC_ALL: 'C', ...opts.env}});
    let out = '', err = '';
    child.stdout.on('data', c => { out += c; }); child.stderr.on('data', c => { err += c; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? accept(out) : reject(new Error(err.trim() || `git: ${code}`)));
    child.stdin.end(opts.input ?? '');
  });
}
const remoteRef = (branch: string) => `refs/remotes/origin/${branch}`;
const missingBranch = (error: unknown) => /couldn't find remote ref|no such ref/i.test(String(error));

/** Trae la rama de equipo: `null` sin remoto o sin red; `[]` si la rama aún no existe. */
export async function fetchTeam(projectDir: string, branch = 'nomos/equipo'): Promise<Card[] | null> {
  try { await teamGit(projectDir, ['fetch', '--quiet', '--no-tags', 'origin', `+refs/heads/${branch}:${remoteRef(branch)}`]); }
  catch (error) {
    if (!missingBranch(error)) return null;
    await teamGit(projectDir, ['update-ref', '-d', remoteRef(branch)]).catch(() => {});
    return [];
  }
  const names = (await teamGit(projectDir, ['ls-tree', '-z', '--name-only', remoteRef(branch), 'equipo/'])).split('\0').filter(n => n.endsWith('.json'));
  const cards: Card[] = [];
  for (const name of names) {
    try { const card = JSON.parse(await teamGit(projectDir, ['show', `${remoteRef(branch)}:${name}`])); if (card?.id && card.name) cards.push(card); }
    catch { /* tarjeta ilegible: se ignora */ }
  }
  return cards;
}

/** Publica (o retira, con `card=null`) `equipo/<id>.json`; si alguien se adelantó, trae y reintenta. `null` = sin remoto/red. */
export async function publishCard(projectDir: string, dataDir: string, id: string, card: Card | null, branch = 'nomos/equipo'): Promise<boolean | null> {
  const index = join(dataDir, 'team.index'), env = {GIT_INDEX_FILE: index, GIT_AUTHOR_NAME: card?.name ?? 'Nomos', GIT_AUTHOR_EMAIL: 'nomos@equipo.local',
    GIT_COMMITTER_NAME: card?.name ?? 'Nomos', GIT_COMMITTER_EMAIL: 'nomos@equipo.local'};
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await fetchTeam(projectDir, branch) === null) return null;
    const parent = await teamGit(projectDir, ['rev-parse', '--verify', '--quiet', remoteRef(branch)]).then(s => s.trim(), () => '');
    rmSync(index, {force: true});
    if (parent) await teamGit(projectDir, ['read-tree', parent], {env});
    const path = `equipo/${id}.json`;
    if (card) {
      const blob = (await teamGit(projectDir, ['hash-object', '-w', '--stdin'], {input: JSON.stringify(card, null, 2) + '\n'})).trim();
      await teamGit(projectDir, ['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`], {env});
    } else await teamGit(projectDir, ['update-index', '--force-remove', path], {env});
    const tree = (await teamGit(projectDir, ['write-tree'], {env})).trim();
    rmSync(index, {force: true});
    if (parent && tree === (await teamGit(projectDir, ['rev-parse', `${parent}^{tree}`])).trim()) return true;
    const commit = (await teamGit(projectDir, ['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', `equipo: ${card ? card.name : 'sale ' + id}`], {env})).trim();
    try {
      await teamGit(projectDir, ['push', '--quiet', 'origin', `${commit}:refs/heads/${branch}`]);
      await teamGit(projectDir, ['update-ref', remoteRef(branch), commit]);
      return true;
    } catch (error) { if (!/rejected|fetch first|non-fast-forward|stale info/i.test(String(error))) return null; }
  }
  return false;
}

/** T2: trae `origin/<rama>`. Devuelve la referencia, `''` si el remoto aún no tiene la rama, o `null` sin remoto (aviso una vez). */
export async function fetchMain(db: DatabaseSync, projectDir: string, branch: string): Promise<string | null> {
  try { await teamGit(projectDir, ['fetch', '--quiet', '--no-tags', 'origin', `+refs/heads/${branch}:${remoteRef(branch)}`]); return remoteRef(branch); }
  catch (error) {
    if (missingBranch(error)) return '';
    if (!db.prepare("select 1 from events where type='integration.no_remote'").get())
      appendEvent(db, 'integration.no_remote', null, {branch, reason: String(error instanceof Error ? error.message : error).split('\n')[0]});
    return null;
  }
}
export const isAncestor = (dir: string, a: string, b: string) => teamGit(dir, ['merge-base', '--is-ancestor', a, b]).then(() => true, () => false);

/** Mi tarjeta, sacada de la base: tareas abiertas, reservas vivas, decisiones abiertas, build aprobada y peticiones. */
export function myCard(db: DatabaseSync, dataDir: string, now = new Date()): Card {
  const team = teamConfig(dataDir), id = identity(dataDir).id;
  const tasks = db.prepare("select id,title,state,area from tasks where state!='done' order by rowid").all() as Card['tasks'];
  const leases = db.prepare(`select l.path,l.task_id taskId,l.acquired_at at,json_extract(r.metadata,'$.deadlineAt') deadline
    from leases l left join runs r on r.id=l.run_id where l.path not like 'integration/%' order by l.rowid`).all()
    .map(r => ({path: r.path as string, taskId: r.taskId as string, at: r.at as string,
      until: (r.deadline as string | null) ?? new Date(Date.parse(r.at as string) + 4 * 3_600_000).toISOString()}));
  const decisions = db.prepare("select id,reason title from decisions where state='open' order by rowid").all() as Card['decisions'];
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const requests = db.prepare("select payload from events where type='team.ask' and created_at>=? order by seq").all(since)
    .map(r => JSON.parse(r.payload as string) as Card['requests'][number]);
  return {id, name: team?.name ?? 'Yo', frente: team?.frente ?? '', updatedAt: now.toISOString(), tasks, leases, decisions, build: approvedBuild(db, dataDir), requests};
}
/** Hito 29 T2: la última build estampada con un «Aprobar» del usuario posterior. */
function approvedBuild(db: DatabaseSync, dataDir: string): Card['build'] {
  const approved = db.prepare("select max(created_at) at from events where type='approval.approved'").get()?.at as string | null;
  if (!approved) return null;
  try {
    const build = latestBuild(dataDir, db).build;
    return build?.origin && approved >= build.builtAt ? {commit: build.origin.commit, at: approved} : null;
  } catch { return null; }
}

export function migrateTeam(db: DatabaseSync): void {
  db.exec(`create table if not exists team_peers(id text primary key, name text not null, frente text not null,
    card text not null, updated_at text not null, seen_at text not null)`);
  if (!db.prepare('pragma table_info(tasks)').all().some(row => row.name === 'owner')) db.exec('alter table tasks add column owner text');
}
export function listPeers(db: DatabaseSync, now = Date.now()): Peer[] {
  return db.prepare('select card from team_peers order by name').all().map(r => {
    const card = JSON.parse(r.card as string) as Card;
    return {...card, present: now - Date.parse(card.updatedAt) < ABSENT_MS};
  });
}

/** Guarda lo traído: `team.joined` con cada tarjeta nueva (o frente nuevo), `team.left` si alguien sale, y entrega las peticiones para mí. */
export function recordPeers(db: DatabaseSync, dataDir: string, cards: Card[]): void {
  const me = identity(dataDir).id, myName = (teamConfig(dataDir)?.name ?? '').toLowerCase(), seen = new Date().toISOString();
  const known = new Map(db.prepare('select id,frente from team_peers').all().map(r => [r.id as string, r.frente as string]));
  for (const card of cards.filter(c => c.id !== me)) {
    db.prepare(`insert into team_peers(id,name,frente,card,updated_at,seen_at) values(?,?,?,?,?,?)
      on conflict(id) do update set name=excluded.name,frente=excluded.frente,card=excluded.card,updated_at=excluded.updated_at,seen_at=excluded.seen_at`)
      .run(card.id, card.name, card.frente, JSON.stringify(card), card.updatedAt, seen);
    if (!known.has(card.id) || known.get(card.id) !== card.frente)
      appendEvent(db, 'team.joined', null, {peerId: card.id, name: card.name, frente: card.frente, ...(known.has(card.id) ? {changed: true} : {})});
    known.delete(card.id);
    for (const req of card.requests ?? []) {
      if (!myName || req.to?.toLowerCase() !== myName) continue;
      const key = `${card.id}:${req.at}`;
      if (db.prepare("select 1 from events where type='team.request' and json_extract(payload,'$.key')=?").get(key)) continue;
      const {messageId} = createMessage(db, `${card.name} (${card.frente}): ${req.title && !req.text.startsWith(req.title) ? `${req.title}. ` : ''}${req.text}`, 'equipo');
      appendEvent(db, 'team.request', messageId, {key, from: card.name, frente: card.frente, title: req.title, text: req.text, ...(req.taskId ? {taskId: req.taskId} : {})});
      // T4: perdí un conflicto de binario; mi tarea vuelve a implementando sobre la versión nueva
      const lost = req.reopen && req.taskId ? getTask(db, req.taskId) : undefined;
      if (lost && !['done', 'implementando'].includes(lost.state)) {
        db.prepare('update tasks set review_approved=0 where id=?').run(lost.id);
        moveTask(db, lost.id, 'implementando', req.text);
      }
    }
  }
  for (const [id] of known) {
    const row = db.prepare('select name,frente from team_peers where id=?').get(id)!;
    db.prepare('delete from team_peers where id=?').run(id);
    appendEvent(db, 'team.left', null, {peerId: id, name: row.name, frente: row.frente});
  }
}

/** Estado del bucle de sincronización de un servicio. */
export type TeamTick = {hash?: string; pushedAt: number; fetchedAt: number; warned: boolean};
const content = (card: Card) => createHash('sha256').update(JSON.stringify({...card, updatedAt: ''})).digest('hex');
const unavailable = (db: DatabaseSync, s: TeamTick, reason: string) => {
  if (!s.warned) appendEvent(db, 'team.unavailable', null, {reason});
  s.warned = true;
};

/** Un pase (cada 10 s): publica si mi tarjeta cambió (agrupa los cambios de esos 10 s) o toca latido; trae cada `pullSeconds`. */
export async function teamTick(db: DatabaseSync, dataDir: string, projectDir: string, s: TeamTick, now = Date.now(), force = false): Promise<void> {
  const team = teamConfig(dataDir);
  if (!team) return;
  const card = myCard(db, dataDir, new Date(now)), hash = content(card);
  if (force || hash !== s.hash || now - s.pushedAt >= HEARTBEAT_MS) {
    const ok = await publishCard(projectDir, dataDir, card.id, card, team.branch);
    if (ok === null) return unavailable(db, s, 'Sin remoto origin o sin red');
    if (ok) { s.hash = hash; s.pushedAt = now; }
    s.fetchedAt = 0;
  }
  if (!force && now - s.fetchedAt < team.pullSeconds * 1000) return;
  const cards = await fetchTeam(projectDir, team.branch);
  if (cards === null) return unavailable(db, s, 'Sin remoto origin o sin red');
  s.warned = false; s.fetchedAt = now;
  recordPeers(db, dataDir, cards);
}
const ticks = new Map<string, TeamTick>();
/** El pase del servicio para esta carpeta de datos (estado compartido entre el bucle y quien fuerza un pase). */
export const tickState = (dataDir: string) => ticks.get(dataDir) ?? ticks.set(dataDir, {pushedAt: 0, fetchedAt: 0, warned: false}).get(dataDir)!;
let chain = Promise.resolve();
/** Un pase a la vez por proceso: el bucle y la publicación forzada antes de arrancar un worker no se cruzan. */
export function syncTeam(db: DatabaseSync, dataDir: string, projectDir: string, force = false): Promise<void> {
  const next = chain.then(() => teamTick(db, dataDir, projectDir, tickState(dataDir), Date.now(), force));
  chain = next.catch(() => {});
  return next;
}

const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
/** Misma ruta, o una carpeta que contiene a la otra (una carpeta es una ruta reservable). */
export const overlaps = (a: string, b: string) => { const x = norm(a), y = norm(b); return x === y || x.startsWith(y + '/') || y.startsWith(x + '/'); };
/** «L_Arena» de `Content/Mapas/L_Arena.umap`. */
export const leaf = (p: string) => p.replace(/\\/g, '/').split('/').filter(Boolean).at(-1)!.replace(/\.(umap|uasset)$/i, '');
export const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'});
/** T3: el peer que reservó antes que yo (`since`) alguna de `paths`; con la misma fecha gana el id menor. */
export function peerHolder(db: DatabaseSync, me: string, paths: string[], since: string, now = Date.now()): {name: string; path: string; until: string} | null {
  for (const peer of listPeers(db, now)) for (const lease of peer.leases ?? []) {
    if (!(Date.parse(lease.until) > now)) continue;
    if (paths.some(p => overlaps(lease.path, p)) && (lease.at < since || lease.at === since && peer.id < me)) return {name: peer.name, path: lease.path, until: lease.until};
  }
  return null;
}
/** Antes de arrancar un worker: publica mis reservas, trae la rama y mira las de los peers. */
export async function peerLeaseWait(db: DatabaseSync, dataDir: string, projectDir: string, paths: string[], since: string) {
  if (!teamConfig(dataDir) || !paths.length) return null;
  await syncTeam(db, dataDir, projectDir, true).catch(() => { /* sin red: decide con lo último que se vio */ });
  return peerHolder(db, identity(dataDir).id, paths, since);
}
export const holderReason = (h: {name: string; path: string; until: string}) => `${h.name} tiene reservado ${leaf(h.path)} hasta ${hhmm(h.until)}`;
/** Para el planificador, sin red: con lo último que se vio, una reserva viva de un peer hace esperar sin intentar arrancar. */
export function peerLeaseReason(db: DatabaseSync, paths: string[]): string | null {
  const holder = paths.length ? peerHolder(db, '', paths, '￿') : null;
  return holder ? holderReason(holder) : null;
}
/** Normaliza un título para compararlo: sin acentos, minúsculas, palabras de más de 2 letras. */
const words = (title: string) => new Set(title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2));
/** T3: la tarea abierta de un peer con un título muy parecido (mismas palabras en al menos un 60 %). */
export function similarPeerTask(db: DatabaseSync, title: string): {name: string; title: string} | null {
  const mine = words(title);
  for (const peer of listPeers(db)) for (const task of peer.tasks ?? []) {
    const theirs = words(task.title), common = [...mine].filter(w => theirs.has(w)).length;
    if (mine.size && common / new Set([...mine, ...theirs]).size >= 0.6) return {name: peer.name, title: task.title};
  }
  return null;
}

const usage = 'Uso: nomos team init --name N --frente F|status|frente F|leave|ask --to PERSONA TEXTO';
/** `nomos team …`: init, status, frente, leave sin servicio; ask lo deja en el servicio (va en mi tarjeta). */
export async function teamCli(argv: string[], open: (dataDir: string) => DatabaseSync): Promise<boolean> {
  const first = argv.find((a, i) => !a.startsWith('--') && !['--data', '--port', '--session'].includes(argv[i - 1]));
  if (first !== 'team') return false;
  const {parseArgs} = await import('node:util');
  const {values, positionals} = parseArgs({args: argv, allowPositionals: true,
    options: {data: {type: 'string', default: '.nomos'}, name: {type: 'string'}, frente: {type: 'string'}, to: {type: 'string'}, title: {type: 'string'}}});
  if (positionals[0] !== 'team') return false;
  const [, action, ...rest] = positionals, dataDir = values.data!, projectDir = dirname(dataDir), file = join(dataDir, 'config.json');
  const config = () => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const save = (team: object) => { mkdirSync(dataDir, {recursive: true}); writeFileSync(file, JSON.stringify({...config(), team: {...config().team, ...team}}, null, 2) + '\n'); };
  const print = (v: unknown) => console.log(JSON.stringify(v));
  if (action === 'ask') {
    const text = rest.join(' ').trim();
    if (!values.to?.trim() || !text) throw new Error(usage);
    const {request, serviceInfo} = await import('./client.ts');
    print(await request(serviceInfo(dataDir), '/team/ask', {to: values.to.trim(), text, ...(values.title ? {title: values.title} : {})}));
    return true;
  }
  if (action === 'init' || action === 'frente') {
    const frente = (action === 'frente' ? rest.join(' ') : values.frente)?.trim();
    if (!frente || action === 'init' && !values.name?.trim()) throw new Error(usage);
    save(action === 'init' ? {enabled: true, name: values.name!.trim(), frente} : {frente});
  } else if (action === 'leave') {
    const team = teamConfig(dataDir);
    if (team) await publishCard(projectDir, dataDir, identity(dataDir).id, null, team.branch);
    save({enabled: false});
    print({left: true}); return true;
  } else if (action !== 'status' || rest.length) throw new Error(usage);
  const team = teamConfig(dataDir), branch = team?.branch ?? 'nomos/equipo';
  const cards = await fetchTeam(projectDir, branch), me = team ? identity(dataDir).id : null;
  mkdirSync(dataDir, {recursive: true});
  const db = open(dataDir);
  try {
    if (team && cards) {
      // al unirse o cambiar de frente: la tarjeta sale ya (sin esperar al servicio) y el frente tomado se dice, no se bloquea
      if (action !== 'status') await publishCard(projectDir, dataDir, me!, myCard(db, dataDir), branch);
      recordPeers(db, dataDir, cards);
    }
    const others = cards ? cards.filter(c => c.id !== me).map(c => ({...c, present: Date.now() - Date.parse(c.updatedAt) < ABSENT_MS})) : listPeers(db);
    const shared = (others.length > 0) || !!team;
    const taken = team ? others.filter(p => p.frente.toLowerCase() === team.frente.toLowerCase()).map(p => p.name) : [];
    print({enabled: !!team, remote: cards !== null, shared, me: team ? {id: me, name: team.name, frente: team.frente} : null,
      peers: others.map(p => ({name: p.name, frente: p.frente, present: p.present, tasks: p.tasks.length, leases: p.leases.map(l => l.path), build: p.build?.commit ?? null})),
      ...(taken.length ? {aviso: `El frente «${team!.frente}» ya lo tiene ${taken.join(' y ')}; lo compartís.`} : {})});
  } finally { db.close(); }
  return true;
}
