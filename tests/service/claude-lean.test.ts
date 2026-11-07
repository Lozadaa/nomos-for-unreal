import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { leanSettings, leanSettingsFile } from '../../service/src/claude-lean.ts';
import { launchCommand } from '../../service/src/handlers/worker-launch.ts';

test('x10: las sesiones de Nomos apagan los plugins ajenos al juego y compactan a 200 k', () => {
  const user = {enabledPlugins: {'marketing-skills@m': true, 'superpowers@o': true, 'ponytail@p': true, 'code-review@o': true, 'vercel@o': true, 'viejo@x': false}};
  assert.deepEqual(leanSettings(user), {enabledPlugins: {'marketing-skills@m': false, 'vercel@o': false}, autoCompactWindow: 200_000});
  const dir = mkdtempSync(join(tmpdir(), 'nomos-lean-')), home = join(dir, 'claude'), file = join(dir, 'ajustes.json');
  mkdirSync(home); writeFileSync(join(home, 'settings.json'), JSON.stringify(user));
  const env = {CLAUDE_CONFIG_DIR: home, NOMOS_CLAUDE_SETTINGS: file};
  const slashed = file.replace(/\\/g, '/');
  assert.equal(leanSettingsFile(env), slashed);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).enabledPlugins['vercel@o'], false);
  assert.equal(leanSettingsFile({...env, NOMOS_LEAN: 'off'}), null);
  assert.equal(leanSettingsFile({...env, NOMOS_CLAUDE_SETTINGS: join(dir, 'con espacio.json')}), null, 'Orca no admite comillas');
  const saved = {...process.env};
  try {
    Object.assign(process.env, env); delete process.env.NOMOS_LEAN;
    assert.equal(launchCommand('claude', 'opus', 'nomos', 's-1'), `claude --model opus --dangerously-skip-permissions --settings ${slashed} --session-id s-1`);
    assert.equal(launchCommand('codex'), 'codex --yolo --no-daemon');
  } finally { process.env = saved; }
});
