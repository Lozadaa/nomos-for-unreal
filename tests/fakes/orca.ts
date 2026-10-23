import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
const save = () => writeFileSync(file, JSON.stringify(state));

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
      execFileSync('git',['-C',state.realRepo,'worktree','add','-b',value('--name'),path],{windowsHide:true});
      state.creates=(state.creates ?? 0)+1; save();
    }
    emit({ worktree: { id: `repo-1::${path}`, path,
      branch: value('--name') }, ...(process.env.FAKE_ORCA_NO_STARTUP ? {} :
      { startupTerminal: { spawned: true, handle: state.terminalHandle ?? 'term_fake' } }) });
  }
} else if (args[0] === 'worktree' && args[1] === 'rm') {
  if (value('--worktree') !== 'id:repo-1::C:/Juego trabajador') fail('invalid_selector');
  else if ((state.rmBusy ?? 0) > 0 && !args.includes('--force')) {
    state.rmBusy--; save(); fail('worktree_remove_failed', 'EBUSY: resource busy or locked, rmdir');
  }
  else emit({ removed: true, forced: args.includes('--force') });
} else if (args[0] === 'terminal' && args[1] === 'list') {
  if (value('--worktree') !== `id:repo-1::${state.treePath ?? 'C:/Juego trabajador'}`) fail('invalid_selector');
  else emit({ terminals: state.terminals ?? [{ handle: 'term_fake',
    worktreeId: `repo-1::${state.treePath ?? 'C:/Juego trabajador'}`,
    connected: true, writable: true, orphaned: false }], truncated: state.terminalsTruncated ?? false });
} else if (args[0] === 'terminal' && args[1] === 'close') {
  state.closed = [...(state.closed ?? []), value('--terminal')]; save();
  emit({ closed: true, handle: value('--terminal') });
} else if (args[0] === 'terminal' && args[1] === 'read') {
  if (value('--limit') !== '50') fail('missing_limit');
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
    const launch=text==='codex --yolo --no-daemon'||text==='claude --model sonnet --dangerously-skip-permissions';
    if (state.realRepo && launch && !existsSync(join(state.treePath,'.kratos-brief.md'))) {
      fail('missing_brief');
    } else {
    state.tail.push(text);
    if (state.realRepo && launch) state.tail.push(ready());
    if (claude && text==='Lee el archivo .kratos-brief.md de esta carpeta y ejecuta lo que dice.')
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
