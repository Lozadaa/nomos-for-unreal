import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli } from './cli-helpers.ts';

// hito 25: el modo jam deja un plan mínimo, un hito por día, y lo marca en la config
test('nomos jam init escribe docs/plan-jam.md y config.jam; un segundo init no sobrescribe sin --force', () => {
  const game = mkdtempSync(join(tmpdir(), 'nomos-jam-')), dataDir = join(game, '.nomos');
  mkdirSync(dataDir); writeFileSync(join(dataDir, 'config.json'), JSON.stringify({workerModel: 'sonnet'}));
  const first = cli(dataDir, 'jam', 'init', '--tema', 'Gravedad al revés', '--dias', '3');
  assert.equal(first.status, 0, first.stderr);
  const plan = readFileSync(join(game, 'docs', 'plan-jam.md'), 'utf8');
  for (const head of ['Idea en una frase', 'Una mecánica', 'Una arena', 'Qué se ve', 'Recortes si falta tiempo', 'Hitos'])
    assert.match(plan, new RegExp(`^## ${head}`, 'm'));
  assert.match(plan, /Gravedad al revés/);
  assert.equal(plan.match(/^\| (Día 1|Mitad|Último día) \|/gm)?.length, 3, 'tres filas');
  assert.equal(plan.split('## Recortes')[1].split('##')[0].match(/^\d\. /gm)?.length, 5, 'cinco recortes');
  assert.equal(plan.match(/^- Día \d: Cierre/gm)?.length, 3, 'un hito por día con su cierre jugable');
  const config = JSON.parse(readFileSync(join(dataDir, 'config.json'), 'utf8'));
  assert.equal(config.workerModel, 'sonnet', 'conserva la config');
  assert.deepEqual([config.jam.enabled, config.jam.days], [true, 3]);
  assert.equal(config.director.mode, 'evento', 'hito 27: en jam el director es por evento');
  assert.match(config.jam.start, /^\d{4}-\d{2}-\d{2}$/);
  writeFileSync(join(game, 'docs', 'plan-jam.md'), 'editado');
  const again = cli(dataDir, 'jam', 'init', '--tema', 'Otro', '--dias', '2');
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /--force/);
  assert.equal(readFileSync(join(game, 'docs', 'plan-jam.md'), 'utf8'), 'editado');
  assert.equal(cli(dataDir, 'jam', 'init', '--tema', 'Otro', '--dias', '2', '--force').status, 0);
  assert.match(readFileSync(join(game, 'docs', 'plan-jam.md'), 'utf8'), /Otro/);
  assert.notEqual(cli(dataDir, 'jam', 'init', '--tema', 'X', '--dias', '0', '--force').status, 0, 'días inválidos');
});
