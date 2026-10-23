import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

export async function waitFor(check: () => boolean, ms = 3000) {
  for (const end = Date.now() + ms; Date.now() < end && !check();) await delay(10);
  assert.ok(check(), `No se observó el resultado antes de ${ms} ms`);
}
