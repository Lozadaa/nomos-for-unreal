import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const file = process.env.FAKE_ORCA_STATE!;
const state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { repos: [], tail: [] };
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
} else if (args[0] === 'repo' && args[1] === 'list') {
  emit({ repos: state.repos });
} else if (args[0] === 'repo' && args[1] === 'add') {
  const repo = { id: 'repo-1', path: value('--path'), displayName: 'Juego' };
  state.repos.push(repo); save(); emit({ repo });
} else if (args[0] === 'worktree' && args[1] === 'create') {
  if (args.includes('--agent') || args.includes('--prompt') || !args.includes('--no-parent')
    || value('--repo') !== 'id:repo-1') fail('invalid_create');
  else emit({ worktree: { id: 'repo-1::C:/Juego trabajador', path: 'C:/Juego trabajador',
    branch: value('--name') }, ...(process.env.FAKE_ORCA_NO_STARTUP ? {} :
    { startupTerminal: { spawned: true, handle: 'term_fake' } }) });
} else if (args[0] === 'worktree' && args[1] === 'rm') {
  if (value('--worktree') !== 'id:repo-1::C:/Juego trabajador') fail('invalid_selector');
  else emit({ removed: true, forced: args.includes('--force') });
} else if (args[0] === 'terminal' && args[1] === 'list') {
  if (value('--worktree') !== `id:repo-1::${state.treePath ?? 'C:/Juego trabajador'}`) fail('invalid_selector');
  else emit({ terminals: state.terminals ?? [{ handle: 'term_fake',
    worktreeId: `repo-1::${state.treePath ?? 'C:/Juego trabajador'}`,
    connected: true, writable: true, orphaned: false }], truncated: state.terminalsTruncated ?? false });
} else if (args[0] === 'terminal' && args[1] === 'read') {
  if (value('--limit') !== '50') fail('missing_limit');
  else {
    const screen=!args.includes('--cursor') && Array.isArray(state.screen);
    const cursor = args.includes('--cursor') ? Number(value('--cursor')) : Math.max(0, state.tail.length - 50);
    const tail = screen ? state.screen.slice(-50) : state.tail.slice(cursor, cursor + 50);
    const next=screen ? state.screenCursor ?? state.tail.length : cursor+tail.length;
    emit({ terminal: { handle: value('--terminal'), tail, oldestCursor: '0',
      nextCursor: process.env.FAKE_ORCA_NUMERIC_CURSOR ? next : String(next),
      latestCursor: String(state.tail.length),
      ...(screen ? {truncated:state.screenTruncated ?? false} : {}),
      limited: screen ? state.screen.length>50 : cursor + tail.length < state.tail.length,
      source:screen ? 'screen' : 'stream' } });
  }
} else if (args[0] === 'terminal' && args[1] === 'send') {
  if (!args.includes('--enter')) fail('missing_enter');
  else {
    const text=value('--text');
    state.tail.push(text);
    save();
    const accepted = process.env.FAKE_ORCA_SEND_MISSING ? {} : { accepted: process.env.FAKE_ORCA_REJECT !== '1' };
    const requestId = 'fake-send-request';
    emit(process.env.FAKE_ORCA_SEND_LEGACY ? { terminal: { handle: value('--terminal') }, ...accepted } : {
      send: { handle: value('--terminal'), ...accepted, bytesWritten: Buffer.byteLength(text) + 1,
        prompt: { requestId, stages: ['input_accepted'], provider: 'codex', observation: 'supported',
          processIncarnation: 'fake-incarnation', generation: 1, baselineWorkingSequence: 0,
          baselineExplicitWorkingStartedAt: null, baselinePermissionSequence: 0 } },
      mutation: { requestId, replayed: false }, warnings: [],
    });
  }
} else if (args[0] === 'terminal' && args[1] === 'wait') {
  if (value('--for') !== 'tui-idle' || Number(value('--timeout-ms')) > 60000) fail('invalid_wait');
  else {
    if (process.env.FAKE_ORCA_READY_AFTER_WAIT) { state.tail.push('› Ask Codex'); save(); }
    const satisfied = process.env.FAKE_ORCA_SATISFIED === '1';
    if (!satisfied && process.env.FAKE_ORCA_WAIT_TIMEOUT) fail('timeout');
    else {
      emit({ wait: { satisfied, timedOut: !satisfied } });
      if (!satisfied) process.exitCode = Number(process.env.FAKE_ORCA_EXIT_CODE ?? 1);
    }
  }
} else fail('unknown_command');
