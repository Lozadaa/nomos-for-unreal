import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';

export type Context = {
  db: DatabaseSync;
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  dataDir?: string;
};
// metras 4.ª vuelta: `vfx`, `camara` e `ia` tienen grupo de skills (skills.ts) y no se podían crear
export const areas = ['gameplay', 'ui', 'vfx', 'camara', 'ia', 'escenarios', 'assets', 'animacion', 'audio', 'qa', 'builds'] as const;
export const states = [
  'pendiente', 'preparada', 'implementando', 'revisando', 'probando', 'integrando', 'cerrando', 'done'
] as const;

export function choice<T extends string>(value: string | null, values: readonly T[]): T | undefined {
  if (value === null) return undefined;
  if (!values.includes(value as T)) throw new Error('invalid_filter');
  return value as T;
}
export function text(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}
export function id(value: string): string {
  try { return decodeURIComponent(value); }
  catch { throw new Error('invalid_id'); }
}
