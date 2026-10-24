import { readdirSync } from 'node:fs';
import { relative, sep } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { CatalogEntry } from '../model.ts';
import { listCatalog } from '../repo/catalog.ts';
import { packTarget } from '../handlers/asset-migrate.ts';

export const candidateKinds = ['character', 'animation', 'metahuman-preset', 'pack'] as const;
export type CandidateKind = typeof candidateKinds[number];
/** Personaje que `character.setup` sabe montar: malla (o Blueprint del MetaHuman) en la ruta `/Game` que deja la migración. */
export type Candidate = {id: string; entry: CatalogEntry; label: string; description: string; mesh: string;
  targetSkeleton?: 'metahuman'; group: string; score: number; rank: number; thumbnail?: string};

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const origin: Record<string, string> = {engine: 'Plantilla del motor', megascans: 'Megascans', fab: 'Fab'};
const known: Record<string, string> = {SKM_Manny_Simple: 'Manny (maniquí UE5)', SKM_Quinn_Simple: 'Quinn (maniquí UE5)',
  SK_Mannequin: 'Maniquí UE4', SK_Mannequin_Female: 'Maniquí UE4 femenino'};
const words = (text: string, max: number) => text.split(/\s+/).filter(Boolean).slice(0, max).join(' ');
const meshLabel = (name: string) => known[name] ?? words(name.replace(/^SKM?_/, '').replace(/_Simple$/, '').replaceAll('_', ' '), 4);

/** Ruta `/Game/...` de un asset del pack (por nombre, sin extensión) tal como queda tras migrarlo; null si no está en disco. */
export function assetPath(entry: CatalogEntry, name: string): string | null {
  if (!entry.localPath) return null;
  try {
    const hit = readdirSync(entry.localPath, {recursive: true, withFileTypes: true})
      .find(d => d.isFile() && d.name.toLowerCase() === `${name.toLowerCase()}.uasset`);
    if (!hit) return null;
    const dir = relative(entry.localPath, hit.parentPath).split(sep).filter(Boolean);
    return ['/Game', ...packTarget(entry).rel.split('/'), ...dir, name].join('/');
  } catch { return null; }
}

/** Mallas de un pack con esqueleto: las `SKM_` si las hay (en UE5 `SK_` es el esqueleto), si no las `SK_`. */
function meshes(entry: CatalogEntry): string[] {
  const skm = entry.tags.filter(t => t.startsWith('SKM_'));
  return skm.length ? skm : entry.tags.filter(t => t.startsWith('SK_') && !/skeleton/i.test(t));
}

function expand(entry: CatalogEntry, project: string): Omit<Candidate, 'score'>[] {
  const description = `${origin[entry.source] ?? entry.source} · ${entry.license ?? 'licencia desconocida'} · coste 0`;
  const thumbnail = entry.thumbnailPath ? {thumbnail: `/catalog/${encodeURIComponent(entry.id)}/thumbnail`} : {};
  // catálogo propio → plantillas del motor → MetaHuman → Fab
  const rank = entry.projects.includes(project) ? 0 : entry.source === 'engine' ? 1 : entry.category === 'metahuman-preset' ? 2 : 3;
  if (entry.category === 'metahuman-preset') return [{id: entry.id, entry, label: words(/^metahuman\b/i.test(entry.name) ? entry.name : `MetaHuman ${entry.name}`, 4), description,
    mesh: `/Game/MetaHumans/${entry.name}/BP_${entry.name}`, targetSkeleton: 'metahuman', group: 'metahuman', rank, ...thumbnail}];
  const old = entry.tags.includes('skeleton:UE4_Mannequin') ? 0.5 : 0;
  if (!entry.tags.some(t => t.startsWith('skeleton:'))) return [];
  return meshes(entry).flatMap(name => {
    const mesh = assetPath(entry, name);
    return mesh ? [{id: `${entry.id}:${name}`, entry, label: meshLabel(name), description, mesh, group: entry.category, rank: rank + old, ...thumbnail}] : [];
  });
}

/** Hasta `max` candidatos: los que más palabras de la petición nombran y, a igualdad, el orden de fuentes; uno de cada tipo antes de repetir. */
export function pickCandidates(db: DatabaseSync, query: string, kinds: readonly string[], project: string, max = 3): Candidate[] {
  const terms = fold(query).match(/[\p{L}\p{N}]{4,}/gu) ?? [];
  const all = listCatalog(db).filter(e => kinds.includes(e.category))
    .flatMap(e => expand(e, project)).map((c, index) => {
      const hay = fold([c.label, c.entry.name, c.entry.category, ...c.entry.tags].join(' '));
      return {...c, index, score: terms.filter(t => hay.includes(t)).length};
    }).sort((a, b) => b.score - a.score || a.rank - b.rank || a.index - b.index);
  const groups = [...new Set(all.map(c => c.group))].map(g => all.find(c => c.group === g)!);
  const picked = [...groups, ...all.filter(c => !groups.includes(c))].slice(0, max);
  return picked.map(({index: _, ...c}) => c);
}
