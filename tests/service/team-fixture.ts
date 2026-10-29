import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { openDb } from '../../service/src/db.ts';
import { listEvents } from '../../service/src/store.ts';
import { removeDir } from '../remove-dir.ts';

/** Hito 29: remoto bare local y clones del juego, cada uno con su `.nomos` y su tarjeta de equipo. Nada sale a un remoto real. */
export function teamFixture() {
  const root = mkdtempSync(join(tmpdir(), 'nomos-team-')), bare = join(root, 'remoto.git');
  const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], {encoding: 'utf8', windowsHide: true, stdio: 'pipe',
    env: {...process.env, GIT_TERMINAL_PROMPT: '0'}}).trim();
  execFileSync('git', ['init', '-q', '--bare', '-b', 'master', bare], {stdio: 'pipe'});
  const seed = join(root, 'semilla'); mkdirSync(seed);
  git(seed, 'init', '-q', '-b', 'master'); git(seed, 'config', 'user.name', 'Semilla'); git(seed, 'config', 'user.email', 's@example.invalid');
  git(seed, 'config', 'core.autocrlf', 'false');
  writeFileSync(join(seed, 'Juego.uproject'), '{}\n'); writeFileSync(join(seed, '.gitignore'), '.nomos/\n');
  writeFileSync(join(seed, 'notas.txt'), 'uno\n');
  git(seed, 'add', '.'); git(seed, 'commit', '-q', '-m', 'Base'); git(seed, 'remote', 'add', 'origin', bare); git(seed, 'push', '-q', 'origin', 'master');
  const dbs: {close(): void}[] = [];
  /** Clon `name` con equipo encendido (o sin remoto si `remote=false`). */
  const clone = (name: string, frente: string, remote = true) => {
    const dir = join(root, name);
    if (remote) execFileSync('git', ['clone', '-q', '-c', 'core.autocrlf=false', bare, dir], {stdio: 'pipe'});
    else { mkdirSync(dir); git(dir, 'init', '-q', '-b', 'master'); }
    git(dir, 'config', 'user.name', name); git(dir, 'config', 'user.email', `${name}@example.invalid`); git(dir, 'config', 'core.autocrlf', 'false');
    const dataDir = join(dir, '.nomos'); mkdirSync(dataDir, {recursive: true});
    writeFileSync(join(dataDir, 'config.json'), JSON.stringify({team: {enabled: true, name, frente}}));
    const db = openDb(join(dataDir, 'nomos.db')); dbs.push(db);
    const events = (type: string) => listEvents(db, 0).filter(e => e.type === type).map(e => e.payload as Record<string, any>);
    return {dir, dataDir, db, events};
  };
  return {root, bare, git, clone, close() { for (const db of dbs) db.close(); removeDir(root); }};
}
