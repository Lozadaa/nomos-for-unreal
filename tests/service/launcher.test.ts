import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCompletion, tailLog } from '../../service/src/adapters/launcher.ts';
import { removeDir } from '../remove-dir.ts';

const real = readFileSync(join(import.meta.dirname, '..', 'fixtures', 'fab', 'launcher-complete.log'), 'utf8').split(/\r?\n/).filter(Boolean);

test('cierra con HandleTaskComplete AlertCode=[ok] del AppId cuyo manifiesto bajó Fab (log real)', () => {
  assert.equal(parseCompletion(real).done, true);
  assert.equal(parseCompletion(real).appName, 'Advanceddffcefa302e4V2');
});

test('no cierra con la misma línea de otra app (Fortnite) ni con solo la copia de archivos', () => {
  assert.equal(parseCompletion(real.filter(l => l.includes('Fortnite'))).done, false);
  const partial = parseCompletion(real.filter(l => !l.includes('HandleTaskComplete')));
  assert.equal(partial.done, false);
  assert.deepEqual(partial.fabApps, ['89efe5924d3d467c839449ab6ab52e7f:353053051307445ab8926bdb8b44fc76:Advanceddffcefa302e4V2']);
  assert.equal(parseCompletion(real.filter(l => l.includes('HandleTaskComplete')), partial.fabApps).done, true, 'recuerda el manifiesto entre lecturas');
});

test('tailLog lee solo líneas completas nuevas y reinicia si el log rota', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nomos-log-')), file = join(dir, 'EpicGamesLauncher.log');
  try {
    writeFileSync(file, 'uno\r\ndos\r\ntr');
    const first = tailLog(file, 0);
    assert.deepEqual(first.lines, ['uno', 'dos']);
    appendFileSync(file, 'es\n');
    assert.deepEqual(tailLog(file, first.offset).lines, ['tres']);
    writeFileSync(file, 'nuevo\n');
    assert.deepEqual(tailLog(file, 999).lines, ['nuevo']);
    assert.deepEqual(tailLog(join(dir, 'falta.log'), 5), {lines: [], offset: 5});
  } finally { removeDir(dir); }
});
