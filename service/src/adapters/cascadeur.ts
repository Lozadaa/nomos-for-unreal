import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { quote, runLogged } from './process.ts';

/** Ejecutable de Cascadeur; en pruebas, node con el Cascadeur falso en `baseArgs`. */
export type Cascadeur = {bin: string; baseArgs?: string[]};
export const defaultCascadeur = 'C:\\Program Files\\Cascadeur\\cascadeur.exe';
/** Comandos de Kratos para Cascadeur (`kratos_job.py`): se importan desde aquí, sin copiarlos a Program Files. */
export const cascadeurScripts = join(import.meta.dirname, '..', '..', 'cascadeur');

export function findCascadeur(configured?: unknown): Cascadeur | null {
  const bin = typeof configured === 'string' && configured.trim() ? configured : defaultCascadeur;
  return existsSync(bin) ? {bin} : null;
}

/**
 * Job de Kratos sin ventana: `cascadeur.exe --run-python-code` (comprobado en 2026.2.3: corre con la plataforma
 * `qoffscreen`, `csc` disponible, y Cascadeur se cierra al terminar). El resultado lo escribe el job en su `report`.
 */
export function runJob(c: Cascadeur, jobFile: string, timeoutMs = 10 * 60_000) {
  const code = `import sys; sys.path.insert(0, r'${cascadeurScripts}'); import kratos_job; kratos_job.main(r'${jobFile}')`;
  return runLogged(c.bin, [...(c.baseArgs ?? []), '--run-python-code', code].map(quote), {timeoutMs});
}
