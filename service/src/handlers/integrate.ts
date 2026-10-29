import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Handler, WorkerContext } from '../runner.ts';
import type { Command, Decision, Run, Task, Worktree } from '../model.ts';
import { read } from '../repo/rows.ts';
import { blockTask, moveTask, requireTask, setTaskWait } from '../repo/tasks.ts';
import { finishRun } from '../repo/runs.ts';
import { updateRun } from '../repo/worker.ts';
import { addArtifact } from '../repo/artifacts.ts';
import { listDecisions, openDecision } from '../repo/decisions.ts';
import { acquire, leaseWaitReason, release, releasePath } from '../leases.ts';
import { enqueue } from '../commands.ts';
import { appendEvent } from '../store.ts';
import { checkGate } from '../checks/gate.ts';
import { attribute, attributionText } from '../attribution.ts';
import { integrationWorkspace } from '../integration/workspace.ts';
import { isLfsDecision, lfsGate, onlyAttributes } from '../integration/lfs.ts';
import { commandRun } from './asset-run.ts';
import { implementerOf } from './checks.ts';
import { queueGraph } from '../graph.ts';
import { fetchMain, identity, isAncestor, leaf, overlaps, peerLeaseWait, teamConfig, teamGit, type TeamConfig } from '../team.ts';
import { getApproval, keepVersion, requestConflict, type ConflictSide } from '../approvals.ts';

const resolveOption = {id: 'resolve', label: 'Resolver en el worktree', description: 'El responsable integra la rama objetivo en su rama y resuelve el conflicto'};
const discardOption = {id: 'discard', label: 'Descartar la integración', description: 'La tarea vuelve a probando sin integrar'};
const short = (sha: string | null) => sha ? sha.slice(0, 7) : 'ninguna';

/** Run integrador vivo de esta orden, si lo hay (un diferido lo reutiliza). */
function liveRun(ctx: WorkerContext, command: Command): Run | undefined {
  const row = ctx.db.prepare(`select id from runs where json_extract(metadata,'$.commandId')=? and state='running' order by rowid desc limit 1`).get(command.id);
  return row ? read<Run>(ctx.db, 'runs', row.id as string) : undefined;
}
const commandDecision = (ctx: WorkerContext, task: Task, command: Command): Decision | undefined =>
  listDecisions(ctx.db).filter(d => d.taskId === task.id && d.evidence.some(e => e.kind === 'command' && e.ref === command.id)).at(-1);

/** Quién integró antes ese archivo: la atribución de la otra tarea, si la hay. */
function touchedBy(ctx: WorkerContext, taskId: string, path: string): string | null {
  const row = ctx.db.prepare(`select json_extract(payload,'$.taskId') taskId from events where type='integration.completed'
    and json_extract(payload,'$.taskId')!=? and exists(select 1 from json_each(json_extract(payload,'$.files')) where value=?)
    order by seq desc limit 1`).get(taskId, path);
  const other = row ? read<Task>(ctx.db, 'tasks', row.taskId as string) : undefined;
  return other ? `${other.title}${attributionText(other) ? ` (${attributionText(other)})` : ''}` : null;
}

/** Conflicto: se aborta el merge sin resolver nada y se abre la Decisión con las dos versiones. */
async function conflict(ctx: WorkerContext, command: Command, task: Task, run: Run, ws: {dir: string; branch: string}, tree: Worktree, remote = false) {
  const kinds = await ctx.git.conflictKinds(ws.dir), team = teamConfig(ctx.dataDir);
  if (team && kinds.binary.length && !kinds.text.length) return binaryConflict(ctx, task, run, ws.dir, tree, kinds.binary, team, remote);
  const texts = await Promise.all(kinds.text.map(async file => `### ${file}\n${await ctx.git.conflictText(ws.dir, file)}`));
  await ctx.git.abortMerge(ws.dir);
  // el workspace vuelve limpio: mientras se decide, otras integraciones pueden usarlo
  release(ctx.db, run.id);
  const path = `integracion-${run.id}.txt`;
  mkdirSync(join(ctx.dataDir, 'artifacts'), {recursive: true});
  const versions = Object.entries(kinds.versions).map(([file, v]) =>
    `${file}: ${ws.branch} ${short(v.ours)} · ${tree.branch} ${short(v.theirs)}${touchedBy(ctx, task.id, file) ? ` · antes: ${touchedBy(ctx, task.id, file)}` : ''}`);
  writeFileSync(join(ctx.dataDir, 'artifacts', path), [...versions, '', ...texts].join('\n') + '\n');
  const artifact = addArtifact(ctx.db, {taskId: task.id, runId: run.id, kind: 'report', path,
    provenance: {label: 'Integración · conflicto', binary: kinds.binary, text: kinds.text}});
  const binary = kinds.binary.length > 0;
  // el evento va antes que la Decisión: lo posterior con taskId la dejaría obsoleta
  appendEvent(ctx.db, 'integration.conflict', null, {taskId: task.id, runId: run.id, binary: kinds.binary, text: kinds.text});
  openDecision(ctx.db, {taskId: task.id,
    reason: `${binary ? 'Conflicto binario' : 'Conflicto'} al integrar en ${ws.branch}: ${[...kinds.binary, ...kinds.text].map(f => f.split('/').at(-1)).join(', ')}`,
    evidence: [{kind: 'command', ref: command.id}, {kind: 'artifact', ref: artifact.id}, ...versions.map(ref => ({kind: 'version', ref}))],
    options: [resolveOption, discardOption]});
  return {deferred: true, reason: `Esperando decisión: conflicto al integrar`};
}

/** Hito 29: quién dejó ese archivo en la rama objetivo (la firma `Nomos-Equipo` del último commit que lo tocó). */
async function lastAuthor(dir: string, file: string): Promise<ConflictSide> {
  const [head, ...body] = (await teamGit(dir, ['log', '-1', '--first-parent', '--format=%cI%x09%an%x09%s%n%B', 'HEAD', '--', file])).split('\n');
  const [at, author, subject] = head.split('\t'), sig = /^Nomos-Equipo: (\S+) (.+) \((.*)\) tarea (\S+)$/m.exec(body.join('\n'));
  return {who: sig?.[2] ?? author, frente: sig?.[3] ?? '', peerId: sig?.[1] ?? null, taskId: sig?.[4] ?? null,
    task: /^Integrar (.+) \([^)]*\)$/.exec(subject)?.[1] ?? subject, at};
}
/** Hito 29: conflicto en mapas o assets con un peer. La fusión queda abierta y quien chocó elige versión en «Por aprobar». */
async function binaryConflict(ctx: WorkerContext, task: Task, run: Run, dir: string, tree: Worktree, files: string[], team: TeamConfig, remote: boolean) {
  const theirs = await lastAuthor(dir, files[0]), reason = `Conflicto en ${files.map(leaf).join(', ')} con ${theirs.who}`;
  const approval = requestConflict(ctx.db, task.id, {files, theirs,
    mine: {who: team.name, frente: team.frente, task: task.title, at: new Date().toISOString(), taskId: task.id, peerId: identity(ctx.dataDir).id}}, reason);
  appendEvent(ctx.db, 'integration.conflict', null, {taskId: task.id, runId: run.id, binary: files, text: [], with: theirs.who});
  updateRun(ctx.db, run.id, {binaryConflict: {approvalId: approval.id, tip: await ctx.git.tip!(dir, tree.branch), remote}});
  return {deferred: true, reason};
}
/** Hito 29: aplica la versión elegida (o ve que ya se resolvió a mano) y deja la fusión lista para publicar. */
async function afterBinaryConflict(ctx: WorkerContext, task: Task, run: Run, dir: string, tree: Worktree,
  open: NonNullable<Run['metadata']['binaryConflict']>): Promise<{deferred: true; reason: string} | {run: Run}> {
  const approval = getApproval(ctx.db, open.approvalId)!, conflict = approval.conflict!, files = conflict.files.map(leaf).join(', ');
  const unmerged = (await teamGit(dir, ['diff', '--name-only', '--diff-filter=U', '-z'])).split('\0').filter(Boolean);
  const merging = await teamGit(dir, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']).then(() => true, () => false);
  const unblock = () => ctx.db.prepare('update tasks set blocked_reason=null where id=? and blocked_reason like ?').run(task.id, 'Conflicto en %');
  let choice = approval.choice;
  if (approval.state === 'pending') {
    // la persona lo resolvió a mano en su rama: se rehace la fusión desde cero
    if (await ctx.git.tip!(dir, tree.branch) !== open.tip) {
      if (merging) await ctx.git.abortMerge(dir);
      keepVersion(ctx.db, approval.id, 'manual'); unblock();
      return {run: updateRun(ctx.db, run.id, {binaryConflict: undefined, integration: undefined})};
    }
    if (unmerged.length) return {deferred: true, reason: `Esperando tu elección: conflicto en ${files}`};
    // o en el espacio de integración: ya no queda conflicto y se sigue
    choice = keepVersion(ctx.db, approval.id, 'manual').choice;
  }
  // en la fusión, «ours» es la rama objetivo (la suya) y «theirs» la rama del worker (la mía)
  if (choice === 'mine' || choice === 'theirs') for (const file of unmerged) {
    await teamGit(dir, ['checkout', choice === 'mine' ? '--theirs' : '--ours', '--', file]);
    await teamGit(dir, ['add', '--', file]);
  }
  if (merging) await teamGit(dir, ['commit', '--no-edit', '--quiet']);
  const commit = (await teamGit(dir, ['rev-parse', 'HEAD'])).trim(), base = (await teamGit(dir, ['rev-parse', 'HEAD^1'])).trim();
  unblock();
  const team = teamConfig(ctx.dataDir)!, now = new Date().toISOString();
  appendEvent(ctx.db, 'integration.conflict_resolved', null, {taskId: task.id, runId: run.id, files: conflict.files, choice});
  // el dueño del frente del archivo (quien lo integró) recibe lo elegido; si perdió, su tarea vuelve a implementando
  if (choice !== 'manual') appendEvent(ctx.db, 'team.ask', null, {to: conflict.theirs.who, title: `Conflicto en ${files}`, at: now,
    text: `Conflicto en ${files}: ${team.name} se quedó con ${choice === 'mine' ? 'su versión' : 'la tuya'}`,
    ...(choice === 'mine' && conflict.theirs.taskId ? {taskId: conflict.theirs.taskId, reopen: true} : {})});
  return {run: updateRun(ctx.db, run.id, {binaryConflict: undefined, ...(choice === 'theirs' ? {lostConflict: conflict.files} : {}),
    integration: {base, commit, files: await ctx.git.filesBetween(dir, base, commit), ...(open.remote ? {remote: true} : {})}})};
}

/** Tras la Decisión: el responsable resuelve en su worktree, o la integración se descarta. */
function afterConflict(ctx: WorkerContext, task: Task, run: Run, decision: Decision) {
  if (decision.chosenOptionId === resolveOption.id) {
    const implementer = implementerOf(ctx, task), shared = teamConfig(ctx.dataDir) ? ' (en equipo, la de origin, recién traída)' : '';
    enqueue(ctx.db, 'worker.send', {runId: implementer.id, text: `${decision.reason}.\nIntegra la rama objetivo${shared} en tu rama, resuelve el conflicto sin perder `
      + `ninguno de los dos lados (en binarios, pregunta antes de elegir versión), commitea y termina con NOMOS_DONE.`}, `integrate.resolve:${decision.id}`);
    finishRun(ctx.db, run.id, 'cancelled', 'Conflicto devuelto al responsable');
    return {returned: true};
  }
  finishRun(ctx.db, run.id, 'cancelled', 'Integración descartada');
  moveTask(ctx.db, task.id, 'probando', 'Integración descartada');
  return {discarded: true};
}

/** Archivos sin seguir del checkout del usuario que el avance sobrescribiría (git los lista sangrados con tabulador). */
const localFiles = (error: unknown) => {
  const text = error instanceof Error ? error.message : String(error);
  return /untracked working tree files would be overwritten/.test(text) ? text.split(/\r?\n/).filter(l => l.startsWith('\t')).map(l => l.trim()) : [];
};
/** Nunca se tocan: el responsable los saca de su commit sin borrarlos y la tarea vuelve a pasar revisión y pruebas. */
function localFilesBack(ctx: WorkerContext, task: Task, run: Run, files: string[]) {
  release(ctx.db, run.id);
  const reason = `Archivos locales del usuario en el commit: ${files.join(', ')}`;
  enqueue(ctx.db, 'worker.send', {runId: implementerOf(ctx, task).id, text: `${reason}.\nEstán sin seguir a propósito en el checkout del usuario `
    + `(pueden tener secretos) y no van en tus commits. Sácalos con git rm --cached <archivo> sin borrarlos del disco, consigue lo mismo `
    + `sin ellos si hace falta, commitea y termina con NOMOS_DONE.`}, `integrate.local:${run.id}`);
  appendEvent(ctx.db, 'integration.failed', null, {taskId: task.id, runId: run.id, reason});
  finishRun(ctx.db, run.id, 'cancelled', reason);
  return {returned: true};
}

/** Hito 29: mapas y assets que el worker tocó sin reserva; se reservan al vuelo si están libres. Devuelve el motivo de espera. */
async function looseBinaries(ctx: WorkerContext, task: Task, run: Run, dir: string, branch: string): Promise<string | null> {
  const loose = (await teamGit(dir, ['diff', '--name-only', '-z', `HEAD...${branch}`])).split('\0')
    .filter(f => /\.(umap|uasset)$/i.test(f) && !task.leases.some(l => overlaps(l, f)));
  if (!loose.length) return null;
  const since = new Date().toISOString(), local = acquire(ctx.db, run.id, task.id, loose);
  if (!local.ok) return leaseWaitReason(local.conflicts);
  const peer = await peerLeaseWait(ctx.db, ctx.dataDir, ctx.projectDir, loose, since);
  if (peer) {
    for (const path of loose) releasePath(ctx.db, task.id, path);
    appendEvent(ctx.db, 'lease.conflict', null, {taskId: task.id, runId: run.id, peer: peer.name, path: peer.path, until: peer.until});
    return `${leaf(peer.path)} lo tiene ${peer.name}`;
  }
  ctx.db.prepare('update tasks set leases=?,updated_at=? where id=?').run(JSON.stringify([...task.leases, ...loose]), new Date().toISOString(), task.id);
  appendEvent(ctx.db, 'lease.claimed', null, {taskId: task.id, runId: run.id, paths: loose});
  return null;
}

export const integrateRun: Handler = async (command, ctx) => {
  const payload = command.payload as {taskId?: unknown};
  if (typeof payload.taskId !== 'string') throw new Error('invalid_command_payload');
  let task = requireTask(ctx.db, payload.taskId);
  const tree = task.worktreeId ? read<Worktree>(ctx.db, 'worktrees', task.worktreeId) : undefined;
  if (!tree) throw new Error('invalid_integration_target');
  if (!liveRun(ctx, command) && (task.state !== 'integrando' || task.reviewApproved !== 1)) throw new Error('invalid_transition');
  let {run} = commandRun(ctx, command, {title: `Integrar ${task.title}`, provider: 'nomos', role: 'integrador', taskId: task.id});
  const decision = commandDecision(ctx, task, command);
  if (decision?.state === 'open') { release(ctx.db, run.id); return {deferred: true, reason: `Esperando decisión: ${decision.reason}`}; }
  if (decision?.state === 'resolved' && !isLfsDecision(decision)) return afterConflict(ctx, task, run, decision);
  const ws0 = await integrationWorkspace(ctx, false);
  // una integración a la vez por proyecto: la segunda espera y, al entrar, encuentra la base cambiada
  const lease = acquire(ctx.db, run.id, task.id, [`integration/${ws0.name}`]);
  if (!lease.ok) { setTaskWait(ctx.db, task.id, leaseWaitReason(lease.conflicts)); return {deferred: true, reason: leaseWaitReason(lease.conflicts)}; }
  setTaskWait(ctx.db, task.id, null);
  // hito 29: conflicto binario abierto en el espacio de integración, esperando la elección de quien chocó
  if (run.metadata.binaryConflict) {
    const after = await afterBinaryConflict(ctx, task, run, ws0.dir, tree, run.metadata.binaryConflict);
    if ('deferred' in after) return after;
    run = after.run;
  }
  let state = run.metadata.integration;
  const ws = state ? ws0 : await integrationWorkspace(ctx, true), team = teamConfig(ctx.dataDir);
  if (!state) {
    // hito 29: en equipo se integra sobre origin/<rama> recién traída (si divergen, sobre la local y el push dirá por qué)
    const remote = team ? await fetchMain(ctx.db, ctx.projectDir, ws.branch) : null;
    if (remote && !await isAncestor(ws.dir, remote, 'HEAD') && await isAncestor(ws.dir, 'HEAD', remote)) await ctx.git.checkout(ws.dir, remote);
    const loose = team ? await looseBinaries(ctx, task, run, ws.dir, tree.branch) : null;
    if (loose) { release(ctx.db, run.id); setTaskWait(ctx.db, task.id, loose); return {deferred: true, reason: loose}; }
    // hito 5b: contenido pesado sin LFS → Decisión antes de meterlo en la historia
    const gated = await lfsGate(ctx, command, task, run, ws, tree, decision);
    if (gated) return gated;
    const base = await ctx.git.head(ws.dir);
    // en equipo, quién integró viaja en el commit: así se sabe a quién avisar si otro choca con ese archivo
    const signature = team ? `\n\nNomos-Equipo: ${identity(ctx.dataDir).id} ${team.name} (${team.frente}) tarea ${task.id}` : '';
    const merged = await ctx.git.merge(ws.dir, tree.branch, {noFf: true, message: `Integrar ${task.title} (${tree.branch})${signature}`});
    if (!merged.ok) return conflict(ctx, command, task, run, ws, tree, remote !== null);
    state = {base, commit: merged.commit, files: await ctx.git.filesBetween(ws.dir, base, merged.commit), ...(remote !== null ? {remote: true} : {})};
    run = updateRun(ctx.db, run.id, {integration: state});
  }
  // la rama objetivo cambió desde que nació el worktree: recomprobar el resultado integrado antes de publicarlo
  // (no si lo único nuevo es el .gitattributes de LFS)
  const moved = state.base !== tree.baseCommit && !await onlyAttributes(ctx, ws.dir, tree.baseCommit, state.base);
  if (moved && !state.checked) {
    const checks = enqueue(ctx.db, 'checks.run', {taskId: task.id, runId: implementerOf(ctx, task).id, files: state.files, dir: ws.dir},
      `integrate.checks:${run.id}:${state.commit}`);
    const current = read<Command>(ctx.db, 'commands', checks.id)!;
    if (current.state === 'pending' || current.state === 'running') return {deferred: true, reason: 'Recomprobando sobre la rama objetivo'};
    const gate = checkGate(ctx.db, task.id);
    if (current.state === 'failed' || !gate.ok) {
      await ctx.git.checkout(ws.dir, ws.branch);
      finishRun(ctx.db, run.id, 'failed', 'Falló la recomprobación sobre la rama objetivo');
      appendEvent(ctx.db, 'integration.failed', null, {taskId: task.id, runId: run.id, reason: gate.ok ? current.error : gate.reason});
      if (requireTask(ctx.db, task.id).state === 'integrando') moveTask(ctx.db, task.id, 'probando', gate.ok ? 'Falló la recomprobación' : gate.reason);
      return {integrated: false};
    }
    run = updateRun(ctx.db, run.id, {integration: {...state, checked: true}});
  }
  if (state.remote) {
    try { await teamGit(ctx.projectDir, ['push', '--quiet', 'origin', `${state.commit}:refs/heads/${ws.branch}`]); }
    catch (error) {
      // alguien se adelantó (o el remoto lo rechaza): se trae de nuevo y se rehace, hasta 3 veces
      const cause = (error instanceof Error ? error.message : String(error)).split('\n')[0], tries = (run.metadata.pushAttempts ?? 0) + 1;
      await ctx.git.checkout(ws.dir, ws.branch);
      run = updateRun(ctx.db, run.id, {integration: undefined, pushAttempts: tries});
      if (tries < 3) {
        appendEvent(ctx.db, 'integration.retry', null, {taskId: task.id, runId: run.id, reason: `No se pudo publicar ${ws.branch}: ${cause}`});
        return {deferred: true, reason: `Reintentando publicar ${ws.branch} (${tries}/3)`};
      }
      release(ctx.db, run.id);
      appendEvent(ctx.db, 'integration.push_failed', null, {taskId: task.id, runId: run.id, reason: cause});
      blockTask(ctx.db, task.id, `No se pudo publicar main: ${cause}`);
      finishRun(ctx.db, run.id, 'failed', `No se pudo publicar main: ${cause}`);
      return {integrated: false, pushFailed: true};
    }
    // el clon de la persona no se toca: su rama avanza solo si está limpia (o no activa) y no se aparta de lo publicado
    const local = await ctx.git.tip!(ctx.projectDir, ws.branch).catch(() => null), active = await ctx.git.currentBranch(ctx.projectDir) === ws.branch;
    if (local && await isAncestor(ctx.projectDir, local, state.commit) && (!active || (await ctx.git.status(ctx.projectDir)).clean))
      await ctx.git.advanceBranch(ctx.projectDir, ws.branch, state.commit, local).catch(() => {});
  } else try { await ctx.git.advanceBranch(ctx.projectDir, ws.branch, state.commit, state.base); }
  catch (error) {
    await ctx.git.checkout(ws.dir, ws.branch);
    updateRun(ctx.db, run.id, {integration: undefined});
    // hito 7: un archivo sin seguir del usuario (p. ej. Config con secretos) no se arregla reintentando: sale del commit del responsable
    const local = localFiles(error);
    if (local.length) return localFilesBack(ctx, task, run, local);
    // la rama objetivo avanzó por fuera de Nomos (o el checkout del usuario tiene cambios): se rehace sobre la nueva punta
    const reason = `No se pudo avanzar ${ws.branch}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`;
    appendEvent(ctx.db, 'integration.retry', null, {taskId: task.id, runId: run.id, reason});
    return {deferred: true, reason};
  }
  task = requireTask(ctx.db, task.id);
  appendEvent(ctx.db, 'integration.completed', null, {taskId: task.id, runId: run.id, commit: state.commit, base: state.base,
    branch: ws.branch, sourceBranch: tree.branch, files: state.files, rechecked: moved});
  // hito 23: main cambió, el grafo del juego se pone al día (uno a la vez)
  try { queueGraph(ctx.db, ctx.dataDir, ctx.projectDir); } catch { /* sin grafo la integración sigue */ }
  attribute(ctx.db, task.id, 'integro', run);
  const lost = run.metadata.lostConflict;
  if (lost) {
    // hito 29: me quedé con la versión del peer: mi tarea vuelve a implementando sobre la nueva, con aviso al responsable
    const reason = `Conflicto en ${lost.map(leaf).join(', ')}: te quedaste con la suya; rehaz tu cambio sobre la nueva versión`;
    ctx.db.prepare('update tasks set review_approved=0 where id=?').run(task.id);
    moveTask(ctx.db, task.id, 'implementando', reason);
    enqueue(ctx.db, 'worker.send', {runId: implementerOf(ctx, task).id, text: `${reason}.\nTrae ${ws.branch}, rehaz sobre ella el cambio de `
      + `${lost.join(', ')} sin pisar lo que ya hay, commitea y termina con NOMOS_DONE.`}, `integrate.lost:${run.id}`);
  } else moveTask(ctx.db, task.id, 'cerrando', `Integrado en ${ws.branch}@${short(state.commit)}`);
  finishRun(ctx.db, run.id, 'done', `Integrado en ${ws.branch}@${short(state.commit)}`);
  return {integrated: true, commit: state.commit};
};
