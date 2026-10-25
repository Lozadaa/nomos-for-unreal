import { closeSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

/** En Windows renombrar sobre un archivo que otro proceso tiene abierto (antivirus, indexador, un lector) da EPERM un instante. */
function replace(from: string, to: string): void {
  for (let attempt = 0; ; attempt++) {
    try { renameSync(from, to); return; } catch (error) {
      if (attempt >= 20 || !['EPERM', 'EBUSY', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
}

/**
 * Hito 22: los JSON de estado se escriben en un temporal propio, se fuerzan a disco y se renombran encima. Sin el
 * `fsync`, un corte de luz dejaba el rename hecho y el contenido sin escribir (un archivo lleno de ceros).
 */
export function writeAtomic(file: string, text: string, mode = 0o644): void {
  const temporary = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    const fd = openSync(temporary, 'w', mode);
    try { writeSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
    replace(temporary, file);
  } catch (error) { rmSync(temporary, {force: true}); throw error; }
}

/** Lee un JSON de estado; si falta, `fallback`; si está corrupto (o lleno de ceros), `fallback` con aviso. */
export function readJson<T>(file: string, fallback: T, warn: (message: string) => void = console.error): T {
  let text: string;
  try { text = readFileSync(file, 'utf8'); } catch { return fallback; }
  try { return JSON.parse(text); } catch {
    warn(`Aviso: ${file.split(/[\\/]/).at(-1)} está corrupto; se ignora`);
    return fallback;
  }
}
