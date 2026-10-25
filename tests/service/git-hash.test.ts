import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileHash } from '../../service/src/adapters/git.ts';
import { removeDir } from '../remove-dir.ts';

// hito 16: el diff hashea los assets sin seguir por streaming; con readFileSync un .uasset grande congelaba el servicio
// (/status, /health y el panel no contestaban mientras tanto) y uno de más de 2 GiB ni siquiera se podía leer
test('el hash de un asset deja correr al bucle de eventos mientras lee', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'nomos-git-hash-'));
  t.after(() => removeDir(dir));
  const content = Buffer.alloc(8 * 1024 * 1024, 7), file = join(dir, 'Grande.uasset');
  writeFileSync(file, content);
  let turns = 0;
  const spin = () => { turns++; if (!done) setImmediate(spin); };
  let done = false; setImmediate(spin);
  const hash = await fileHash(file); done = true;
  assert.equal(hash, createHash('sha256').update(content).digest('hex'));
  assert.ok(turns > 10, `el bucle de eventos solo dio ${turns} vueltas mientras se hasheaban 8 MB`);
});
