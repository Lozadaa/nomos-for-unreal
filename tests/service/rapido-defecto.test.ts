import { test } from 'node:test';
import assert from 'node:assert/strict';
import { directorConfig, heavyMax, limits, minFreeRamGb, rapido } from '../../service/src/config.ts';

// la suite fija NOMOS_RAPIDO_DEFAULT=off (tests/registry-env.ts) para medir los valores de antes; aquí, el valor real
delete process.env.NOMOS_RAPIDO_DEFAULT;

test('jam: sin fijar nada, el modo rápido es el modo (y el director va por evento)', () => {
  const values = (c: object) => [rapido(c), heavyMax(c), minFreeRamGb(c), limits(c).corrections, directorConfig(c).mode];
  assert.deepEqual(values({}), [true, 2, 1.5, 1, 'evento']);
  assert.deepEqual(values({rapido: false}), [false, 1, 6, 3, 'sesion']);
  assert.equal(directorConfig({rapido: false, director: {mode: 'evento'}}).mode, 'evento');
});
