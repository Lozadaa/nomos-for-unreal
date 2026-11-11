import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const args = process.argv.slice(2);
const file = process.env.FAKE_ORCA_STATE!;
const state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { repos: [], tail: [] };
const claude=process.env.FAKE_ORCA_MODE==='claude';
const ready=()=>claude ? 'bypass permissions on' : '› Ask Codex';
const value = (flag: string) => args[args.indexOf(flag) + 1];
const emit = (result: object) => {
  console.log(JSON.stringify({ id: 'fake-request', ok: true, result }));
  if (process.env.FAKE_ORCA_EXIT_CODE) process.exitCode = Number(process.env.FAKE_ORCA_EXIT_CODE);
};
const fail = (code: string, message = code) => {
  console.log(JSON.stringify({ id: 'fake-request', ok: false, error: { code, message } }));
  process.exitCode = 1;
};
// temporal y rename: las pruebas leen el estado mientras otra orden del fake lo reescribe
const save = () => { const tmp = `${file}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(state)); renameSync(tmp, file); };

if (process.env.FAKE_ORCA_HANG === '1') {
  setInterval(() => {}, 1000);
} else if (process.env.FAKE_ORCA_ERROR) {
  fail(process.env.FAKE_ORCA_ERROR);
} else if (process.env.FAKE_ORCA_BAD_JSON) {
  console.log('respuesta rota');
} else if (!args.includes('--json')) {
  fail('missing_json');
} else if (args[0] === 'open') {
  state.down = false; state.opened = (state.opened ?? 0) + 1; save(); emit({ app: { running: true } });
} else if (args[0] === 'status') {
  emit({ app: { running: !state.down }, runtime: { state: state.down ? 'stopped' : 'ready', reachable: !state.down } });
} else if (state.down) {
  fail('orca_not_running', 'Orca no está abierto');
} else if (state.updating) {
  // hito 16: lo que dice el CLI mientras la app de Orca se actualiza (sin orca-runtime.json)
  fail('runtime_unavailable', state.updating);
} else if (args[0] === 'repo' && args[1] === 'list') {
  emit({ repos: state.repos });
} else if (args[0] === 'repo' && args[1] === 'add') {
  const repo = { id: 'repo-1', path: value('--path'), displayName: 'Juego' };
  state.repos.push(repo); save(); emit({ repo });
} else if (args[0] === 'worktree' && args[1] === 'create') {
  if (args.includes('--agent') || args.includes('--prompt') || !args.includes('--no-parent')
    || value('--repo') !== 'id:repo-1') fail('invalid_create');
  else {
    let path='C:/Juego trabajador';
    if (state.realRepo) {
      path=state.treePath;
      execFileSync('git',['-C',state.realRepo,'worktree','add','-b',value('--name'),path,...(state.createBase ? [state.createBase] : [])],{windowsHide:true});
      state.creates=(state.creates ?? 0)+1; save();
    }
    const answer = () => emit({ worktree: { id: `repo-1::${path}`, path,
      branch: value('--name') }, ...(process.env.FAKE_ORCA_NO_STARTUP ? {} :
      { startupTerminal: { spawned: true, handle: state.terminalHandle ?? 'term_fake' } }) });
    // hito 22: en frío Orca tarda; el árbol ya existe (salvo createFailsEarly) aunque la respuesta no haya llegado
    if (state.createDelayMs) {
      if (!state.createFailsEarly) { state.worktrees = [...(state.worktrees ?? []), { id: `repo-1::${path}`, repoId: 'repo-1', path,
        branch: `refs/heads/${value('--name')}`, displayName: value('--name') }]; save(); }
      setTimeout(answer, state.createDelayMs);
    } else answer();
  }
} else if (args[0] === 'worktree' && args[1] === 'list') {
  emit({ worktrees: state.worktrees ?? [] });
} else if (args[0] === 'worktree' && args[1] === 'rm') {
  if (value('--worktree') !== `id:repo-1::${state.treePath ?? 'C:/Juego trabajador'}`) fail('invalid_selector');
  else if ((state.rmBusy ?? 0) > 0 && !args.includes('--force')) {
    state.rmBusy--; save(); fail('worktree_remove_failed', 'EBUSY: resource busy or locked, rmdir');
  }
  else {
    // hito 13: como Orca 1.4.207, retira la carpeta y conserva la rama (solo si la prueba lo pide)
    if (state.realRepo && state.realRemove) execFileSync('git',['-C',state.realRepo,'worktree','remove','--force',state.treePath],{windowsHide:true});
    state.removed = [...(state.removed ?? []), value('--worktree').slice(3)]; save();
    emit({ removed: true, forced: args.includes('--force') });
  }
} else if (args[0] === 'terminal' && args[1] === 'list') {
  if (value('--worktree') !== `id:repo-1::${state.treePath ?? 'C:/Juego trabajador'}`) fail('invalid_selector');
  else emit({ terminals: state.terminals ?? [{ handle: 'term_fake',
    worktreeId: `repo-1::${state.treePath ?? 'C:/Juego trabajador'}`,
    connected: true, writable: true, orphaned: false }], truncated: state.terminalsTruncated ?? false });
} else if (args[0] === 'terminal' && args[1] === 'create') {
  // hito 19: el relevo abre un terminal nuevo en el mismo worktree con la orden como argumento
  const handle = `term_nuevo_${(state.created ?? []).length + 1}`;
  state.created = [...(state.created ?? []), { handle, worktree: value('--worktree'), title: value('--title'), command: value('--command') }]; save();
  emit({ terminal: { handle } });
} else if (args[0] === 'terminal' && args[1] === 'close') {
  state.closed = [...(state.closed ?? []), value('--terminal')]; save();
  emit({ closed: true, handle: value('--terminal') });
} else if (args[0] === 'terminal' && args[1] === 'read') {
  if (value('--limit') !== '50') fail('missing_limit');
  // hito 22: tras un reinicio del PC el terminal ya no existe en Orca
  else if ((state.gone ?? []).includes(value('--terminal'))) fail('terminal_handle_stale', 'Terminal handle is stale');
  else if ((state.closed ?? []).includes(value('--terminal'))) emit({ terminal: { handle: value('--terminal'), status: 'exited', tail: [], nextCursor: '0' } });
  else {
    const screen=!args.includes('--cursor') && Array.isArray(state.screen);
    const oldest=Number(state.oldestCursor ?? 0);
    const cursor = Math.max(oldest,args.includes('--cursor') ? Number(value('--cursor')) : oldest+state.tail.length-50);
    const tail = screen ? state.screen.slice(-50) : state.tail.slice(cursor-oldest, cursor-oldest+50);
    const next=screen ? state.screenCursor ?? oldest+state.tail.length : cursor+tail.length;
    emit({ terminal: { handle: value('--terminal'), tail, oldestCursor: state.oldestCursor ?? '0',
      nextCursor: process.env.FAKE_ORCA_NUMERIC_CURSOR ? next : String(next),
      latestCursor: String(oldest+state.tail.length),
      ...(screen ? {truncated:state.screenTruncated ?? false} : {}),
      limited: screen ? state.screen.length>50 : cursor + tail.length < oldest+state.tail.length,
      source:screen ? 'screen' : 'stream' } });
  }
} else if (args[0] === 'terminal' && args[1] === 'send') {
  if (!args.includes('--enter')) fail('missing_enter');
  else {
    const text=value('--text');
    const opencode=/^opencode run --auto --model \S+ --title nomos-[0-9a-f]{8} Lee el archivo \.nomos-brief\.md de esta carpeta y ejecuta lo que dice\.$/.test(text);
    const launch=opencode||text==='codex --yolo --no-daemon -c model_reasoning_effort=medium'||/^claude --model (sonnet|opus|haiku) --dangerously-skip-permissions( --session-id [0-9a-f-]{36})?$/.test(text);
    if (state.realRepo && launch && !existsSync(join(state.treePath,'.nomos-brief.md'))) {
      fail('missing_brief');
    } else {
    state.tail.push(text);
    if (state.realRepo && launch && !opencode) state.tail.push(ready());
    if (opencode && process.env.FAKE_ORCA_OPENCODE_CREDENTIAL) state.tail.push('Error: Upstream request failed: Invalid credential');
    if (opencode && process.env.FAKE_ORCA_OPENCODE_MISSING) state.tail.push("'opencode' is not recognized as an internal or external command,");
    if (claude && text==='Lee el archivo .nomos-brief.md de esta carpeta y ejecuta lo que dice.')
      state.tail.push('Do you want to allow this command? (y/n)');
    save();
    const accepted = process.env.FAKE_ORCA_SEND_MISSING ? {} : { accepted: process.env.FAKE_ORCA_REJECT !== '1' };
    const requestId = 'fake-send-request';
    emit(process.env.FAKE_ORCA_SEND_LEGACY ? { terminal: { handle: value('--terminal') }, ...accepted } : {
      send: { handle: value('--terminal'), ...accepted, bytesWritten: Buffer.byteLength(text) + 1,
        prompt: { requestId, stages: ['input_accepted'], provider: claude ? 'claude' : 'codex', observation: 'supported',
          processIncarnation: 'fake-incarnation', generation: 1, baselineWorkingSequence: 0,
          baselineExplicitWorkingStartedAt: null, baselinePermissionSequence: 0 } },
      mutation: { requestId, replayed: false }, warnings: [],
    });
    }
  }
} else if (args[0] === 'terminal' && args[1] === 'wait') {
  if (value('--for') !== 'tui-idle' || Number(value('--timeout-ms')) > 60000) fail('invalid_wait');
  else {
    if (process.env.FAKE_ORCA_READY_AFTER_WAIT) { state.tail.push(ready()); save(); }
    const satisfied = process.env.FAKE_ORCA_SATISFIED === '1' || state.idle === true;
    if (!satisfied && process.env.FAKE_ORCA_WAIT_TIMEOUT) fail('timeout');
    else {
      emit({ wait: { satisfied, timedOut: !satisfied } });
      if (!satisfied) process.exitCode = Number(process.env.FAKE_ORCA_EXIT_CODE ?? 1);
    }
  }
} else fail('unknown_command');
