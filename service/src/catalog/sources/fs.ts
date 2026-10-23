import { readdirSync } from 'node:fs';

/** Subcarpetas de `path`; una carpeta ausente o ilegible es una fuente vacía, no un error. */
export function subdirs(path: string): string[] {
  try { return readdirSync(path, {withFileTypes: true}).filter(d => d.isDirectory()).map(d => d.name).sort(); }
  catch { return []; }
}
export function files(path: string, extension: string): string[] {
  try { return readdirSync(path, {withFileTypes: true}).filter(d => d.isFile() && d.name.toLowerCase().endsWith(extension)).map(d => d.name).sort(); }
  catch { return []; }
}
/** Carpetas de contenido que el Launcher añade junto al pack y que nunca son el pack. */
export const packDir = (name: string) => !name.startsWith('__') && name !== 'StarterContent';
