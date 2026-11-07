import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { carpetasCrash, ultimoCrash } from '../../service/src/editor/crash.ts';

test('harness: nomos ue crash lee el informe más reciente de las dos carpetas (mensaje, pila y log desde el fallo)', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'nomos-crash-')), proyecto = join(raiz, 'Juego'), local = join(raiz, 'Local');
  const viejo = join(proyecto, 'Saved', 'Crashes', 'UECC-1'), nuevo = join(local, 'UnrealEngine', '5.8', 'Saved', 'Crashes', 'UECC-2');
  for (const d of [viejo, nuevo]) mkdirSync(d, {recursive: true});
  writeFileSync(join(viejo, 'CrashContext.runtime-xml'), '<ErrorMessage>viejo</ErrorMessage>');
  utimesSync(viejo, new Date(2026, 0, 1), new Date(2026, 0, 1));
  writeFileSync(join(nuevo, 'CrashContext.runtime-xml'),
    '<R><ErrorMessage>Assertion failed: X &amp;&amp; Y\n\nStack: \n0x1 a.dll</ErrorMessage><CallStack>Juego!APlayer::Tick() [P.cpp:12]\nUnrealEditor_Engine</CallStack></R>');
  writeFileSync(join(nuevo, 'Juego.log'), ['uno', 'dos', 'LogWindows: Error: Assertion failed: X && Y', 'tres'].join('\n'));
  const carpetas = carpetasCrash(proyecto, local);
  assert.equal(carpetas.length, 2);
  const c = ultimoCrash(carpetas, proyecto)!;
  assert.equal(c.error, 'Assertion failed: X && Y');
  assert.deepEqual(c.pila, ['Juego!APlayer::Tick() [P.cpp:12]', 'UnrealEditor_Engine']);
  assert.deepEqual(c.extracto, ['LogWindows: Error: Assertion failed: X && Y', 'tres']);
  assert.equal(ultimoCrash([], proyecto), null);
});
