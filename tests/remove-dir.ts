import { rmSync } from 'node:fs';

const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Borra una carpeta de prueba. En Windows un proceso que acaba de cerrar aún puede retener un archivo (EPERM/EBUSY), y
 * `rmSync` con `maxRetries` no reintenta EPERM: hasta 5 s en pasos de 100 ms.
 */
export function removeDir(dir: string): void {
  for (let attempt = 1; ; attempt++) {
    try { rmSync(dir, {recursive: true, force: true}); return; } catch (error) {
      if (attempt >= 50 || !['EPERM', 'EBUSY', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      pause(100);
    }
  }
}
